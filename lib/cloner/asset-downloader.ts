import { Asset } from "../types";
import { RateLimiter } from "./rate-limiter";
import { config } from "../config";
import { createErrorFromResponse, NetworkError, TimeoutError } from "../errors";
import * as fs from "fs";
import * as path from "path";

// 增强的 User-Agent 池，覆盖更多真实浏览器
const USER_AGENTS = [
  // Chrome on macOS
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 13_5_1) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
  // Chrome on Windows
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  // Chrome on Linux
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  // Safari on macOS
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Safari/605.1.15",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 13_5) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.5 Safari/605.1.15",
  // Firefox on Windows
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:120.0) Gecko/20100101 Firefox/120.0",
  // Edge on Windows
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0",
];

// 真实浏览器的 Accept-Language 变体
const ACCEPT_LANGUAGES = [
  "zh-CN,zh;q=0.9,en;q=0.8",
  "en-US,en;q=0.9",
  "zh-CN,zh;q=0.9,en-US;q=0.8,en;q=0.7",
  "en-US,en;q=0.9,zh-CN;q=0.8,zh;q=0.7",
];

// Sec-CH-UA 变体（Chrome Client Hints）
const SEC_CH_UA_VARIANTS = [
  '"Not_A Brand";v="8", "Chromium";v="120", "Google Chrome";v="120"',
  '"Chromium";v="121", "Not(A:Brand";v="24", "Google Chrome";v="121"',
  '"Not A(Brand";v="99", "Google Chrome";v="121", "Chromium";v="121"',
];

function getExtension(url: string, contentType?: string, buffer?: Buffer): string {
  // Try to get from URL path (ignore query params and fragments)
  try {
    const pathname = new URL(url).pathname;
    const ext = path.extname(pathname).split("?")[0];
    if (ext && ext.length <= 6) return ext;
  } catch {}

  // Fallback to content-type
  if (contentType) {
    const map: Record<string, string> = {
      "text/css": ".css",
      "application/javascript": ".js",
      "text/javascript": ".js",
      "image/png": ".png",
      "image/jpeg": ".jpg",
      "image/gif": ".gif",
      "image/svg+xml": ".svg",
      "image/webp": ".webp",
      "image/avif": ".avif",
      "image/x-icon": ".ico",
      "image/vnd.microsoft.icon": ".ico",
      "image/bmp": ".bmp",
      "image/tiff": ".tiff",
      "font/woff2": ".woff2",
      "font/woff": ".woff",
      "font/ttf": ".ttf",
      "font/otf": ".otf",
      "application/font-woff2": ".woff2",
      "application/font-woff": ".woff",
      "application/x-font-ttf": ".ttf",
      "application/x-font-opentype": ".otf",
      "video/mp4": ".mp4",
      "video/webm": ".webm",
      "audio/mpeg": ".mp3",
      "audio/ogg": ".ogg",
      "application/json": ".json",
    };
    for (const [key, val] of Object.entries(map)) {
      if (contentType.includes(key)) return val;
    }
  }

  // Last resort: detect from magic bytes
  if (buffer && buffer.length >= 4) {
    if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) return ".png";
    if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return ".jpg";
    if (buffer[0] === 0x47 && buffer[1] === 0x49 && buffer[2] === 0x46) return ".gif";
    if (buffer[0] === 0x52 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x46) return ".webp";
    if (buffer.length >= 12 && buffer.slice(4, 12).toString() === "ftypavif") return ".avif";
    if (buffer[0] === 0x00 && buffer[1] === 0x00 && buffer[2] === 0x01 && buffer[3] === 0x00) return ".ico";
    if (buffer[0] === 0x3c && buffer.slice(0, 100).toString().includes("<svg")) return ".svg";
    // woff2
    if (buffer[0] === 0x77 && buffer[1] === 0x4f && buffer[2] === 0x46 && buffer[3] === 0x32) return ".woff2";
    // woff
    if (buffer[0] === 0x77 && buffer[1] === 0x4f && buffer[2] === 0x46 && buffer[3] === 0x46) return ".woff";
  }

  return "";
}

function getAssetDir(type: Asset["type"]): string {
  switch (type) {
    case "css":
      return "assets/css";
    case "js":
      return "assets/js";
    case "image":
      return "assets/images";
    case "font":
      return "assets/fonts";
    default:
      return "assets/other";
  }
}

/**
 * 生成随机的请求指纹，模拟真实浏览器行为
 */
function generateRequestFingerprint(retries: number) {
  const uaIndex = (retries + Math.floor(Math.random() * USER_AGENTS.length)) % USER_AGENTS.length;
  const langIndex = Math.floor(Math.random() * ACCEPT_LANGUAGES.length);
  const secChUaIndex = Math.floor(Math.random() * SEC_CH_UA_VARIANTS.length);

  return {
    userAgent: USER_AGENTS[uaIndex],
    acceptLanguage: ACCEPT_LANGUAGES[langIndex],
    secChUa: SEC_CH_UA_VARIANTS[secChUaIndex],
  };
}

/**
 * 智能重试延迟策略
 * - 第1次重试：500-800ms（快速重试，可能是临时网络抖动）
 * - 第2次重试：1500-2500ms（中等延迟，避免频率限制）
 * - 第3次重试：3000-5000ms（长延迟，给服务器足够恢复时间）
 */
function getRetryDelay(retries: number): number {
  const baseDelays = [500, 1500, 3000];
  const jitterRanges = [300, 1000, 2000];

  const baseDelay = baseDelays[Math.min(retries, baseDelays.length - 1)];
  const jitter = Math.random() * jitterRanges[Math.min(retries, jitterRanges.length - 1)];

  return baseDelay + jitter;
}

async function downloadOne(
  asset: Asset,
  outputDir: string,
  index: number,
  pageUrl?: string,
  retries = 0
): Promise<Asset> {
  try {
    // Normalize protocol-relative URLs (//cdn.example.com/...) to https
    let fetchUrl = asset.url;
    if (fetchUrl.startsWith("//")) {
      fetchUrl = "https:" + fetchUrl;
    }

    // Use page URL as Referer (CDNs often check this), fall back to asset origin
    let referer: string;
    try {
      referer = pageUrl || new URL(fetchUrl).origin + "/";
    } catch {
      referer = "";
    }

    // 生成随机请求指纹
    const fingerprint = generateRequestFingerprint(retries);

    // 智能重试延迟
    if (retries > 0) {
      const delay = getRetryDelay(retries - 1);
      await new Promise((r) => setTimeout(r, delay));
    }

    // 构建请求 headers（过滤掉 undefined 值）
    const headers: Record<string, string> = {
      "User-Agent": fingerprint.userAgent,
      "Accept": asset.type === "image"
        ? "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8"
        : asset.type === "css"
        ? "text/css,*/*;q=0.1"
        : asset.type === "font"
        ? "font/woff2,font/woff,font/ttf,font/otf,*/*;q=0.1"
        : asset.type === "js"
        ? "application/javascript,*/*;q=0.8"
        : "*/*",
      "Accept-Encoding": "gzip, deflate, br",
      "Accept-Language": fingerprint.acceptLanguage,
      "Referer": referer,
      "Sec-Fetch-Dest": asset.type === "image" ? "image" : asset.type === "css" ? "style" : asset.type === "font" ? "font" : "empty",
      "Sec-Fetch-Mode": "no-cors",
      "Sec-Fetch-Site": "cross-site",
      "Sec-CH-UA": fingerprint.secChUa,
      "Sec-CH-UA-Mobile": "?0",
      "Sec-CH-UA-Platform": '"macOS"',
      "DNT": "1",
      "Cache-Control": "no-cache",
      "Pragma": "no-cache",
    };

    // 添加 Origin（如果有 referer）
    if (referer) {
      try {
        headers["Origin"] = new URL(referer).origin;
      } catch {}
    }

    const response = await fetch(fetchUrl, {
      headers,
      signal: AbortSignal.timeout(config.download.timeout),
      redirect: "follow",
    });

    if (!response.ok) {
      const status = response.status;

      // 创建标准化错误
      const error = createErrorFromResponse(status, fetchUrl);

      if (retries < config.download.maxRetries && error.retryable) {
        if (retries === 0) {
          console.warn(`⚠️  ${error.userMessage}，正在重试: ${asset.url.substring(0, 60)}... (${status})`);
        }
        // 指数退避
        const backoff = 1000 * (retries + 1) + Math.random() * 1000;
        await new Promise((r) => setTimeout(r, backoff));
        return downloadOne(asset, outputDir, index, pageUrl, retries + 1);
      }

      // 重试次数耗尽或不可重试的错误
      if (retries === config.download.maxRetries) {
        console.warn(`❌ 下载失败 (${status} after ${config.download.maxRetries} retries): ${asset.url.substring(0, 60)}...`);
      } else {
        console.warn(`❌ 下载失败 (${status}, 不可重试): ${asset.url.substring(0, 60)}...`);
      }
      return asset;
    }

    const contentType = response.headers.get("content-type") || "";
    const buffer = Buffer.from(await response.arrayBuffer());

    // Skip empty responses
    if (buffer.length === 0) return asset;

    const ext = getExtension(asset.url, contentType, buffer);
    const dir = getAssetDir(asset.type);
    const filename = `${index}${ext}`;
    const localPath = `${dir}/${filename}`;

    const fullDir = path.join(outputDir, dir);
    fs.mkdirSync(fullDir, { recursive: true });

    fs.writeFileSync(path.join(outputDir, localPath), buffer);

    return { ...asset, localPath };
  } catch (err) {
    // 判断错误类型
    const errorMsg = err instanceof Error ? err.message : String(err);
    let error;

    if (errorMsg.includes("timeout") || errorMsg.includes("timed out") || errorMsg.includes("abort")) {
      error = new TimeoutError(errorMsg);
    } else {
      error = new NetworkError(errorMsg);
    }

    // 网络错误、超时等，进行智能重试
    if (retries < config.download.maxRetries && error.retryable) {
      if (retries === 0) {
        console.warn(`⚠️  ${error.userMessage}，正在重试 (${retries + 1}/${config.download.maxRetries}): ${asset.url.substring(0, 60)}...`);
      }

      // 智能退避策略
      const backoff = getRetryDelay(retries);
      await new Promise((r) => setTimeout(r, backoff));
      return downloadOne(asset, outputDir, index, pageUrl, retries + 1);
    }

    // 重试次数耗尽
    console.warn(`❌ 下载最终失败 (${config.download.maxRetries} retries): ${asset.url.substring(0, 60)}... (${errorMsg})`);
    return asset;
  }
}

export async function downloadAssets(
  assets: Asset[],
  outputDir: string,
  onProgress?: (downloaded: number, total: number, stats?: { downloadedBytes: number; elapsedMs: number }) => void,
  pageUrl?: string,
  rateLimiter?: RateLimiter
): Promise<Asset[]> {
  const limiter = rateLimiter || new RateLimiter();
  const concurrency = limiter.getEffectiveConcurrency();
  const results: Asset[] = new Array(assets.length);
  let nextIndex = 0;
  let completed = 0;
  let succeeded = 0;
  let failed = 0;
  let totalBytes = 0;
  const startTime = Date.now();

  console.log(`📥 开始下载 ${assets.length} 个资源 (并发数: ${concurrency}, 自适应限流: 开启)`);

  // 随机打乱下载顺序（避免按 DOM 顺序的机械访问模式）
  const indices = Array.from({ length: assets.length }, (_, i) => i);
  for (let i = indices.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [indices[i], indices[j]] = [indices[j], indices[i]];
  }

  async function worker() {
    while (true) {
      const workIdx = nextIndex++;
      if (workIdx >= assets.length) break;

      const assetIdx = indices[workIdx];
      const asset = assets[assetIdx];

      // 限流器控制：等待槽位
      await limiter.acquire();

      try {
        const result = await downloadOne(asset, outputDir, assetIdx, pageUrl);
        results[assetIdx] = result;

        if (result.localPath) {
          succeeded++;
          limiter.reportSuccess();

          // 统计下载字节数（用于计算速度）
          try {
            const stats = fs.statSync(path.join(outputDir, result.localPath));
            totalBytes += stats.size;
          } catch {}
        } else {
          failed++;
        }
      } catch {
        results[assetIdx] = asset;
        failed++;
      } finally {
        limiter.release();
        completed++;

        // 计算统计信息并回调
        const elapsedMs = Date.now() - startTime;
        onProgress?.(completed, assets.length, { downloadedBytes: totalBytes, elapsedMs });
      }

      // 批次间延迟（每完成 concurrency 个请求后）
      if (completed % concurrency === 0) {
        const delay = limiter.getEffectiveInterBatchDelay();
        if (delay > 0) {
          await new Promise((r) => setTimeout(r, delay));
        }
      }
    }
  }

  // 启动 worker pool
  const workers = Array.from(
    { length: Math.min(concurrency, assets.length) },
    () => worker()
  );
  await Promise.all(workers);

  // 最终统计
  const successRate = assets.length > 0 ? ((succeeded / assets.length) * 100).toFixed(1) : "0";
  console.log(`✅ 下载完成: ${succeeded}/${assets.length} (${successRate}%) | 失败: ${failed}`);

  const state = limiter.getState();
  if (state.totalThrottleEvents > 0) {
    console.log(`🚦 限流统计: 触发 ${state.totalThrottleEvents} 次, 最终倍率 ${state.throttleMultiplier.toFixed(1)}x`);
  }

  if (failed > 0) {
    const failedAssets = results.filter((a) => !a.localPath);
    console.warn(`⚠️  以下资源下载失败:`);
    failedAssets.slice(0, 10).forEach((a) => {
      console.warn(`   - ${a.url.substring(0, 80)}`);
    });
    if (failedAssets.length > 10) {
      console.warn(`   ... 及其他 ${failedAssets.length - 10} 个资源`);
    }
  }

  return results;
}
