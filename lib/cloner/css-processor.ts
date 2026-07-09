import * as fs from "fs";
import * as path from "path";
import { Asset } from "../types";
import { RateLimiter } from "./rate-limiter";

const MAX_IMPORT_DEPTH = 3;
const CSS_DOWNLOAD_TIMEOUT = 12000;
const CSS_MAX_RETRIES = 2;

// UA 池用于 CSS 资源下载
const CSS_USER_AGENTS = [
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 13_5) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.5 Safari/605.1.15",
];

/**
 * 带重试的 CSS 资源下载
 */
async function fetchWithRetry(
  url: string,
  accept: string,
  retries = 0
): Promise<Response | null> {
  const ua = CSS_USER_AGENTS[(retries + Math.floor(Math.random() * CSS_USER_AGENTS.length)) % CSS_USER_AGENTS.length];

  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent": ua,
        "Accept": accept,
        "Accept-Encoding": "gzip, deflate, br",
        "Referer": new URL(url).origin + "/",
        "Sec-Fetch-Dest": accept.includes("css") ? "style" : "empty",
        "Sec-Fetch-Mode": "no-cors",
        "Sec-Fetch-Site": "cross-site",
      },
      signal: AbortSignal.timeout(CSS_DOWNLOAD_TIMEOUT),
      redirect: "follow",
    });

    if (!response.ok) {
      const retryable = response.status >= 500 || response.status === 429 || response.status === 403;
      if (retries < CSS_MAX_RETRIES && retryable) {
        await new Promise((r) => setTimeout(r, 800 * (retries + 1) + Math.random() * 500));
        return fetchWithRetry(url, accept, retries + 1);
      }
      return null;
    }

    return response;
  } catch {
    if (retries < CSS_MAX_RETRIES) {
      await new Promise((r) => setTimeout(r, 600 * (retries + 1)));
      return fetchWithRetry(url, accept, retries + 1);
    }
    return null;
  }
}

/**
 * 线程安全的索引分配器
 * 避免 Promise.all 并行处理时文件名冲突
 */
class AtomicIndex {
  private counter: number;
  constructor(initial: number) {
    this.counter = initial;
  }
  next(): number {
    return this.counter++;
  }
}

/**
 * Process CSS files: resolve @import and url() references,
 * download referenced assets, and rewrite paths to local.
 * Recursively processes nested @import up to MAX_IMPORT_DEPTH.
 *
 * 优化点：
 * 1. 使用 AtomicIndex 解决并发文件名冲突
 * 2. 带重试和 UA 轮换的下载
 * 3. 串行处理 CSS 文件（避免 newAssets 竞态）
 */
export async function processCssFiles(
  assets: Asset[],
  outputDir: string,
  rateLimiter?: RateLimiter
): Promise<Asset[]> {
  const cssAssets = assets.filter(
    (a) => a.type === "css" && a.localPath
  );
  const newAssets: Asset[] = [];
  const indexer = new AtomicIndex(assets.length);
  const processedUrls = new Set<string>();

  async function processSingleCss(cssAsset: Asset, depth: number) {
    if (depth > MAX_IMPORT_DEPTH) return;
    if (processedUrls.has(cssAsset.url)) return;
    processedUrls.add(cssAsset.url);

    const cssPath = path.join(outputDir, cssAsset.localPath);
    if (!fs.existsSync(cssPath)) return;

    let content = fs.readFileSync(cssPath, "utf-8");

    // Process @import first (may bring in more CSS files)
    const importRegex = /@import\s+(?:url\()?["']?([^"');\s]+)["']?\)?[^;]*;/g;
    let match;
    const imports: Array<{ full: string; url: string }> = [];

    while ((match = importRegex.exec(content)) !== null) {
      const rawUrl = match[1];
      if (rawUrl.startsWith("data:")) continue;
      imports.push({ full: match[0], url: rawUrl });
    }

    for (const { full, url: rawUrl } of imports) {
      try {
        const absoluteUrl = new URL(rawUrl, cssAsset.url).href;

        // Check if already downloaded
        const existing = assets.find((a) => a.url === absoluteUrl && a.localPath);
        if (existing) {
          const cssDir = path.dirname(cssAsset.localPath);
          const relativePath = path.relative(cssDir, existing.localPath);
          content = content.replace(full, `@import url("${relativePath}");`);
          await processSingleCss(existing, depth + 1);
          continue;
        }

        // 带重试的下载（集成限流器）
        if (rateLimiter) await rateLimiter.acquire();
        const response = await fetchWithRetry(absoluteUrl, "text/css,*/*;q=0.1");
        if (rateLimiter) {
          rateLimiter.release();
          if (response) rateLimiter.reportSuccess();
        }
        if (!response) continue;

        const dir = "assets/css";
        const idx = indexer.next();
        const filename = `import_${idx}.css`;
        const localPath = `${dir}/${filename}`;

        const fullDir = path.join(outputDir, dir);
        fs.mkdirSync(fullDir, { recursive: true });

        const text = await response.text();
        fs.writeFileSync(path.join(outputDir, localPath), text);

        const importedAsset: Asset = {
          url: absoluteUrl,
          type: "css",
          localPath,
        };
        newAssets.push(importedAsset);

        const cssDir = path.dirname(cssAsset.localPath);
        const relativePath = path.relative(cssDir, localPath);
        content = content.replace(full, `@import url("${relativePath}");`);

        // Recursively process
        await processSingleCss(importedAsset, depth + 1);
      } catch {
        // Skip failed imports
      }
    }

    // Resolve url() references in CSS
    const urlRegex = /url\(["']?([^"')]+)["']?\)/g;
    const urlMatches: Array<{ full: string; url: string }> = [];

    while ((match = urlRegex.exec(content)) !== null) {
      const rawUrl = match[1];
      if (rawUrl.startsWith("data:") || rawUrl.startsWith("#")) continue;
      // Skip already-resolved relative paths
      if (rawUrl.startsWith("assets/") || rawUrl.startsWith("../assets/") || rawUrl.startsWith("./assets/")) continue;
      urlMatches.push({ full: match[0], url: rawUrl });
    }

    // Process image-set() as well
    const imageSetRegex = /image-set\(([^)]+)\)/g;
    while ((match = imageSetRegex.exec(content)) !== null) {
      const inner = match[1];
      const innerUrlRegex = /["']([^"']+)["']/g;
      let innerMatch;
      while ((innerMatch = innerUrlRegex.exec(inner)) !== null) {
        const rawUrl = innerMatch[1];
        if (!rawUrl.startsWith("data:") && !rawUrl.startsWith("#")) {
          urlMatches.push({ full: `"${rawUrl}"`, url: rawUrl });
        }
      }
    }

    for (const { full, url: rawUrl } of urlMatches) {
      try {
        const absoluteUrl = new URL(rawUrl, cssAsset.url).href;

        // Check if already downloaded
        const existing = [...assets, ...newAssets].find(
          (a) => a.url === absoluteUrl && a.localPath
        );
        if (existing) {
          const cssDir = path.dirname(cssAsset.localPath);
          const relativePath = path.relative(cssDir, existing.localPath);
          content = content.replaceAll(full, `url("${relativePath}")`);
          continue;
        }

        const type = guessAssetType(absoluteUrl);

        // 带重试的下载（集成限流器）
        if (rateLimiter) await rateLimiter.acquire();
        const response = await fetchWithRetry(absoluteUrl, "*/*");
        if (rateLimiter) {
          rateLimiter.release();
          if (response) rateLimiter.reportSuccess();
        }
        if (!response) continue;

        const contentType = response.headers.get("content-type") || "";
        const ext = getExtFromUrl(absoluteUrl) || getExtFromMime(contentType);
        const dir = type === "font" ? "assets/fonts" : "assets/images";
        const idx = indexer.next();
        const filename = `css_${idx}${ext}`;
        const localPath = `${dir}/${filename}`;

        const fullDir = path.join(outputDir, dir);
        fs.mkdirSync(fullDir, { recursive: true });

        const buffer = Buffer.from(await response.arrayBuffer());

        // Inline small files as data URI (< 4KB)
        if (buffer.length < 4096 && type === "image") {
          const mimeType = contentType.split(";")[0] || guessMime(ext);
          const dataUri = `data:${mimeType};base64,${buffer.toString("base64")}`;
          content = content.replaceAll(full, `url("${dataUri}")`);
        } else {
          fs.writeFileSync(path.join(outputDir, localPath), buffer);

          const cssDir = path.dirname(cssAsset.localPath);
          const relativePath = path.relative(cssDir, localPath);
          content = content.replaceAll(full, `url("${relativePath}")`);

          newAssets.push({
            url: absoluteUrl,
            type,
            localPath,
          });
        }
      } catch {
        // Skip failed downloads
      }
    }

    fs.writeFileSync(cssPath, content);
  }

  // 串行处理 CSS 文件：避免 newAssets 共享状态竞态
  // （CSS 文件间可能互相引用同一资源，串行保证去重正确）
  for (const cssAsset of cssAssets) {
    await processSingleCss(cssAsset, 0);
  }

  return newAssets;
}

function guessAssetType(url: string): Asset["type"] {
  const lower = url.toLowerCase().split("?")[0];
  if (/\.(woff2?|ttf|otf|eot)$/.test(lower)) return "font";
  if (/\.(png|jpe?g|gif|svg|webp|avif|ico|bmp|tiff?)$/.test(lower)) return "image";
  if (/\.(css)$/.test(lower)) return "css";
  return "other";
}

function getExtFromUrl(url: string): string {
  try {
    const pathname = new URL(url).pathname;
    const ext = path.extname(pathname).split("?")[0];
    if (ext && ext.length <= 6) return ext;
  } catch {}
  return "";
}

function getExtFromMime(contentType: string): string {
  const map: Record<string, string> = {
    "image/png": ".png",
    "image/jpeg": ".jpg",
    "image/gif": ".gif",
    "image/svg+xml": ".svg",
    "image/webp": ".webp",
    "image/avif": ".avif",
    "font/woff2": ".woff2",
    "font/woff": ".woff",
    "font/ttf": ".ttf",
    "font/otf": ".otf",
    "application/font-woff2": ".woff2",
    "application/font-woff": ".woff",
  };
  for (const [key, val] of Object.entries(map)) {
    if (contentType.includes(key)) return val;
  }
  return "";
}

function guessMime(ext: string): string {
  const map: Record<string, string> = {
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".gif": "image/gif",
    ".svg": "image/svg+xml",
    ".webp": "image/webp",
    ".avif": "image/avif",
    ".ico": "image/x-icon",
  };
  return map[ext] || "application/octet-stream";
}
