import * as cheerio from "cheerio";
import { Asset } from "../types";

/**
 * Rewrite all asset URLs in HTML to point to local paths.
 */
export function rewriteHtml(
  html: string,
  assets: Asset[],
  options: { includeJs: boolean; pageFilename?: string; pageUrl: string }
): string {
  const $ = cheerio.load(html);

  // Build URL → localPath map (multiple lookup strategies)
  const urlMap = new Map<string, string>();
  for (const asset of assets) {
    if (asset.localPath) {
      urlMap.set(asset.url, asset.localPath);
      try {
        const parsed = new URL(asset.url);
        urlMap.set(parsed.pathname, asset.localPath);
        if (parsed.search) {
          urlMap.set(parsed.pathname + parsed.search, asset.localPath);
        }
        // Also map without protocol for protocol-relative URLs
        urlMap.set("//" + parsed.host + parsed.pathname + parsed.search, asset.localPath);
        // Map decoded URL (handles %20 vs space, encoded Chinese chars, etc.)
        const decodedUrl = decodeURIComponent(asset.url);
        if (decodedUrl !== asset.url) {
          urlMap.set(decodedUrl, asset.localPath);
        }
        const decodedPathname = decodeURIComponent(parsed.pathname);
        if (decodedPathname !== parsed.pathname) {
          urlMap.set(decodedPathname, asset.localPath);
          if (parsed.search) {
            urlMap.set(decodedPathname + parsed.search, asset.localPath);
          }
        }
      } catch {}
    }
  }

  const resolve = (raw: string): string | undefined => {
    if (!raw || raw.startsWith("data:") || raw.startsWith("#") || raw.startsWith("blob:")) return undefined;
    // Try direct match first
    const direct = urlMap.get(raw);
    if (direct) return direct;

    // Try URL-decoded version
    try {
      const decoded = decodeURIComponent(raw);
      if (decoded !== raw) {
        const decodedMatch = urlMap.get(decoded);
        if (decodedMatch) return decodedMatch;
      }
    } catch {}

    // Handle protocol-relative URLs (//cdn.example.com/...)
    if (raw.startsWith("//")) {
      const withHttps = "https:" + raw;
      const found = urlMap.get(withHttps);
      if (found) return found;
      const withHttp = "http:" + raw;
      const foundHttp = urlMap.get(withHttp);
      if (foundHttp) return foundHttp;
    }

    // Resolve to absolute and try again
    try {
      const absolute = new URL(raw, options.pageUrl).href;
      const found = urlMap.get(absolute);
      if (found) return found;
      // Try just pathname+search
      const parsed = new URL(absolute);
      const byPathSearch = urlMap.get(parsed.pathname + parsed.search);
      if (byPathSearch) return byPathSearch;
      const byPath = urlMap.get(parsed.pathname);
      if (byPath) return byPath;
      // Try decoded pathname
      const decodedPathname = decodeURIComponent(parsed.pathname);
      if (decodedPathname !== parsed.pathname) {
        const byDecoded = urlMap.get(decodedPathname + parsed.search) || urlMap.get(decodedPathname);
        if (byDecoded) return byDecoded;
      }
    } catch {}
    return undefined;
  };

  // 将未能本地化的路径转为绝对 URL（保证预览时能从原始服务器加载）
  const toAbsolute = (raw: string): string => {
    if (!raw || raw.startsWith("data:") || raw.startsWith("blob:") || raw.startsWith("#")) return raw;
    // 已经是完整 URL
    if (raw.startsWith("http://") || raw.startsWith("https://") || raw.startsWith("//")) return raw;
    // 相对路径或绝对路径，转为完整 URL
    try {
      return new URL(raw, options.pageUrl).href;
    } catch {
      return raw;
    }
  };

  // Rewrite <link rel="stylesheet" href="...">
  $('link[rel="stylesheet"]').each((_, el) => {
    const href = $(el).attr("href");
    if (href) {
      const local = resolve(href);
      if (local) {
        $(el).attr("href", local);
      } else {
        // 回退：转为绝对 URL 确保预览时能加载
        $(el).attr("href", toAbsolute(href));
      }
    }
  });

  // Rewrite <link rel="preload"/"prefetch" href="...">
  $('link[rel="preload"], link[rel="prefetch"]').each((_, el) => {
    const href = $(el).attr("href");
    if (href) {
      const local = resolve(href);
      if (local) {
        $(el).attr("href", local);
      } else {
        $(el).attr("href", toAbsolute(href));
      }
    }
  });

  // Rewrite <script src="...">
  if (options.includeJs) {
    $("script[src]").each((_, el) => {
      const src = $(el).attr("src");
      if (src) {
        const local = resolve(src);
        if (local) {
          $(el).attr("src", local);
        } else {
          $(el).attr("src", toAbsolute(src));
        }
      }
    });
  } else {
    $("script[src]").remove();
    $("script:not([src])").remove();
  }

  // Rewrite <img src="...">
  $("img[src]").each((_, el) => {
    const src = $(el).attr("src");
    if (src && !src.startsWith("data:")) {
      const local = resolve(src);
      if (local) {
        $(el).attr("src", local);
      } else {
        $(el).attr("src", toAbsolute(src));
      }
    }
  });

  // Rewrite lazy-loaded image attributes (data-src, data-lazy-src, etc.)
  const lazyAttrs = ["data-src", "data-lazy-src", "data-original", "data-lazy", "data-url", "data-image"];
  $("img").each((_, el) => {
    for (const attr of lazyAttrs) {
      const val = $(el).attr(attr);
      if (val && !val.startsWith("data:")) {
        const local = resolve(val);
        if (local) {
          $(el).attr(attr, local);
          // If src is empty/placeholder, also set src to the resolved local path
          const currentSrc = $(el).attr("src") || "";
          if (!currentSrc || currentSrc.startsWith("data:") || currentSrc.includes("placeholder") || currentSrc.includes("blank") || currentSrc.includes("spacer")) {
            $(el).attr("src", local);
          }
        }
      }
    }
    // Rewrite data-srcset
    const dataSrcset = $(el).attr("data-srcset");
    if (dataSrcset) {
      const newSrcset = dataSrcset
        .split(",")
        .map((entry) => {
          const parts = entry.trim().split(/\s+/);
          const imgUrl = parts[0];
          const local = resolve(imgUrl);
          if (local) parts[0] = local;
          return parts.join(" ");
        })
        .join(", ");
      $(el).attr("data-srcset", newSrcset);
    }
  });

  // Rewrite lazy background images (data-bg, data-background-image)
  $("[data-bg], [data-background-image]").each((_, el) => {
    const dataBg = $(el).attr("data-bg");
    if (dataBg) {
      const local = resolve(dataBg);
      if (local) $(el).attr("data-bg", local);
    }
    const dataBgImg = $(el).attr("data-background-image");
    if (dataBgImg) {
      const local = resolve(dataBgImg);
      if (local) $(el).attr("data-background-image", local);
    }
  });

  // Rewrite srcset on any element
  $("[srcset]").each((_, el) => {
    const srcset = $(el).attr("srcset");
    if (srcset) {
      const newSrcset = srcset
        .split(",")
        .map((entry) => {
          const parts = entry.trim().split(/\s+/);
          const imgUrl = parts[0];
          const local = resolve(imgUrl);
          if (local) parts[0] = local;
          return parts.join(" ");
        })
        .join(", ");
      $(el).attr("srcset", newSrcset);
    }
  });

  // Rewrite video sources and poster
  $("video").each((_, el) => {
    const src = $(el).attr("src");
    if (src) {
      const local = resolve(src);
      if (local) $(el).attr("src", local);
    }
    const poster = $(el).attr("poster");
    if (poster) {
      const local = resolve(poster);
      if (local) $(el).attr("poster", local);
    }
  });
  $("video source[src]").each((_, el) => {
    const src = $(el).attr("src");
    if (src) {
      const local = resolve(src);
      if (local) $(el).attr("src", local);
    }
  });

  // Rewrite audio sources
  $("audio[src]").each((_, el) => {
    const src = $(el).attr("src");
    if (src) {
      const local = resolve(src);
      if (local) $(el).attr("src", local);
    }
  });
  $("audio source[src]").each((_, el) => {
    const src = $(el).attr("src");
    if (src) {
      const local = resolve(src);
      if (local) $(el).attr("src", local);
    }
  });

  // Rewrite favicon and icons
  $('link[rel*="icon"], link[rel="apple-touch-icon"]').each((_, el) => {
    const href = $(el).attr("href");
    if (href) {
      const local = resolve(href);
      if (local) $(el).attr("href", local);
    }
  });

  // Rewrite Open Graph and Twitter Card images
  $('meta[property="og:image"], meta[property="og:image:url"], meta[name="twitter:image"]').each((_, el) => {
    const content = $(el).attr("content");
    if (content) {
      const local = resolve(content);
      if (local) $(el).attr("content", local);
    }
  });

  // Rewrite <object data="...">
  $("object[data]").each((_, el) => {
    const data = $(el).attr("data");
    if (data) {
      const local = resolve(data);
      if (local) $(el).attr("data", local);
    }
  });

  // Rewrite <embed src="...">
  $("embed[src]").each((_, el) => {
    const src = $(el).attr("src");
    if (src) {
      const local = resolve(src);
      if (local) $(el).attr("src", local);
    }
  });

  // Rewrite <use xlink:href="..."> in SVGs
  $("use").each((_, el) => {
    const href = $(el).attr("xlink:href") || $(el).attr("href");
    if (href && !href.startsWith("#")) {
      const local = resolve(href.split("#")[0]);
      const fragment = href.includes("#") ? "#" + href.split("#")[1] : "";
      if (local) {
        $(el).attr("xlink:href", local + fragment);
        $(el).attr("href", local + fragment);
      }
    }
  });

  // Rewrite <image href="..."> in SVGs
  $("image").each((_, el) => {
    const href = $(el).attr("href") || $(el).attr("xlink:href");
    if (href && !href.startsWith("data:")) {
      const local = resolve(href);
      if (local) {
        $(el).attr("href", local);
        $(el).attr("xlink:href", local);
      }
    }
  });

  // Rewrite <input type="image" src="...">
  $('input[type="image"][src]').each((_, el) => {
    const src = $(el).attr("src");
    if (src) {
      const local = resolve(src);
      if (local) $(el).attr("src", local);
    }
  });

  // Rewrite inline style background-image url()
  $("[style]").each((_, el) => {
    let style = $(el).attr("style") || "";
    style = rewriteUrlsInString(style, resolve);
    $(el).attr("style", style);
  });

  // Rewrite CSS url() in <style> tags
  $("style").each((_, el) => {
    let content = $(el).html() || "";
    content = rewriteUrlsInString(content, resolve);
    $(el).html(content);
  });

  // Remove <base> tag to avoid path resolution issues in cloned page
  $("base").remove();

  return $.html();
}

/**
 * Find all url() in a string and replace resolved ones with local paths.
 */
function rewriteUrlsInString(
  content: string,
  resolve: (raw: string) => string | undefined
): string {
  const urlRegex = /url\(["']?([^"')]+)["']?\)/g;
  let match;
  const replacements: Array<[string, string]> = [];
  while ((match = urlRegex.exec(content)) !== null) {
    const rawUrl = match[1];
    const local = resolve(rawUrl);
    if (local) replacements.push([match[0], `url("${local}")`]);
  }
  for (const [from, to] of replacements) {
    content = content.replaceAll(from, to);
  }
  return content;
}
