import { Page } from "puppeteer";
import { PageTypeDetection } from "../../types";

/**
 * 页面类型检测器 - 智能识别前端框架和渲染方式
 */

/**
 * 检测页面类型和框架
 */
export async function detectPageType(page: Page): Promise<PageTypeDetection> {
  return await page.evaluate(() => {
    const pageTypeDetection: PageTypeDetection = {
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

    // 1. 检测前端框架
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

    // 2. 检测 Next.js
    if ((window as any).__NEXT_DATA__ || document.getElementById('__NEXT_DATA__')) {
      pageTypeDetection.framework = "nextjs";
      pageTypeDetection.features.hasNextData = true;
    }

    // 3. 检测 Nuxt.js
    if ((window as any).__NUXT__ || document.getElementById('__NUXT__')) {
      pageTypeDetection.framework = "nuxtjs";
      pageTypeDetection.features.hasNuxtData = true;
    }

    // 4. 分析内容渲染方式
    const bodyText = document.body.innerText || "";
    const bodyTextLength = bodyText.trim().length;
    const allElements = document.querySelectorAll('body *');
    let dynamicElements = 0;

    allElements.forEach((el) => {
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

    // 5. 判断渲染类型和 JS 依赖
    if (pageTypeDetection.framework !== "none") {
      if (bodyTextLength < 500 && dynamicRatio > 0.5) {
        pageTypeDetection.renderType = "spa";
        pageTypeDetection.jsDependency = "required";
        pageTypeDetection.recommendation = {
          includeJs: false,
          reason: "检测到单页应用(SPA),内容由 JS 动态生成。建议不包含 JS,将已渲染的静态 HTML 保存。包含 JS 可能导致页面空白或 API 调用失败。"
        };
      } else if (bodyTextLength > 1000 && dynamicRatio > 0.3) {
        pageTypeDetection.renderType = "hybrid";
        pageTypeDetection.jsDependency = "optional";
        pageTypeDetection.recommendation = {
          includeJs: false,
          reason: "检测到混合渲染页面,主要内容已在 HTML 中。建议不包含 JS 以获得更好的稳定性和文件大小。"
        };
      } else {
        pageTypeDetection.renderType = "static";
        pageTypeDetection.jsDependency = "none";
        pageTypeDetection.recommendation = {
          includeJs: false,
          reason: "虽然使用了前端框架,但内容已完整渲染到 HTML。建议不包含 JS。"
        };
      }
    } else {
      const scriptTags = document.querySelectorAll('script[src]').length;
      if (bodyTextLength < 200 && scriptTags > 5) {
        pageTypeDetection.renderType = "spa";
        pageTypeDetection.jsDependency = "required";
        pageTypeDetection.recommendation = {
          includeJs: false,
          reason: "页面内容较少但有大量脚本,可能依赖 JS 渲染。建议不包含 JS,保存已渲染内容。"
        };
      } else {
        pageTypeDetection.renderType = "static";
        pageTypeDetection.jsDependency = "none";
        pageTypeDetection.recommendation = {
          includeJs: false,
          reason: "静态页面,内容已完整。建议不包含 JS 以减小文件大小。"
        };
      }
    }

    return pageTypeDetection;
  });
}

/**
 * 打印页面类型检测结果
 */
export function logPageTypeDetection(pageType: PageTypeDetection): void {
  console.log(`📊 页面类型检测:`);
  console.log(`   框架: ${pageType.framework || '无'}`);
  console.log(`   渲染方式: ${pageType.renderType}`);
  console.log(`   JS 依赖: ${pageType.jsDependency}`);
  console.log(`   建议: ${pageType.recommendation.reason}`);
}