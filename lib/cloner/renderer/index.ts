import puppeteer, { Browser, Page } from "puppeteer";
import { Asset, PageTypeDetection } from "../../types";
import { browserPool } from "../browser-pool";
import { setupPageBasics, setupHttpHeaders, injectAntiDetectionScript } from "./browser-setup";
import { setupCDPInterception, CapturedResource } from "./cdp-interceptor";
import { navigateToPage, forceLazyImageLoading, performIntelligentScrolling, waitForResourcesLoad } from "./page-loading";
import { extractAssets, ExtractedAssets } from "./asset-extractor";
import { computeCss, ComputedCssResult } from "./css-computer";
import { validatePageContent, logContentValidation, ContentValidation } from "./content-validator";
import { detectPageType, logPageTypeDetection } from "./page-detector";

/**
 * 渲染结果
 */
export interface RenderResult {
  html: string;
  assets: Asset[];
  links: string[];
  inlinedCss?: string;
  canvasSnapshots?: Array<{ selector: string; dataUrl: string }>;
  iframeContents?: Array<{ selector: string; html: string; assets: Asset[] }>;
  contentValidation?: ContentValidation;
  pageTypeDetection?: PageTypeDetection;
}

/**
 * 渲染选项
 */
interface RenderOptions {
  includeJs: boolean;
  reuseBrowser?: boolean;
  browser?: Browser;
}

/**
 * 渲染页面 - 主协调器
 * 使用 Puppeteer 和 CDP 捕获完整的页面内容和资源
 */
export async function renderPage(
  url: string,
  options: RenderOptions
): Promise<RenderResult> {
  let browser: Browser | null = options.browser || null;
  let shouldCloseBrowser = false;
  let page: Page | null = null;

  try {
    // 1. 获取或创建浏览器实例
    if (!browser) {
      browser = await browserPool.acquire();
      shouldCloseBrowser = true;
    }

    page = await browser.newPage();

    // 2. 配置浏览器页面
    await setupPageBasics(page);
    await setupHttpHeaders(page);
    await injectAntiDetectionScript(page);

    // 3. 设置 CDP 网络拦截
    const { getResources, cleanup: cleanupCDP } = await setupCDPInterception(page);

    // 4. 导航到目标页面
    await navigateToPage(page, url);

    // 5. 强制加载懒加载图片
    await forceLazyImageLoading(page);

    // 6. 执行智能滚动
    await performIntelligentScrolling(page);

    // 7. 等待资源加载完成
    await waitForResourcesLoad(page);

    // 8. 捕获 Canvas 元素
    const canvasSnapshots = await captureCanvasElements(page);

    // 9. 提取 Shadow DOM 样式
    const shadowDomStyles = await extractShadowDomStyles(page);

    // 10. 提取 iframe 内容
    const iframeContents = await extractIframeContents(page);

    // 11. 计算 CSS
    const computedCssResult = await computeCss(page);

    // 12. 提取页面资源
    const extractedAssets = await extractAssets(page, options.includeJs);

    // 13. 合并 CDP 捕获的资源
    const cdpResources = getResources();
    const mergedAssets = mergeAssets(extractedAssets.assets, cdpResources, url);

    // 14. 构建内联 CSS
    const inlinedCss = buildInlinedCss(computedCssResult, shadowDomStyles);

    // 15. 验证内容和检测页面类型
    const contentValidation = await validatePageContent(page);
    const pageTypeDetection = await detectPageType(page);

    // 16. 打印日志
    logContentValidation(contentValidation);
    logPageTypeDetection(pageTypeDetection);

    // 17. 清理 CDP
    await cleanupCDP();

    return {
      html: `<!DOCTYPE html>\n${extractedAssets.html}`,
      assets: mergedAssets,
      links: [...new Set(extractedAssets.links)],
      inlinedCss,
      canvasSnapshots,
      iframeContents: iframeContents.map((ic) => ({
        selector: ic.selector,
        html: ic.html,
        assets: ic.assets as Asset[],
      })),
      contentValidation,
      pageTypeDetection,
    };
  } finally {
    // 关闭页面
    if (page && !page.isClosed()) {
      await page.close().catch(() => {});
    }
    // 释放浏览器
    if (browser && shouldCloseBrowser) {
      await browserPool.release(browser);
    }
  }
}

// === 辅助函数 ===

/**
 * 捕获 Canvas 元素为图片
 */
async function captureCanvasElements(page: Page): Promise<Array<{ selector: string; dataUrl: string }>> {
  return await page.evaluate(() => {
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
        // tainted canvas, 无法导出
      }
    });
    return snapshots;
  });
}

/**
 * 提取 Shadow DOM 样式
 */
async function extractShadowDomStyles(page: Page): Promise<string[]> {
  return await page.evaluate(() => {
    const styles: string[] = [];

    function extractShadowStyles(root: Element | Document) {
      root.querySelectorAll("*").forEach((el) => {
        if (el.shadowRoot) {
          el.shadowRoot.querySelectorAll("style").forEach((style) => {
            const hostTag = el.tagName.toLowerCase();
            let css = style.textContent || "";
            css = css.replace(/:host/g, hostTag);
            styles.push(`/* Shadow DOM: ${hostTag} */\n${css}`);
          });

          const shadowHtml = el.shadowRoot.innerHTML;
          el.setAttribute("data-shadow-content", shadowHtml);

          extractShadowStyles(el.shadowRoot as any);
        }
      });
    }

    extractShadowStyles(document);
    return styles;
  });
}

/**
 * 提取 iframe 内容
 */
async function extractIframeContents(page: Page): Promise<Array<{ selector: string; html: string; assets: Array<{ url: string; type: string; localPath: string }> }>> {
  return await page.evaluate(() => {
    const contents: Array<{ selector: string; html: string; assets: Array<{ url: string; type: string; localPath: string }> }> = [];
    document.querySelectorAll("iframe").forEach((iframe, index) => {
      try {
        const doc = iframe.contentDocument;
        if (doc && doc.documentElement) {
          const id = `cloned-iframe-${index}`;
          iframe.setAttribute("data-iframe-id", id);

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

          contents.push({
            selector: `[data-iframe-id="${id}"]`,
            html: doc.documentElement.outerHTML,
            assets: iframeAssets,
          });
        }
      } catch (e) {
        // 无法访问某些 iframe
      }
    });
    return contents;
  });
}

/**
 * 合并资源列表
 */
function mergeAssets(
  domAssets: Array<{ url: string; type: string; localPath: string }>,
  cdpResources: CapturedResource[],
  pageUrl: string
): Asset[] {
  const domAssetUrls = new Set(domAssets.map((a) => a.url));
  const merged: Asset[] = [...domAssets as Asset[]];

  // 添加 CDP 发现但 DOM 未发现的资源
  for (const res of cdpResources) {
    if (!domAssetUrls.has(res.url) && !res.url.startsWith("data:") && !res.url.startsWith("blob:")) {
      // 跳过页面本身
      if (res.type === "Document" || res.url === pageUrl) continue;

      let assetType: Asset["type"] = "other";
      if (res.type === "css" || res.mimeType.includes("css")) assetType = "css";
      else if (res.type === "js" || res.mimeType.includes("javascript")) assetType = "js";
      else if (res.type === "image" || res.mimeType.includes("image")) assetType = "image";
      else if (res.type === "font" || res.mimeType.includes("font")) assetType = "font";

      merged.push({ url: res.url, type: assetType, localPath: "" });
    }
  }

  // 去重
  const seenUrls = new Set<string>();
  const uniqueAssets: Asset[] = [];
  for (const asset of merged) {
    if (!seenUrls.has(asset.url)) {
      seenUrls.add(asset.url);
      uniqueAssets.push(asset);
    }
  }

  return uniqueAssets;
}

/**
 * 构建内联 CSS 字符串
 */
function buildInlinedCss(cssResult: ComputedCssResult, shadowDomStyles: string[]): string {
  const parts: string[] = [];

  if (cssResult.allStyleRules.length > 0) {
    parts.push("/* All accessible stylesheet rules (fallback) */");
    parts.push(...cssResult.allStyleRules);
  }
  if (cssResult.customProperties.length > 0) {
    parts.push("/* CSS Custom Properties */");
    parts.push(...cssResult.customProperties);
  }
  if (cssResult.layerRules.length > 0) {
    parts.push("/* @layer rules */");
    parts.push(...cssResult.layerRules);
  }
  if (cssResult.fontFaces.length > 0) {
    parts.push("/* @font-face rules */");
    parts.push(...cssResult.fontFaces);
  }
  if (cssResult.keyframes.length > 0) {
    parts.push("/* @keyframes rules */");
    parts.push(...cssResult.keyframes);
  }
  if (cssResult.supportsRules.length > 0) {
    parts.push("/* @supports rules */");
    parts.push(...cssResult.supportsRules);
  }
  if (cssResult.pseudoStyles.length > 0) {
    parts.push("/* Pseudo-element styles */");
    parts.push(...cssResult.pseudoStyles);
  }
  if (cssResult.interactionRules.length > 0) {
    parts.push("/* Interaction states (:hover, :focus, :active) */");
    parts.push(...cssResult.interactionRules);
  }
  if (shadowDomStyles.length > 0) {
    parts.push("/* Shadow DOM styles */");
    parts.push(...shadowDomStyles);
  }
  if (cssResult.mediaRules.length > 0) {
    parts.push("/* Media queries */");
    parts.push(...cssResult.mediaRules);
  }

  return parts.join("\n");
}