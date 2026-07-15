import { Page } from "puppeteer";
import { Asset } from "../../types";

/**
 * 资源提取器 - 从 DOM 中发现所有资源
 */

export interface ExtractedAssets {
  html: string;
  assets: Array<{ url: string; type: string; localPath: string }>;
  links: string[];
}

/**
 * 从页面中提取所有资源
 */
export async function extractAssets(page: Page, includeJs: boolean): Promise<ExtractedAssets> {
  return await page.evaluate((includeJs: boolean) => {
    const baseUrl = document.location.origin;
    const assets: Array<{ url: string; type: string; localPath: string }> = [];
    const links: string[] = [];

    // 1. 收集 CSS 链接
    document.querySelectorAll('link[rel="stylesheet"]').forEach((el) => {
      const href = (el as HTMLLinkElement).href;
      if (href) assets.push({ url: href, type: "css", localPath: "" });
    });

    // 2. 收集内联 <style> 中的 @import
    document.querySelectorAll("style").forEach((el) => {
      const text = el.textContent || "";
      const importRegex = /@import\s+(?:url\()?["']?([^"');\s]+)["']?\)?/g;
      let match;
      while ((match = importRegex.exec(text)) !== null) {
        try {
          const importUrl = new URL(match[1], document.location.href).href;
          assets.push({ url: importUrl, type: "css", localPath: "" });
        } catch {}
      }
    });

    // 3. 收集 preload/prefetch 链接
    document.querySelectorAll('link[rel="preload"], link[rel="prefetch"]').forEach((el) => {
      const href = (el as HTMLLinkElement).href;
      const as = (el as HTMLLinkElement).as;
      if (href) {
        let type: string = "other";
        if (as === "font") type = "font";
        else if (as === "image") type = "image";
        else if (as === "style") type = "css";
        else if (as === "script") type = "js";
        assets.push({ url: href, type, localPath: "" });
      }
    });

    // 4. 收集 JS 脚本
    if (includeJs) {
      document.querySelectorAll("script[src]").forEach((el) => {
        const src = (el as HTMLScriptElement).src;
        if (src) assets.push({ url: src, type: "js", localPath: "" });
      });
    }

    // 5. 收集图片(包括 srcset)
    collectImages(assets);

    // 6. 收集懒加载图片
    collectLazyImages(assets);

    // 7. 收集视频和音频
    collectMediaElements(assets);

    // 8. 收集 favicon 和 app icons
    document.querySelectorAll('link[rel*="icon"], link[rel="apple-touch-icon"]').forEach((el) => {
      const href = (el as HTMLLinkElement).href;
      if (href) assets.push({ url: href, type: "image", localPath: "" });
    });

    // 9. 收集计算样式中的 url() 引用
    collectComputedStyleUrls(assets);

    // 10. 收集 @font-face 字体
    collectFonts(assets);

    // 11. 收集 SVG 引用
    collectSvgReferences(assets);

    // 12. 收集 object/embed 元素
    collectObjectsAndEmbeds(assets);

    // 13. 收集 manifest
    document.querySelectorAll('link[rel="manifest"]').forEach((el) => {
      const href = (el as HTMLLinkElement).href;
      if (href) assets.push({ url: href, type: "other", localPath: "" });
    });

    // 14. 收集 noscript 中的图片
    collectNoscriptImages(assets);

    // 15. 收集同域链接
    document.querySelectorAll("a[href]").forEach((el) => {
      const href = (el as HTMLAnchorElement).href;
      if (href && href.startsWith(baseUrl) && !href.includes("#")) {
        links.push(href);
      }
    });

    // 获取最终渲染的 HTML
    const html = document.documentElement.outerHTML;

    return { html, assets, links };

    // === 辅助函数 ===

    function collectImages(assets: Array<{ url: string; type: string; localPath: string }>) {
      // 基础图片
      document.querySelectorAll("img[src]").forEach((el) => {
        const src = (el as HTMLImageElement).src;
        if (src && !src.startsWith("data:")) {
          assets.push({ url: src, type: "image", localPath: "" });
        }
      });

      // srcset 图片
      document.querySelectorAll("[srcset]").forEach((el) => {
        const srcset = el.getAttribute("srcset") || "";
        srcset.split(",").forEach((entry) => {
          const imgUrl = entry.trim().split(/\s+/)[0];
          if (imgUrl && !imgUrl.startsWith("data:")) {
            try {
              const fullUrl = new URL(imgUrl, document.location.href).href;
              assets.push({ url: fullUrl, type: "image", localPath: "" });
            } catch {}
          }
        });
      });

      // picture sources
      document.querySelectorAll("picture source").forEach((el) => {
        const srcset = el.getAttribute("srcset") || "";
        srcset.split(",").forEach((entry) => {
          const imgUrl = entry.trim().split(/\s+/)[0];
          if (imgUrl && !imgUrl.startsWith("data:")) {
            try {
              const fullUrl = new URL(imgUrl, document.location.href).href;
              assets.push({ url: fullUrl, type: "image", localPath: "" });
            } catch {}
          }
        });
      });
    }

    function collectLazyImages(assets: Array<{ url: string; type: string; localPath: string }>) {
      const lazyAttrs = ["data-src", "data-lazy-src", "data-original", "data-lazy", "data-url", "data-image"];
      document.querySelectorAll("img").forEach((el) => {
        for (const attr of lazyAttrs) {
          const val = el.getAttribute(attr);
          if (val && !val.startsWith("data:") && !val.startsWith("blob:")) {
            try {
              const fullUrl = new URL(val, document.location.href).href;
              assets.push({ url: fullUrl, type: "image", localPath: "" });
              // 提升到 src
              if (!el.src || el.src.startsWith("data:") || el.src.includes("placeholder") || el.src.includes("blank")) {
                el.src = fullUrl;
              }
            } catch {}
          }
        }

        // data-srcset
        const dataSrcset = el.getAttribute("data-srcset");
        if (dataSrcset) {
          dataSrcset.split(",").forEach((entry) => {
            const imgUrl = entry.trim().split(/\s+/)[0];
            if (imgUrl && !imgUrl.startsWith("data:")) {
              try {
                const fullUrl = new URL(imgUrl, document.location.href).href;
                assets.push({ url: fullUrl, type: "image", localPath: "" });
              } catch {}
            }
          });
          if (!el.getAttribute("srcset")) {
            el.setAttribute("srcset", dataSrcset);
          }
        }
      });

      // 懒加载背景图
      document.querySelectorAll("[data-bg], [data-background-image]").forEach((el) => {
        const bg = el.getAttribute("data-bg") || el.getAttribute("data-background-image");
        if (bg && !bg.startsWith("data:")) {
          try {
            const fullUrl = new URL(bg, document.location.href).href;
            assets.push({ url: fullUrl, type: "image", localPath: "" });
          } catch {}
        }
      });
    }

    function collectMediaElements(assets: Array<{ url: string; type: string; localPath: string }>) {
      // 视频源
      document.querySelectorAll("video[src], video source[src]").forEach((el) => {
        const src = (el as HTMLMediaElement).src || el.getAttribute("src") || "";
        if (src && !src.startsWith("data:")) {
          try {
            const fullUrl = new URL(src, document.location.href).href;
            assets.push({ url: fullUrl, type: "other", localPath: "" });
          } catch {}
        }
      });

      // 视频海报
      document.querySelectorAll("video[poster]").forEach((el) => {
        const poster = el.getAttribute("poster") || "";
        if (poster && !poster.startsWith("data:")) {
          try {
            const fullUrl = new URL(poster, document.location.href).href;
            assets.push({ url: fullUrl, type: "image", localPath: "" });
          } catch {}
        }
      });

      // 音频源
      document.querySelectorAll("audio[src], audio source[src]").forEach((el) => {
        const src = (el as HTMLMediaElement).src || el.getAttribute("src") || "";
        if (src && !src.startsWith("data:")) {
          try {
            const fullUrl = new URL(src, document.location.href).href;
            assets.push({ url: fullUrl, type: "other", localPath: "" });
          } catch {}
        }
      });
    }

    function collectComputedStyleUrls(assets: Array<{ url: string; type: string; localPath: string }>) {
      const urlsFromComputed = new Set<string>();
      document.querySelectorAll("*").forEach((el) => {
        const computed = window.getComputedStyle(el);
        const propsToCheck = ["backgroundImage", "listStyleImage", "borderImage", "maskImage", "cursor", "content", "shapeOutside"];
        for (const prop of propsToCheck) {
          const val = (computed as any)[prop];
          if (val && val !== "none") {
            const urlRegex = /url\(["']?([^"')]+)["']?\)/g;
            let match;
            while ((match = urlRegex.exec(val)) !== null) {
              if (!match[1].startsWith("data:")) {
                try {
                  urlsFromComputed.add(new URL(match[1], document.location.href).href);
                } catch {}
              }
            }
          }
        }
      });
      urlsFromComputed.forEach((u) => assets.push({ url: u, type: "image", localPath: "" }));
    }

    function collectFonts(assets: Array<{ url: string; type: string; localPath: string }>) {
      Array.from(document.styleSheets).forEach((sheet) => {
        try {
          Array.from(sheet.cssRules).forEach((rule: any) => {
            if (rule.type === CSSRule.FONT_FACE_RULE) {
              const src = rule.style.src || rule.cssText;
              const urlRegex = /url\(["']?([^"')]+)["']?\)/g;
              let match;
              while ((match = urlRegex.exec(src)) !== null) {
                if (!match[1].startsWith("data:")) {
                  try {
                    const fullUrl = new URL(match[1], document.location.href).href;
                    assets.push({ url: fullUrl, type: "font", localPath: "" });
                  } catch {}
                }
              }
            }
          });
        } catch (e) {}
      });
    }

    function collectSvgReferences(assets: Array<{ url: string; type: string; localPath: string }>) {
      // SVG <use> 外部引用
      document.querySelectorAll("use").forEach((el) => {
        const href = el.getAttribute("xlink:href") || el.getAttribute("href") || "";
        if (href && !href.startsWith("#") && !href.startsWith("data:")) {
          const svgUrl = href.split("#")[0];
          if (svgUrl) {
            try {
              const fullUrl = new URL(svgUrl, document.location.href).href;
              assets.push({ url: fullUrl, type: "image", localPath: "" });
            } catch {}
          }
        }
      });

      // SVG <image> 引用
      document.querySelectorAll("image").forEach((el) => {
        const href = el.getAttribute("href") || el.getAttribute("xlink:href") || "";
        if (href && !href.startsWith("data:")) {
          try {
            const fullUrl = new URL(href, document.location.href).href;
            assets.push({ url: fullUrl, type: "image", localPath: "" });
          } catch {}
        }
      });
    }

    function collectObjectsAndEmbeds(assets: Array<{ url: string; type: string; localPath: string }>) {
      document.querySelectorAll("object[data]").forEach((el) => {
        const data = el.getAttribute("data") || "";
        if (data && !data.startsWith("data:")) {
          try {
            const fullUrl = new URL(data, document.location.href).href;
            assets.push({ url: fullUrl, type: "other", localPath: "" });
          } catch {}
        }
      });

      document.querySelectorAll("embed[src]").forEach((el) => {
        const src = el.getAttribute("src") || "";
        if (src && !src.startsWith("data:")) {
          try {
            const fullUrl = new URL(src, document.location.href).href;
            assets.push({ url: fullUrl, type: "other", localPath: "" });
          } catch {}
        }
      });
    }

    function collectNoscriptImages(assets: Array<{ url: string; type: string; localPath: string }>) {
      document.querySelectorAll("noscript").forEach((noscript) => {
        const content = noscript.textContent || "";
        const imgSrcRegex = /<img[^>]+src=["']([^"']+)["']/g;
        let match;
        while ((match = imgSrcRegex.exec(content)) !== null) {
          const src = match[1];
          if (src && !src.startsWith("data:")) {
            try {
              const fullUrl = new URL(src, document.location.href).href;
              assets.push({ url: fullUrl, type: "image", localPath: "" });
            } catch {}
          }
        }

        // srcset in noscript
        const srcsetRegex = /srcset=["']([^"']+)["']/g;
        while ((match = srcsetRegex.exec(content)) !== null) {
          const srcset = match[1];
          srcset.split(",").forEach((entry) => {
            const imgUrl = entry.trim().split(/\s+/)[0];
            if (imgUrl && !imgUrl.startsWith("data:")) {
              try {
                const fullUrl = new URL(imgUrl, document.location.href).href;
                assets.push({ url: fullUrl, type: "image", localPath: "" });
              } catch {}
            }
          });
        }
      });
    }
  }, includeJs);
}