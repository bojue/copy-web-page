import { Page } from "puppeteer";

/**
 * 内容验证器 - 检测页面内容完整性
 */

export interface ContentValidation {
  bodyTextLength: number;
  hasImages: boolean;
  hasLinks: boolean;
  hasErrorIndicator: boolean;
  isEmpty: boolean;
  title: string;
}

/**
 * 验证页面内容
 */
export async function validatePageContent(page: Page): Promise<ContentValidation> {
  return await page.evaluate(() => {
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

    return {
      bodyTextLength,
      hasImages,
      hasLinks,
      hasErrorIndicator,
      isEmpty: bodyTextLength < 100 && !hasImages,
      title: document.title || ""
    };
  });
}

/**
 * 打印内容验证警告
 */
export function logContentValidation(validation: ContentValidation): void {
  if (validation.isEmpty) {
    console.warn(`⚠️  警告: 页面内容可能为空 (文本长度: ${validation.bodyTextLength})`);
  }
  if (validation.hasErrorIndicator) {
    console.warn(`⚠️  警告: 检测到可能的反爬虫或错误页面`);
  }
}