import * as fs from "fs";
import * as path from "path";
import { Asset } from "../types";

/**
 * HTML 处理器
 * 负责 HTML 内容的处理、重写和优化
 */
export class HtmlProcessor {
  /**
   * 注入计算后的 CSS 到 HTML
   */
  static injectComputedCss(html: string, cssPath: string): string {
    const linkTag = `<link rel="stylesheet" href="${cssPath}">`;
    // 尝试插入到 </head> 之前
    if (html.includes("</head>")) {
      return html.replace("</head>", `${linkTag}\n</head>`);
    }
    // 降级：插入到开头
    return linkTag + "\n" + html;
  }

  /**
   * 替换 Canvas 元素为图片快照
   */
  static replaceCanvasWithImages(
    html: string,
    snapshots: Array<{ selector: string; dataUrl: string }>,
    assets: Asset[]
  ): string {
    for (const snapshot of snapshots) {
      // 查找对应的资源
      const asset = assets.find((a) => a.url === `__canvas__${snapshot.selector}`);
      if (!asset || !asset.localPath) continue;

      // 构建选择器的属性表示
      const selectorAttr = snapshot.selector.replace(/\[|\]/g, "").replace("=", '="') + '"';

      // 创建正则表达式匹配 canvas 标签
      const canvasRegex = new RegExp(
        `<canvas([^>]*${selectorAttr.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}[^>]*)>.*?</canvas>`,
        "gs"
      );

      html = html.replace(canvasRegex, (match, attrs) => {
        // 提取原始 canvas 的宽高属性
        const widthMatch = attrs.match(/width="?(\d+)"?/);
        const heightMatch = attrs.match(/height="?(\d+)"?/);
        const width = widthMatch ? ` width="${widthMatch[1]}"` : "";
        const height = heightMatch ? ` height="${heightMatch[1]}"` : "";

        return `<img src="${asset.localPath}"${width}${height} alt="canvas snapshot" style="display:block;">`;
      });
    }
    return html;
  }

  /**
   * 重写 CSS 中的 URL 引用
   */
  static rewriteCssUrls(
    cssPath: string,
    content: string,
    assets: Asset[],
    pageUrl: string
  ): string {
    // 构建 URL → 相对路径映射
    const urlMap = new Map<string, string>();
    const cssDir = path.dirname(cssPath);

    for (const asset of assets) {
      if (!asset.localPath) continue;

      const relativePath = path.relative(cssDir, asset.localPath);
      urlMap.set(asset.url, relativePath);

      try {
        const parsed = new URL(asset.url);
        urlMap.set(parsed.pathname, relativePath);
        if (parsed.search) {
          urlMap.set(parsed.pathname + parsed.search, relativePath);
        }
      } catch {
        // 忽略无效 URL
      }
    }

    // 匹配所有 url() 引用
    const urlRegex = /url\(["']?([^"')]+)["']?\)/g;
    const replacements: Array<[string, string]> = [];

    let match;
    while ((match = urlRegex.exec(content)) !== null) {
      const rawUrl = match[1];

      // 跳过 data: 和锚点
      if (rawUrl.startsWith("data:") || rawUrl.startsWith("#")) continue;

      // 尝试直接匹配
      let localPath = urlMap.get(rawUrl);

      if (!localPath) {
        // 解析为绝对 URL 后重试
        try {
          const absolute = new URL(rawUrl, pageUrl).href;
          localPath = urlMap.get(absolute);

          if (!localPath) {
            const parsed = new URL(absolute);
            localPath = urlMap.get(parsed.pathname + parsed.search) || urlMap.get(parsed.pathname);
          }
        } catch {
          // 忽略解析失败
        }
      }

      if (localPath) {
        replacements.push([match[0], `url("${localPath}")`]);
      }
    }

    // 应用所有替换
    for (const [from, to] of replacements) {
      content = content.replaceAll(from, to);
    }

    return content;
  }

  /**
   * 去重资源列表
   */
  static deduplicateAssets(assets: Asset[]): Asset[] {
    const seen = new Set<string>();
    const result: Asset[] = [];

    for (const asset of assets) {
      if (!seen.has(asset.url)) {
        seen.add(asset.url);
        result.push(asset);
      }
    }

    return result;
  }
}
