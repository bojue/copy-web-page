import { Page } from "puppeteer";

/**
 * CSS 计算器 - 提取和计算关键 CSS
 */

export interface ComputedCssResult {
  allStyleRules: string[];
  fontFaces: string[];
  keyframes: string[];
  mediaRules: string[];
  pseudoStyles: string[];
  customProperties: string[];
  interactionRules: string[];
  supportsRules: string[];
  layerRules: string[];
}

/**
 * 在浏览器中计算完整的 CSS
 */
export async function computeCss(page: Page): Promise<ComputedCssResult> {
  return await page.evaluate(() => {
    let classIndex = 0;

    // 1. 捕获所有可访问样式表的完整规则(作为 CSS 下载失败的回退)
    const allStyleRules: string[] = [];
    Array.from(document.styleSheets).forEach((sheet) => {
      try {
        // 跳过内联 style 标签(它们已经在 HTML 中了)
        if (sheet.ownerNode && (sheet.ownerNode as HTMLElement).tagName === "STYLE") return;
        Array.from(sheet.cssRules).forEach((rule) => {
          // 捕获普通样式规则(非特殊 at-rule)
          if (rule instanceof CSSStyleRule) {
            allStyleRules.push(rule.cssText);
          }
        });
      } catch (e) {
        // CORS - 无法访问跨域样式表
      }
    });

    // 2. 提取 @font-face 规则
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

    // 3. 提取 @keyframes 规则
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

    // 4. 提取 @media 查询
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

    // 5. 提取 CSS 自定义属性(CSS 变量)
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

    // 6. 提取交互状态规则(:hover, :focus, :active 等)
    const interactionRules: string[] = [];
    const interactionPseudos = [
      ":hover", ":focus", ":active", ":focus-visible", ":focus-within",
      ":checked", ":disabled", ":enabled", ":required", ":optional",
      ":valid", ":invalid", ":read-only", ":read-write", ":placeholder-shown",
      ":first-child", ":last-child", ":nth-child", ":nth-of-type",
      ":first-of-type", ":last-of-type", ":only-child", ":only-of-type",
      ":empty", ":not", ":is", ":where", ":has", ":target"
    ];

    Array.from(document.styleSheets).forEach((sheet) => {
      try {
        Array.from(sheet.cssRules).forEach((rule) => {
          if (rule instanceof CSSStyleRule) {
            const sel = rule.selectorText;
            if (sel && interactionPseudos.some(pseudo => sel.includes(pseudo))) {
              interactionRules.push(rule.cssText);
            }
          }
        });
      } catch (e) {}
    });

    // 7. 提取 @supports 规则
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

    // 8. 提取 @layer 规则(CSS Cascade Layers)
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

    // 9. 提取伪元素样式(::before, ::after, ::placeholder, ::marker)
    const pseudoStyles: string[] = extractPseudoElementStyles(classIndex);

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

    // 辅助函数: 提取伪元素样式
    function extractPseudoElementStyles(startIndex: number): string[] {
      const pseudoStyles: string[] = [];
      const MAX_PSEUDO_ELEMENTS = 3000; // 最多处理 3000 个元素
      let classIdx = startIndex;

      const allElements = document.querySelectorAll("*");
      const elementsToProcess = allElements.length > MAX_PSEUDO_ELEMENTS
        ? Array.from(allElements).filter((el) => {
            // 只处理可见元素
            const rect = el.getBoundingClientRect();
            return rect.width > 0 || rect.height > 0;
          }).slice(0, MAX_PSEUDO_ELEMENTS)
        : Array.from(allElements);

      for (const el of elementsToProcess) {
        const tagName = el.tagName.toLowerCase();
        if (["script", "style", "link", "meta", "head", "title", "br", "hr"].includes(tagName)) continue;

        // 检查常用伪元素
        const pseudosToCheck = ["::before", "::after"];
        // 特定元素检查其他伪元素
        if (tagName === "input" || tagName === "textarea") pseudosToCheck.push("::placeholder");
        if (el.closest("ul, ol, li")) pseudosToCheck.push("::marker");

        for (const pseudo of pseudosToCheck) {
          const computed = window.getComputedStyle(el, pseudo);
          const content = computed.content;

          // ::before/::after 需要检查 content
          const needsContent = pseudo === "::before" || pseudo === "::after";
          if (needsContent && (!content || content === "none" || content === "normal")) continue;
          if (!needsContent) {
            if (pseudo === "::placeholder" && tagName !== "input" && tagName !== "textarea") continue;
            if (pseudo === "::marker" && computed.display !== "list-item") continue;
          }

          const cls = `_pe${classIdx++}`;
          el.classList.add(cls);

          let rule = `.${cls}${pseudo} {`;
          if (needsContent) rule += ` content: ${content};`;

          // 精简属性列表
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

      return pseudoStyles;
    }
  });
}