import * as cheerio from "cheerio";

/**
 * 规范化 URL，用于去重比较
 * - 移除尾部斜杠
 * - 移除默认端口
 * - 排序 query 参数
 * - 统一小写 hostname
 * - 移除 fragment
 */
function normalizeUrl(rawUrl: string): string {
  try {
    const url = new URL(rawUrl);

    // 统一小写 hostname
    url.hostname = url.hostname.toLowerCase();

    // 移除默认端口
    if ((url.protocol === "http:" && url.port === "80") ||
        (url.protocol === "https:" && url.port === "443")) {
      url.port = "";
    }

    // 移除 fragment
    url.hash = "";

    // 排序 query 参数（确保 ?a=1&b=2 和 ?b=2&a=1 被视为相同）
    if (url.search) {
      const params = new URLSearchParams(url.search);
      const sorted = new URLSearchParams([...params.entries()].sort());
      url.search = sorted.toString();
    }

    // 移除尾部斜杠（但保留根路径 "/"）
    let result = url.href;
    if (result.endsWith("/") && url.pathname !== "/") {
      result = result.slice(0, -1);
    }

    return result;
  } catch {
    return rawUrl;
  }
}

/**
 * Discover same-domain links on a page for multi-page crawling.
 * 优化点：
 * 1. URL 规范化后去重，避免重复爬取同一页面
 * 2. 过滤更多无意义的链接类型
 * 3. 优先爬取内容页面（排除登录、注册等功能页）
 */
export function discoverLinks(
  html: string,
  baseUrl: string,
  maxDepth: number,
  currentDepth: number
): string[] {
  if (currentDepth >= maxDepth) return [];

  const $ = cheerio.load(html);
  const origin = new URL(baseUrl).origin;
  const links = new Map<string, string>(); // normalizedUrl -> originalUrl

  $("a[href]").each((_, el) => {
    const href = $(el).attr("href");
    if (!href) return;

    try {
      const resolved = new URL(href, baseUrl).href;
      // Only follow same-origin links
      if (!resolved.startsWith(origin)) return;
      // Skip anchors, mailto, tel, javascript
      if (href.startsWith("#") || href.startsWith("mailto:") || href.startsWith("tel:") || href.startsWith("javascript:")) return;
      // Skip file downloads
      if (/\.(pdf|zip|tar|gz|exe|dmg|mp4|mp3|avi|mov|doc|docx|xls|xlsx|ppt|pptx|rar|7z)$/i.test(resolved)) return;
      // Skip common non-content paths
      if (/\/(login|signin|signup|register|logout|auth|oauth|callback|admin|wp-admin|api\/|_next\/|static\/|assets\/)\b/i.test(resolved)) return;

      // Normalize and deduplicate
      const normalized = normalizeUrl(resolved);
      const normalizedBase = normalizeUrl(baseUrl);
      if (normalized && normalized !== normalizedBase && !links.has(normalized)) {
        links.set(normalized, resolved);
      }
    } catch {
      // Invalid URL, skip
    }
  });

  return [...links.values()];
}
