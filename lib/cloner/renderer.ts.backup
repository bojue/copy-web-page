import puppeteer, { Browser, Page, CDPSession } from "puppeteer";
import { Asset, PageTypeDetection } from "../types";
import { browserPool } from "./browser-pool";

export interface RenderResult {
  html: string;
  assets: Asset[];
  links: string[]; // same-domain links found on the page
  inlinedCss?: string; // fully computed CSS for all elements
  canvasSnapshots?: Array<{ selector: string; dataUrl: string }>;
  iframeContents?: Array<{ selector: string; html: string; assets: Asset[] }>;
  contentValidation?: {
    bodyTextLength: number;
    hasImages: boolean;
    hasLinks: boolean;
    hasErrorIndicator: boolean;
    isEmpty: boolean;
    title: string;
  };
  pageTypeDetection?: PageTypeDetection;
}

interface CapturedResource {
  url: string;
  type: string;
  mimeType: string;
  body?: string; // base64 encoded
}

/**
 * Uses CDP (Chrome DevTools Protocol) to intercept ALL network traffic,
 * bypassing CORS restrictions and capturing every resource the browser loads.
 */
async function setupCDPInterception(page: Page): Promise<{
  getResources: () => CapturedResource[];
  cleanup: () => Promise<void>;
}> {
  const cdp: CDPSession = await page.createCDPSession();
  const resources: CapturedResource[] = [];
  const requestMap = new Map<string, { url: string; type: string }>();

  // Enable network domain with response body access
  await cdp.send("Network.enable");

  // Track all requests
  cdp.on("Network.requestWillBeSent", (event: any) => {
    requestMap.set(event.requestId, {
      url: event.request.url,
      type: event.type || "Other",
    });
  });

  // Capture response bodies
  cdp.on("Network.responseReceived", async (event: any) => {
    const req = requestMap.get(event.requestId);
    if (!req) return;

    const mimeType = event.response.mimeType || "";
    const url = req.url;

    // Skip data URIs and blob URIs
    if (url.startsWith("data:") || url.startsWith("blob:")) return;

    // Determine asset type from mime
    let type = "other";
    if (mimeType.includes("css")) type = "css";
    else if (mimeType.includes("javascript")) type = "js";
    else if (mimeType.includes("image")) type = "image";
    else if (mimeType.includes("font")) type = "font";
    else if (mimeType.includes("video")) type = "video";
    else if (mimeType.includes("audio")) type = "audio";

    resources.push({ url, type, mimeType });
  });

  return {
    getResources: () => resources,
    cleanup: async () => {
      try { await cdp.detach(); } catch {}
    },
  };
}

/**
 * Extract resources that CDP couldn't get response bodies for
 * by using Fetch.enable which allows interception of cross-origin responses.
 */
async function setupFetchInterception(page: Page): Promise<{
  getCapturedBodies: () => Map<string, Buffer>;
}> {
  const cdp: CDPSession = await page.createCDPSession();
  const bodies = new Map<string, Buffer>();

  await cdp.send("Fetch.enable", {
    patterns: [{ requestStage: "Response" }],
  });

  cdp.on("Fetch.requestPaused", async (event: any) => {
    const { requestId, request, responseStatusCode } = event;
    try {
      if (responseStatusCode && responseStatusCode < 400) {
        const response = await cdp.send("Fetch.getResponseBody", { requestId });
        const buffer = response.base64Encoded
          ? Buffer.from(response.body, "base64")
          : Buffer.from(response.body);
        bodies.set(request.url, buffer);
      }
    } catch {
      // Some responses can't be read
    }
    // Continue the request
    await cdp.send("Fetch.continueRequest", { requestId }).catch(() => {});
  });

  return { getCapturedBodies: () => bodies };
}

export async function renderPage(
  url: string,
  options: { includeJs: boolean; reuseBrowser?: boolean; browser?: Browser }
): Promise<RenderResult> {
  let browser: Browser | null = options.browser || null;
  let shouldCloseBrowser = false; // 调用方管理浏览器生命周期
  let page: Page | null = null;

  try {
    // 如果调用方没有传入浏览器实例，通过池获取一个
    if (!browser) {
      browser = await browserPool.acquire();
      shouldCloseBrowser = true; // 本函数负责释放
    }

    page = await browser.newPage();
    await page.setViewport({ width: 1920, height: 1080 });
    await page.setBypassCSP(true);

    // 增强 HTTP Headers 模拟真实浏览器指纹
    const languages = ['zh-CN,zh;q=0.9,en;q=0.8', 'en-US,en;q=0.9', 'zh-CN,zh;q=0.9,en-US;q=0.8,en;q=0.7'];
    const randomLanguage = languages[Math.floor(Math.random() * languages.length)];

    await page.setExtraHTTPHeaders({
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
      'Accept-Language': randomLanguage,
      'Accept-Encoding': 'gzip, deflate, br',
      'DNT': '1',
      'Connection': 'keep-alive',
      'Upgrade-Insecure-Requests': '1',
      'Sec-Fetch-Dest': 'document',
      'Sec-Fetch-Mode': 'navigate',
      'Sec-Fetch-Site': 'none',
      'Sec-Fetch-User': '?1',
      'Sec-CH-UA': '"Chromium";v="121", "Not(A:Brand";v="24", "Google Chrome";v="121"',
      'Sec-CH-UA-Mobile': '?0',
      'Sec-CH-UA-Platform': '"macOS"',
      'Cache-Control': 'max-age=0',
    });

    // 注入反检测脚本（在页面加载前）
    await page.evaluateOnNewDocument(() => {
      // 覆盖 webdriver 标识
      Object.defineProperty(navigator, 'webdriver', {
        get: () => false,
      });

      // 添加更真实的插件信息
      Object.defineProperty(navigator, 'plugins', {
        get: () => [
          { name: 'Chrome PDF Plugin', filename: 'internal-pdf-viewer', description: 'Portable Document Format' },
          { name: 'Chrome PDF Viewer', filename: 'mhjfbmdgcfjbbpaeojofohoefgiehjai', description: '' },
          { name: 'Native Client', filename: 'internal-nacl-plugin', description: '' },
        ],
      });

      // 覆盖 permissions API
      const originalQuery = window.navigator.permissions.query;
      // @ts-ignore - 反检测需要覆盖内部方法
      window.navigator.permissions.query = (parameters: any) => (
        parameters.name === 'notifications' ?
          Promise.resolve({ state: 'prompt' as PermissionState, name: 'notifications', onchange: null, addEventListener: () => {}, removeEventListener: () => {}, dispatchEvent: () => true }) :
          originalQuery(parameters)
      );

      // 覆盖 chrome 对象（使其看起来像真实浏览器）
      (window as any).chrome = {
        runtime: {},
        loadTimes: () => {},
        csi: () => {},
      };
    });

    // Setup CDP interception to capture ALL network resources
    const { getResources, cleanup: cleanupCDP } = await setupCDPInterception(page);

    // 优化导航策略：减少超时时间，提前成功即可
    let navigationSuccess = false;
    const strategies = [
      { waitUntil: "domcontentloaded" as const, timeout: 10000 }, // 降低从 15s 到 10s
      { waitUntil: "load" as const, timeout: 20000 }, // 降低从 30s 到 20s
      { waitUntil: "networkidle2" as const, timeout: 40000 }, // 降低从 60s 到 40s
    ];

    for (const strategy of strategies) {
      try {
        await page.goto(url, strategy);
        navigationSuccess = true;
        break;
      } catch (error) {
        const errMsg = error instanceof Error ? error.message : String(error);
        if (strategy === strategies[strategies.length - 1]) {
          throw new Error(`页面加载失败: ${errMsg}。请检查URL是否正确，或网站是否阻止了自动访问。`);
        }
        // Continue to next strategy
      }
    }

    if (!navigationSuccess) {
      throw new Error("所有导航策略均失败");
    }

    // Force all lazy-loaded images to load immediately
    await page.evaluate(() => {
      // Remove loading="lazy" so images load eagerly during scroll
      document.querySelectorAll('img[loading="lazy"]').forEach((img) => {
        img.removeAttribute("loading");
      });
      // Trigger IntersectionObserver-based lazy loaders by making all images visible
      document.querySelectorAll("img").forEach((img) => {
        if (!img.src || img.src.startsWith("data:")) {
          // Check common lazy-load attributes and promote to src
          const lazySrc = img.getAttribute("data-src") || img.getAttribute("data-lazy-src") ||
            img.getAttribute("data-original") || img.getAttribute("data-lazy");
          if (lazySrc) {
            img.src = lazySrc;
          }
        }
      });
    });

    // 优化滚动策略：更智能的滚动行为
    console.log("  📜 开始智能滚动加载...");
    await page.evaluate(async () => {
      const randomDelay = (min: number, max: number) =>
        Math.floor(Math.random() * (max - min + 1)) + min;

      await new Promise<void>((resolve) => {
        let scrollAttempts = 0;
        const maxAttempts = 2; // 最多滚动 2 轮
        let lastHeight = 0;
        let unchangedCount = 0;
        const startTime = Date.now();
        const maxScrollTime = 8000; // 最大滚动时间 8 秒

        const performScroll = () => {
          let totalHeight = 0;
          const distance = 400 + randomDelay(-100, 100);
          const scrollDelay = randomDelay(60, 120); // 更快的滚动间隔

          const timer = setInterval(() => {
            const scrollHeight = document.body.scrollHeight;

            // 检测是否有新内容加载
            if (scrollHeight !== lastHeight) {
              lastHeight = scrollHeight;
              unchangedCount = 0;
            } else {
              unchangedCount++;
            }

            // 更自然的滚动：带微小随机偏移
            const randomOffset = randomDelay(-20, 20);
            window.scrollBy(0, distance + randomOffset);
            totalHeight += distance;

            // 检测滚动完成条件
            const reachedBottom = totalHeight >= scrollHeight && unchangedCount > 2;
            const timeExceeded = Date.now() - startTime > maxScrollTime;

            if (reachedBottom || timeExceeded) {
              clearInterval(timer);
              scrollAttempts++;

              if (scrollAttempts < maxAttempts && !timeExceeded) {
                // 回到顶部，准备下一轮
                window.scrollTo(0, 0);
                setTimeout(performScroll, randomDelay(300, 500));
              } else {
                // 滚动完成，回到顶部
                window.scrollTo(0, 0);
                setTimeout(resolve, randomDelay(800, 1200));
              }
            }
          }, scrollDelay);
        };

        performScroll();
      });
    });
    console.log("  ✅ 滚动完成");

    // 优化网络等待：使用更短的超时和条件等待
    try {
      await page.waitForNetworkIdle({ idleTime: 500, timeout: 5000 });
    } catch {
      // 网络未完全空闲也继续，避免卡在这里
    }

    // 并行等待图片和字体加载，并添加更短的超时
    const [imagesLoaded, fontsLoaded] = await Promise.allSettled([
      // 等待图片加载（最多 2s）
      page.evaluate(() => {
        const imgs = Array.from(document.querySelectorAll("img"));
        return Promise.race([
          Promise.allSettled(
            imgs
              .filter((img) => !img.complete)
              .map((img) =>
                new Promise<void>((resolve) => {
                  img.addEventListener("load", () => resolve(), { once: true });
                  img.addEventListener("error", () => resolve(), { once: true });
                })
              )
          ),
          new Promise((resolve) => setTimeout(resolve, 2000)),
        ]);
      }),
      // 等待字体加载（最多 1.5s）
      page.evaluate(() =>
        Promise.race([
          (document as any).fonts.ready,
          new Promise((r) => setTimeout(r, 1500)),
        ]).catch(() => {})
      ),
    ]);

    // 日志记录加载状态
    if (imagesLoaded.status === "fulfilled") {
      console.log("  ✅ 图片加载完成");
    } else {
      console.log("  ⏭️  图片加载超时，继续进行");
    }
    if (fontsLoaded.status === "fulfilled") {
      console.log("  ✅ 字体加载完成");
    } else {
      console.log("  ⏭️  字体加载超时，继续进行");
    }

    // 减少 CSS 过渡等待时间（从 200ms 到 100ms）
    await page.evaluate(() => new Promise((r) => setTimeout(r, 100)));

    // Phase 1: Capture Canvas elements as images
    const canvasSnapshots = await page.evaluate(() => {
      const snapshots: Array<{ selector: string; dataUrl: string }> = [];
      document.querySelectorAll("canvas").forEach((canvas, index) => {
        try {
          const dataUrl = canvas.toDataURL("image/png");
          if (dataUrl && dataUrl !== "data:,") {
            const id = `canvas-snapshot-${index}`;
            canvas.setAttribute("data-snapshot-id", id);
            snapshots.push({ selector: `[data-snapshot-id="${id}"]`, dataUrl });
          }
        } catch (e) {
          // tainted canvas, can't export
        }
      });
      return snapshots;
    });

    // Phase 2: Extract Shadow DOM content
    const shadowDomStyles = await page.evaluate(() => {
      const styles: string[] = [];

      function extractShadowStyles(root: Element | Document) {
        root.querySelectorAll("*").forEach((el) => {
          if (el.shadowRoot) {
            // Extract all styles from shadow root
            el.shadowRoot.querySelectorAll("style").forEach((style) => {
              const hostTag = el.tagName.toLowerCase();
              // Scope styles to the host element
              let css = style.textContent || "";
              css = css.replace(/:host/g, hostTag);
              styles.push(`/* Shadow DOM: ${hostTag} */\n${css}`);
            });

            // Flatten shadow DOM content into light DOM
            const shadowHtml = el.shadowRoot.innerHTML;
            el.setAttribute("data-shadow-content", shadowHtml);

            // Recurse into nested shadow roots
            extractShadowStyles(el.shadowRoot as any);
          }
        });
      }

      extractShadowStyles(document);
      return styles;
    });

    // Phase 3: Extract iframe content and assets (same-origin + cross-origin via disabled security)
    const iframeContents = await page.evaluate(() => {
      const contents: Array<{ selector: string; html: string; assets: Array<{ url: string; type: string; localPath: string }> }> = [];
      document.querySelectorAll("iframe").forEach((iframe, index) => {
        try {
          const doc = iframe.contentDocument;
          if (doc && doc.documentElement) {
            const id = `cloned-iframe-${index}`;
            iframe.setAttribute("data-iframe-id", id);

            // 从 iframe 中提取资源
            const iframeAssets: Array<{ url: string; type: string; localPath: string }> = [];
            const baseUrl = doc.location?.href || document.location.href;

            // 收集 iframe 内的 CSS
            doc.querySelectorAll('link[rel="stylesheet"]').forEach((el) => {
              const href = (el as HTMLLinkElement).href;
              if (href) iframeAssets.push({ url: href, type: "css", localPath: "" });
            });

            // 收集 iframe 内的图片
            doc.querySelectorAll("img[src]").forEach((el) => {
              const src = (el as HTMLImageElement).src;
              if (src && !src.startsWith("data:")) {
                iframeAssets.push({ url: src, type: "image", localPath: "" });
              }
            });

            // 收集 iframe 内的字体和背景图
            Array.from(doc.styleSheets).forEach((sheet) => {
              try {
                Array.from(sheet.cssRules).forEach((rule: any) => {
                  if (rule.type === CSSRule.FONT_FACE_RULE) {
                    const urlRegex = /url\(["']?([^"')]+)["']?\)/g;
                    let match;
                    while ((match = urlRegex.exec(rule.cssText)) !== null) {
                      if (!match[1].startsWith("data:")) {
                        try {
                          const fullUrl = new URL(match[1], baseUrl).href;
                          iframeAssets.push({ url: fullUrl, type: "font", localPath: "" });
                        } catch {}
                      }
                    }
                  }
                });
              } catch {}
            });

            contents.push({
              selector: `[data-iframe-id="${id}"]`,
              html: doc.documentElement.outerHTML,
              assets: iframeAssets,
            });
          }
        } catch (e) {
          // Still can't access some iframes
        }
      });
      return contents;
    });

    // Phase 4: Compute and inline critical CSS
    const computedCssResult = await page.evaluate(() => {
      let classIndex = 0;

      // 捕获所有可访问样式表的完整规则（作为 CSS 下载失败的回退）
      const allStyleRules: string[] = [];
      Array.from(document.styleSheets).forEach((sheet) => {
        try {
          // 跳过内联 style 标签（它们已经在 HTML 中了）
          if (sheet.ownerNode && (sheet.ownerNode as HTMLElement).tagName === "STYLE") return;
          Array.from(sheet.cssRules).forEach((rule) => {
            // 捕获普通样式规则（非特殊 at-rule）
            if (rule instanceof CSSStyleRule) {
              allStyleRules.push(rule.cssText);
            }
          });
        } catch (e) {
          // CORS - 无法访问跨域样式表
        }
      });

      // Get all @font-face rules
      const fontFaces: string[] = [];
      Array.from(document.styleSheets).forEach((sheet) => {
        try {
          Array.from(sheet.cssRules).forEach((rule) => {
            if (rule instanceof CSSFontFaceRule) {
              fontFaces.push(rule.cssText);
            }
          });
        } catch (e) {
          // CORS
        }
      });

      // Get all @keyframes rules
      const keyframes: string[] = [];
      Array.from(document.styleSheets).forEach((sheet) => {
        try {
          Array.from(sheet.cssRules).forEach((rule) => {
            if (rule instanceof CSSKeyframesRule) {
              keyframes.push(rule.cssText);
            }
          });
        } catch (e) {}
      });

      // Get all media queries
      const mediaRules: string[] = [];
      Array.from(document.styleSheets).forEach((sheet) => {
        try {
          Array.from(sheet.cssRules).forEach((rule) => {
            if (rule instanceof CSSMediaRule) {
              mediaRules.push(rule.cssText);
            }
          });
        } catch (e) {}
      });

      // Get all CSS custom properties (扩展：捕获所有作用域的 CSS 变量)
      const customProperties: string[] = [];
      Array.from(document.styleSheets).forEach((sheet) => {
        try {
          Array.from(sheet.cssRules).forEach((rule) => {
            if (rule instanceof CSSStyleRule) {
              const style = rule.style;
              const vars: string[] = [];
              for (let i = 0; i < style.length; i++) {
                const prop = style[i];
                if (prop.startsWith("--")) {
                  vars.push(`  ${prop}: ${style.getPropertyValue(prop)};`);
                }
              }
              if (vars.length > 0) {
                customProperties.push(`${rule.selectorText} {\n${vars.join("\n")}\n}`);
              }
            }
          });
        } catch (e) {}
      });

      // Get hover/focus/active state rules (扩展伪类覆盖)
      const interactionRules: string[] = [];
      Array.from(document.styleSheets).forEach((sheet) => {
        try {
          Array.from(sheet.cssRules).forEach((rule) => {
            if (rule instanceof CSSStyleRule) {
              const sel = rule.selectorText;
              if (sel && (
                sel.includes(":hover") || sel.includes(":focus") ||
                sel.includes(":active") || sel.includes(":focus-visible") ||
                sel.includes(":focus-within") ||
                sel.includes(":checked") || sel.includes(":disabled") ||
                sel.includes(":enabled") || sel.includes(":required") ||
                sel.includes(":optional") || sel.includes(":valid") ||
                sel.includes(":invalid") || sel.includes(":read-only") ||
                sel.includes(":read-write") || sel.includes(":placeholder-shown") ||
                sel.includes(":first-child") || sel.includes(":last-child") ||
                sel.includes(":nth-child") || sel.includes(":nth-of-type") ||
                sel.includes(":first-of-type") || sel.includes(":last-of-type") ||
                sel.includes(":only-child") || sel.includes(":only-of-type") ||
                sel.includes(":empty") || sel.includes(":not") ||
                sel.includes(":is") || sel.includes(":where") ||
                sel.includes(":has") || sel.includes(":target")
              )) {
                interactionRules.push(rule.cssText);
              }
            }
          });
        } catch (e) {}
      });

      // Get @supports rules
      const supportsRules: string[] = [];
      Array.from(document.styleSheets).forEach((sheet) => {
        try {
          Array.from(sheet.cssRules).forEach((rule) => {
            if (rule instanceof CSSSupportsRule) {
              supportsRules.push(rule.cssText);
            }
          });
        } catch (e) {}
      });

      // Get @layer rules (CSS Cascade Layers)
      const layerRules: string[] = [];
      Array.from(document.styleSheets).forEach((sheet) => {
        try {
          Array.from(sheet.cssRules).forEach((rule: any) => {
            if (rule.constructor.name === "CSSLayerBlockRule" || rule.constructor.name === "CSSLayerStatementRule") {
              layerRules.push(rule.cssText);
            }
          });
        } catch (e) {}
      });

      // Extract pseudo-element styles
      // 性能优化：限制处理元素数量，跳过不可见元素
      const pseudoStyles: string[] = [];
      const MAX_PSEUDO_ELEMENTS = 3000; // 最多处理 3000 个元素
      let pseudoElementCount = 0;

      const allElements = document.querySelectorAll("*");
      const elementsToProcess = allElements.length > MAX_PSEUDO_ELEMENTS
        ? Array.from(allElements).filter((el) => {
            // 只处理可见元素（跳过 display:none 和零尺寸的元素）
            const rect = el.getBoundingClientRect();
            return rect.width > 0 || rect.height > 0;
          }).slice(0, MAX_PSEUDO_ELEMENTS)
        : Array.from(allElements);

      for (const el of elementsToProcess) {
        const tagName = el.tagName.toLowerCase();
        if (tagName === "script" || tagName === "style" || tagName === "link" || tagName === "meta" || tagName === "head" || tagName === "title" || tagName === "br" || tagName === "hr") continue;

        // 只检查 ::before 和 ::after（最常用），其他伪元素按需检查
        const pseudosToCheck = ["::before", "::after"];
        // 仅对特定元素检查其他伪元素
        if (tagName === "input" || tagName === "textarea") pseudosToCheck.push("::placeholder");
        if (el.closest("ul, ol, li")) pseudosToCheck.push("::marker");

        for (const pseudo of pseudosToCheck) {
          const computed = window.getComputedStyle(el, pseudo);
          const content = computed.content;
          // ::before/::after need content check
          const needsContent = pseudo === "::before" || pseudo === "::after";
          if (needsContent && (!content || content === "none" || content === "normal")) continue;
          if (!needsContent) {
            if (pseudo === "::placeholder" && tagName !== "input" && tagName !== "textarea") continue;
            if (pseudo === "::marker" && computed.display !== "list-item") continue;
          }

          const cls = `_pe${classIndex++}`;
          el.classList.add(cls);
          pseudoElementCount++;

          let rule = `.${cls}${pseudo} {`;
          if (needsContent) rule += ` content: ${content};`;

          // 精简属性列表：只提取对伪元素有意义的属性
          const props = [
            "display", "position", "float",
            "width", "height", "min-width", "min-height", "max-width", "max-height",
            "top", "left", "right", "bottom", "inset",
            "margin", "margin-top", "margin-right", "margin-bottom", "margin-left",
            "padding", "padding-top", "padding-right", "padding-bottom", "padding-left",
            "border", "border-top", "border-right", "border-bottom", "border-left",
            "border-width", "border-style", "border-color", "border-radius",
            "box-sizing", "overflow",
            "color", "font-size", "font-family", "font-weight", "font-style",
            "line-height", "letter-spacing", "word-spacing",
            "text-transform", "text-decoration", "text-align", "text-indent",
            "text-overflow", "text-shadow", "white-space",
            "vertical-align",
            "background", "background-color", "background-image", "background-size",
            "background-position", "background-repeat",
            "opacity", "visibility", "z-index",
            "box-shadow", "transform", "transform-origin",
            "filter", "clip-path",
            "flex", "flex-grow", "flex-shrink", "flex-basis",
            "align-self", "order",
            "animation", "transition",
            "cursor", "pointer-events",
            "list-style", "list-style-type", "list-style-position", "list-style-image",
          ];

          for (const prop of props) {
            const val = computed.getPropertyValue(prop);
            if (val && val !== "normal" && val !== "none" && val !== "auto"
              && val !== "0px" && val !== "rgba(0, 0, 0, 0)" && val !== "transparent"
              && val !== "static" && val !== "visible" && val !== "inline") {
              rule += ` ${prop}: ${val};`;
            }
          }
          rule += " }";
          pseudoStyles.push(rule);
        }
      }

      return {
        allStyleRules,
        fontFaces,
        keyframes,
        mediaRules,
        pseudoStyles,
        customProperties,
        interactionRules,
        supportsRules,
        layerRules,
      };
    });

    // Phase 5: Extract assets from DOM (enhanced)
    const result = await page.evaluate(
      (includeJs: boolean) => {
        const baseUrl = document.location.origin;
        const assets: Array<{ url: string; type: string; localPath: string }> = [];
        const links: string[] = [];

        // Collect CSS links
        document.querySelectorAll('link[rel="stylesheet"]').forEach((el) => {
          const href = (el as HTMLLinkElement).href;
          if (href) assets.push({ url: href, type: "css", localPath: "" });
        });

        // Collect inline <style> with @import
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

        // Collect preload/prefetch links
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

        // Collect JS scripts
        if (includeJs) {
          document.querySelectorAll("script[src]").forEach((el) => {
            const src = (el as HTMLScriptElement).src;
            if (src) assets.push({ url: src, type: "js", localPath: "" });
          });
        }

        // Collect images
        document.querySelectorAll("img[src]").forEach((el) => {
          const src = (el as HTMLImageElement).src;
          if (src && !src.startsWith("data:")) {
            assets.push({ url: src, type: "image", localPath: "" });
          }
        });

        // Collect lazy-loaded images (data-src, data-lazy-src, data-original, etc.)
        const lazyAttrs = ["data-src", "data-lazy-src", "data-original", "data-lazy", "data-url", "data-image"];
        document.querySelectorAll("img").forEach((el) => {
          for (const attr of lazyAttrs) {
            const val = el.getAttribute(attr);
            if (val && !val.startsWith("data:") && !val.startsWith("blob:")) {
              try {
                const fullUrl = new URL(val, document.location.href).href;
                assets.push({ url: fullUrl, type: "image", localPath: "" });
                // Promote data-src to src so it shows in the cloned page
                if (!el.src || el.src.startsWith("data:") || el.src.includes("placeholder") || el.src.includes("blank")) {
                  el.src = fullUrl;
                }
              } catch {}
            }
          }
          // Also handle data-srcset
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
            // Promote data-srcset to srcset
            if (!el.getAttribute("srcset")) {
              el.setAttribute("srcset", dataSrcset);
            }
          }
        });

        // Collect lazy-loaded background images on any element
        document.querySelectorAll("[data-bg], [data-background-image]").forEach((el) => {
          const bg = el.getAttribute("data-bg") || el.getAttribute("data-background-image");
          if (bg && !bg.startsWith("data:")) {
            try {
              const fullUrl = new URL(bg, document.location.href).href;
              assets.push({ url: fullUrl, type: "image", localPath: "" });
            } catch {}
          }
        });

        // Collect srcset images
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

        // Collect <picture> sources
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

        // Collect video sources
        document.querySelectorAll("video[src], video source[src]").forEach((el) => {
          const src = (el as HTMLMediaElement).src || el.getAttribute("src") || "";
          if (src && !src.startsWith("data:")) {
            try {
              const fullUrl = new URL(src, document.location.href).href;
              assets.push({ url: fullUrl, type: "other", localPath: "" });
            } catch {}
          }
        });

        // Collect video posters
        document.querySelectorAll("video[poster]").forEach((el) => {
          const poster = el.getAttribute("poster") || "";
          if (poster && !poster.startsWith("data:")) {
            try {
              const fullUrl = new URL(poster, document.location.href).href;
              assets.push({ url: fullUrl, type: "image", localPath: "" });
            } catch {}
          }
        });

        // Collect audio sources
        document.querySelectorAll("audio[src], audio source[src]").forEach((el) => {
          const src = (el as HTMLMediaElement).src || el.getAttribute("src") || "";
          if (src && !src.startsWith("data:")) {
            try {
              const fullUrl = new URL(src, document.location.href).href;
              assets.push({ url: fullUrl, type: "other", localPath: "" });
            } catch {}
          }
        });

        // Collect favicon and app icons
        document.querySelectorAll('link[rel*="icon"], link[rel="apple-touch-icon"]').forEach((el) => {
          const href = (el as HTMLLinkElement).href;
          if (href) assets.push({ url: href, type: "image", localPath: "" });
        });

        // Collect ALL url() references from computed styles
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

        // Collect @font-face URLs from all stylesheets
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

        // Collect SVG <use> external references
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

        // Collect SVG <image> references
        document.querySelectorAll("image").forEach((el) => {
          const href = el.getAttribute("href") || el.getAttribute("xlink:href") || "";
          if (href && !href.startsWith("data:")) {
            try {
              const fullUrl = new URL(href, document.location.href).href;
              assets.push({ url: fullUrl, type: "image", localPath: "" });
            } catch {}
          }
        });

        // Collect <object data="..."> and <embed src="...">
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

        // Collect manifest
        document.querySelectorAll('link[rel="manifest"]').forEach((el) => {
          const href = (el as HTMLLinkElement).href;
          if (href) assets.push({ url: href, type: "other", localPath: "" });
        });

        // Collect images from <noscript> tags (common lazy-loading fallback pattern)
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
          // Also check srcset in noscript
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

        // Collect same-domain links
        document.querySelectorAll("a[href]").forEach((el) => {
          const href = (el as HTMLAnchorElement).href;
          if (href && href.startsWith(baseUrl) && !href.includes("#")) {
            links.push(href);
          }
        });

        // Get final rendered HTML
        const html = document.documentElement.outerHTML;

        // 内容完整性验证：检测页面是否为空白或错误页
        const bodyText = document.body.innerText || "";
        const bodyTextLength = bodyText.trim().length;
        const hasImages = document.querySelectorAll("img").length > 0;
        const hasLinks = document.querySelectorAll("a").length > 0;

        // 检测常见的错误指示器
        const errorIndicators = [
          "access denied", "403", "forbidden",
          "not found", "404",
          "验证码", "captcha", "recaptcha",
          "cloudflare", "security check",
          "please verify", "human verification",
          "blocked", "banned",
          "robot", "bot detected"
        ];
        const lowerText = bodyText.toLowerCase();
        const hasErrorIndicator = errorIndicators.some(indicator => lowerText.includes(indicator));

        // 智能页面类型检测
        const pageTypeDetection: any = {
          framework: "none",
          renderType: "static",
          jsDependency: "none",
          recommendation: { includeJs: false, reason: "" },
          features: {
            hasReactRoot: false,
            hasVueApp: false,
            hasAngularApp: false,
            hasNextData: false,
            hasNuxtData: false,
            emptyBodyBeforeJs: false,
            dynamicContentRatio: 0
          }
        };

        // 检测前端框架
        if ((window as any).React || (window as any).__REACT_DEVTOOLS_GLOBAL_HOOK__ ||
            document.querySelector('[data-reactroot], [data-reactid]')) {
          pageTypeDetection.framework = "react";
          pageTypeDetection.features.hasReactRoot = true;
        } else if ((window as any).Vue || (window as any).__VUE__ ||
                   document.querySelector('[data-v-], [data-server-rendered]')) {
          pageTypeDetection.framework = "vue";
          pageTypeDetection.features.hasVueApp = true;
        } else if ((window as any).ng || document.querySelector('[ng-version], [ng-app]')) {
          pageTypeDetection.framework = "angular";
          pageTypeDetection.features.hasAngularApp = true;
        }

        // 检测 Next.js
        if ((window as any).__NEXT_DATA__ || document.getElementById('__NEXT_DATA__')) {
          pageTypeDetection.framework = "nextjs";
          pageTypeDetection.features.hasNextData = true;
        }

        // 检测 Nuxt.js
        if ((window as any).__NUXT__ || document.getElementById('__NUXT__')) {
          pageTypeDetection.framework = "nuxtjs";
          pageTypeDetection.features.hasNuxtData = true;
        }

        // 分析内容渲染方式
        const allElements = document.querySelectorAll('body *');
        let dynamicElements = 0;

        allElements.forEach((el) => {
          // 检测是否有框架特征属性
          // 注意：SVG 元素的 className 是 SVGAnimatedString，不是字符串
          const cls = el instanceof SVGElement ? (el.className.baseVal || '') : el.className;
          if (el.hasAttribute('data-reactroot') ||
              el.hasAttribute('data-v-') ||
              el.hasAttribute('ng-version') ||
              cls.includes('vue-') ||
              cls.includes('ng-')) {
            dynamicElements++;
          }
        });

        const dynamicRatio = allElements.length > 0 ? dynamicElements / allElements.length : 0;
        pageTypeDetection.features.dynamicContentRatio = dynamicRatio;

        // 判断渲染类型和 JS 依赖
        if (pageTypeDetection.framework !== "none") {
          if (bodyTextLength < 500 && dynamicRatio > 0.5) {
            pageTypeDetection.renderType = "spa";
            pageTypeDetection.jsDependency = "required";
            pageTypeDetection.recommendation = {
              includeJs: false,
              reason: "检测到单页应用（SPA），内容由 JS 动态生成。建议不包含 JS，将已渲染的静态 HTML 保存。包含 JS 可能导致页面空白或 API 调用失败。"
            };
          } else if (bodyTextLength > 1000 && dynamicRatio > 0.3) {
            pageTypeDetection.renderType = "hybrid";
            pageTypeDetection.jsDependency = "optional";
            pageTypeDetection.recommendation = {
              includeJs: false,
              reason: "检测到混合渲染页面，主要内容已在 HTML 中。建议不包含 JS 以获得更好的稳定性和文件大小。"
            };
          } else {
            pageTypeDetection.renderType = "static";
            pageTypeDetection.jsDependency = "none";
            pageTypeDetection.recommendation = {
              includeJs: false,
              reason: "虽然使用了前端框架，但内容已完整渲染到 HTML。建议不包含 JS。"
            };
          }
        } else {
          // 无框架
          const scriptTags = document.querySelectorAll('script[src]').length;
          if (bodyTextLength < 200 && scriptTags > 5) {
            pageTypeDetection.renderType = "spa";
            pageTypeDetection.jsDependency = "required";
            pageTypeDetection.recommendation = {
              includeJs: false,
              reason: "页面内容较少但有大量脚本，可能依赖 JS 渲染。建议不包含 JS，保存已渲染内容。"
            };
          } else {
            pageTypeDetection.renderType = "static";
            pageTypeDetection.jsDependency = "none";
            pageTypeDetection.recommendation = {
              includeJs: false,
              reason: "静态页面，内容已完整。建议不包含 JS 以减小文件大小。"
            };
          }
        }

        return {
          html,
          assets,
          links,
          contentValidation: {
            bodyTextLength,
            hasImages,
            hasLinks,
            hasErrorIndicator,
            isEmpty: bodyTextLength < 100 && !hasImages,
            title: document.title || ""
          },
          pageTypeDetection
        };
      },
      options.includeJs
    );

    // Merge CDP-captured resources with DOM-discovered assets
    const cdpResources = getResources();
    const domAssetUrls = new Set(result.assets.map((a) => a.url));

    // Add resources discovered by CDP but missed by DOM analysis
    for (const res of cdpResources) {
      if (!domAssetUrls.has(res.url) && !res.url.startsWith("data:") && !res.url.startsWith("blob:")) {
        // Skip the page itself and navigation requests
        if (res.type === "Document" || res.url === url) continue;

        let assetType: Asset["type"] = "other";
        if (res.type === "css" || res.mimeType.includes("css")) assetType = "css";
        else if (res.type === "js" || res.mimeType.includes("javascript")) assetType = "js";
        else if (res.type === "image" || res.mimeType.includes("image")) assetType = "image";
        else if (res.type === "font" || res.mimeType.includes("font")) assetType = "font";

        result.assets.push({ url: res.url, type: assetType, localPath: "" });
      }
    }

    // Deduplicate assets
    const seenUrls = new Set<string>();
    const uniqueAssets: Asset[] = [];
    for (const asset of result.assets) {
      if (!seenUrls.has(asset.url)) {
        seenUrls.add(asset.url);
        uniqueAssets.push(asset as Asset);
      }
    }

    // Deduplicate links
    const uniqueLinks = [...new Set(result.links)];

    // Build inline CSS string from computed results
    const inlinedCssParts: string[] = [];

    // 首先注入所有可访问样式表的规则（作为 CSS 下载失败的回退）
    if (computedCssResult.allStyleRules.length > 0) {
      inlinedCssParts.push("/* All accessible stylesheet rules (fallback) */");
      inlinedCssParts.push(...computedCssResult.allStyleRules);
    }

    if (computedCssResult.customProperties.length > 0) {
      inlinedCssParts.push("/* CSS Custom Properties */");
      inlinedCssParts.push(...computedCssResult.customProperties);
    }
    if (computedCssResult.layerRules.length > 0) {
      inlinedCssParts.push("/* @layer rules */");
      inlinedCssParts.push(...computedCssResult.layerRules);
    }
    if (computedCssResult.fontFaces.length > 0) {
      inlinedCssParts.push("/* @font-face rules */");
      inlinedCssParts.push(...computedCssResult.fontFaces);
    }
    if (computedCssResult.keyframes.length > 0) {
      inlinedCssParts.push("/* @keyframes rules */");
      inlinedCssParts.push(...computedCssResult.keyframes);
    }
    if (computedCssResult.supportsRules.length > 0) {
      inlinedCssParts.push("/* @supports rules */");
      inlinedCssParts.push(...computedCssResult.supportsRules);
    }
    if (computedCssResult.pseudoStyles.length > 0) {
      inlinedCssParts.push("/* Pseudo-element styles */");
      inlinedCssParts.push(...computedCssResult.pseudoStyles);
    }
    if (computedCssResult.interactionRules.length > 0) {
      inlinedCssParts.push("/* Interaction states (:hover, :focus, :active) */");
      inlinedCssParts.push(...computedCssResult.interactionRules);
    }
    if (shadowDomStyles.length > 0) {
      inlinedCssParts.push("/* Shadow DOM styles */");
      inlinedCssParts.push(...shadowDomStyles);
    }
    if (computedCssResult.mediaRules.length > 0) {
      inlinedCssParts.push("/* Media queries */");
      inlinedCssParts.push(...computedCssResult.mediaRules);
    }

    // 内容验证和页面类型检测警告
    const validation = result.contentValidation;
    const pageType = result.pageTypeDetection;

    if (validation.isEmpty) {
      console.warn(`⚠️  警告：页面内容可能为空 (文本长度: ${validation.bodyTextLength})`);
    }
    if (validation.hasErrorIndicator) {
      console.warn(`⚠️  警告：检测到可能的反爬虫或错误页面`);
    }

    // 输出页面类型检测结果
    if (pageType) {
      console.log(`📊 页面类型检测：`);
      console.log(`   框架: ${pageType.framework || '无'}`);
      console.log(`   渲染方式: ${pageType.renderType}`);
      console.log(`   JS 依赖: ${pageType.jsDependency}`);
      console.log(`   建议: ${pageType.recommendation.reason}`);
    }

    // 清理 CDP 会话
    await cleanupCDP();

    return {
      html: `<!DOCTYPE html>\n${result.html}`,
      assets: uniqueAssets,
      links: uniqueLinks,
      inlinedCss: inlinedCssParts.join("\n"),
      canvasSnapshots,
      iframeContents: iframeContents.map((ic) => ({
        selector: ic.selector,
        html: ic.html,
        assets: (ic.assets || []) as Asset[],
      })),
      contentValidation: validation,
      pageTypeDetection: pageType,
    };
  } finally {
    // 关闭页面（防止内存泄漏）
    if (page && !page.isClosed()) {
      await page.close().catch(() => {});
    }
    // 只在本函数负责管理浏览器时释放
    if (browser && shouldCloseBrowser) {
      await browserPool.release(browser);
    }
  }
}
