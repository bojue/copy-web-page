import { CloneError } from "../types";

/**
 * 错误诊断系统 - 增强版
 * 根据错误类型和上下文，提供详细的诊断信息和解决建议
 * 新增：失败资源追踪、重试建议、性能分析
 */

export interface DiagnosticContext {
  url?: string;
  contentValidation?: any;
  statusCode?: number;
  pageTypeDetection?: any;
  failedAssets?: Array<{ url: string; reason?: string }>;
  renderTime?: number;
  totalAssets?: number;
}

export function diagnoseError(error: any, context?: DiagnosticContext): CloneError {
  const errorMessage = error.message || String(error);
  const lowerMessage = errorMessage.toLowerCase();

  // 1. 检测验证码/人机验证
  if (
    lowerMessage.includes("captcha") ||
    lowerMessage.includes("recaptcha") ||
    lowerMessage.includes("cloudflare") ||
    lowerMessage.includes("security check") ||
    context?.contentValidation?.hasErrorIndicator
  ) {
    return {
      type: "captcha",
      message: errorMessage,
      userMessage: "⚠️ 检测到验证码或人机验证",
      suggestion:
        "该网站启用了人机验证（Captcha/Cloudflare）。\n\n" +
        "解决方案：\n" +
        "1. 在浏览器中手动访问该页面并完成验证\n" +
        "2. 等待 5-10 分钟后重试（冷却期）\n" +
        "3. 如果是 Cloudflare 验证，可能需要更换 IP 或网络环境\n" +
        "4. 某些高级验证码（hCaptcha、reCAPTCHA v3）无法自动绕过\n" +
        "5. 建议：如果必须克隆，考虑在登录状态下手动保存",
      canRetry: true,
      technicalDetails: errorMessage,
    };
  }

  // 2. 检测反爬虫/访问被拒绝
  if (
    lowerMessage.includes("403") ||
    lowerMessage.includes("forbidden") ||
    lowerMessage.includes("access denied") ||
    lowerMessage.includes("blocked") ||
    lowerMessage.includes("bot detected") ||
    context?.statusCode === 403
  ) {
    return {
      type: "blocked",
      message: errorMessage,
      userMessage: "🚫 访问被拒绝（403 Forbidden）",
      suggestion:
        "该网站的反爬虫系统检测到了自动化访问。\n\n" +
        "已采取的绕过措施：\n" +
        "✓ Stealth 模式隐藏自动化特征\n" +
        "✓ 模拟真实用户行为（随机滚动、延迟）\n" +
        "✓ 完善浏览器指纹（Headers、UA、Canvas）\n" +
        "✓ 禁用 WebDriver 标识\n\n" +
        "仍然失败可能的原因：\n" +
        "1. IP 被封禁或触发频率限制（短时间内多次访问）\n" +
        "2. 需要登录或 Cookie 才能访问\n" +
        "3. 高级反爬虫系统（企业级 WAF、DataDome、PerimeterX）\n" +
        "4. 检测到数据中心 IP（非住宅 IP）\n\n" +
        "建议操作：\n" +
        "• 等待 10-30 分钟后重试（冷却期）\n" +
        "• 尝试更换网络环境（如切换到移动热点）\n" +
        "• 如果需要登录，建议在浏览器中登录后手动保存页面\n" +
        "• 对于高安全性网站，自动化克隆可能无法实现",
      canRetry: true,
      technicalDetails: errorMessage + (context?.statusCode ? ` (HTTP ${context.statusCode})` : ""),
    };
  }

  // 3. 检测页面未找到
  if (
    lowerMessage.includes("404") ||
    lowerMessage.includes("not found") ||
    context?.statusCode === 404
  ) {
    return {
      type: "network",
      message: errorMessage,
      userMessage: "❌ 页面不存在（404 Not Found）",
      suggestion:
        "请检查 URL 是否正确。\n\n" +
        "可能的原因：\n" +
        "1. URL 拼写错误\n" +
        "2. 页面已被删除或移动\n" +
        "3. 需要特定的访问路径或参数",
      canRetry: false,
      technicalDetails: errorMessage,
    };
  }

  // 4. 检测空白页面 - 增强版
  // 注意：只有在确实提供了 contentValidation 时才判空，
  // 否则缺省时 (undefined || 0) < 100 恒为 true，会误吞后续所有网络/超时错误
  if (
    context?.contentValidation != null &&
    (context.contentValidation.isEmpty ||
      (context.contentValidation.bodyTextLength || 0) < 100)
  ) {
    const textLength = context?.contentValidation?.bodyTextLength || 0;
    const pageType = context?.pageTypeDetection;

    let additionalInfo = "";
    if (pageType) {
      additionalInfo = `\n检测到的页面类型：${pageType.framework || "静态页面"}`;
      if (pageType.jsDependency === "required") {
        additionalInfo += "\n⚠️ 警告：该页面严重依赖 JavaScript 渲染，可能需要完整的浏览器环境";
      }
    }

    return {
      type: "empty",
      message: "页面内容为空或过少",
      userMessage: "⚠️ 页面内容为空或不完整",
      suggestion:
        `页面文本长度仅 ${textLength} 字符（正常应 > 500）。${additionalInfo}\n\n` +
        "可能的原因（按概率排序）：\n" +
        "1. 页面需要登录或 Cookie 才能查看完整内容\n" +
        "2. 内容由 JavaScript 动态加载，但 API 调用失败或被拦截\n" +
        "3. 反爬虫系统返回了空白欺骗页面\n" +
        "4. 页面加载未完成就被截取\n" +
        "5. 页面依赖特定的浏览器特性或扩展\n\n" +
        "排查步骤：\n" +
        "• 在无痕模式的浏览器中打开该 URL，确认是否显示内容\n" +
        "• 检查浏览器控制台是否有 API 错误或跨域错误\n" +
        "• 如果需要登录，先登录后再手动保存页面\n" +
        "• 检查是否触发了反爬虫（页面标题可能包含 'Access Denied'）\n" +
        "• 尝试启用 includeJs 选项（但可能导致其他问题）",
      canRetry: true,
      technicalDetails: `Body text: ${textLength} chars, Has images: ${context?.contentValidation?.hasImages}, Has links: ${context?.contentValidation?.hasLinks}`,
    };
  }

  // 5. 检测网络超时
  if (
    lowerMessage.includes("timeout") ||
    lowerMessage.includes("timed out") ||
    lowerMessage.includes("navigation timeout")
  ) {
    return {
      type: "timeout",
      message: errorMessage,
      userMessage: "⏱️ 页面加载超时",
      suggestion:
        "页面加载时间过长。\n\n" +
        "可能的原因：\n" +
        "1. 网络连接不稳定\n" +
        "2. 目标网站响应缓慢\n" +
        "3. 页面资源过多或过大\n" +
        "4. 服务器压力大\n\n" +
        "建议：\n" +
        "• 检查网络连接\n" +
        "• 稍后重试\n" +
        "• 如果是大型页面，可能需要更长时间",
      canRetry: true,
      technicalDetails: errorMessage,
    };
  }

  // 6. 检测连接被重置/无法建立（常见于网络封锁、防火墙拦截）
  if (
    lowerMessage.includes("err_connection_reset") ||
    lowerMessage.includes("err_connection_timed_out") ||
    lowerMessage.includes("err_connection_closed") ||
    lowerMessage.includes("err_connection_refused") ||
    lowerMessage.includes("err_timed_out") ||
    lowerMessage.includes("err_tunnel_connection_failed") ||
    lowerMessage.includes("err_proxy_connection_failed") ||
    lowerMessage.includes("err_name_not_resolved") ||
    lowerMessage.includes("econnreset")
  ) {
    return {
      type: "network",
      message: errorMessage,
      userMessage: "🚧 无法连接到目标网站（连接被重置或超时）",
      suggestion:
        "浏览器能解析域名，但连接在建立过程中被中断。这通常不是目标网站本身的问题，而是所在网络无法访问它。\n\n" +
        "最常见原因：\n" +
        "1. 网络封锁 / 防火墙拦截（例如某些地区无法直接访问维基百科、Google 等站点）\n" +
        "2. 当前网络的出口对该站点做了阻断（连接在 TLS 握手阶段被重置）\n" +
        "3. 代理或 VPN 配置异常\n" +
        "4. DNS 污染导致连到了错误的地址\n\n" +
        "排查步骤：\n" +
        "• 先在本机浏览器直接打开该 URL，确认能否正常访问\n" +
        "• 如果浏览器也打不开，说明是网络层被阻断，克隆同样无法完成\n" +
        "• 确认可以访问后，换一个网络环境（如切换到能访问该站点的网络/代理）再重试\n" +
        "• 若需通过代理访问被限制的站点，请在部署环境为服务配置代理后重试",
      canRetry: true,
      technicalDetails: errorMessage,
    };
  }

  // 7. 检测网络错误
  if (
    lowerMessage.includes("net::err") ||
    lowerMessage.includes("network") ||
    lowerMessage.includes("connection") ||
    lowerMessage.includes("enotfound") ||
    lowerMessage.includes("econnrefused")
  ) {
    return {
      type: "network",
      message: errorMessage,
      userMessage: "🌐 网络连接错误",
      suggestion:
        "无法连接到目标网站。\n\n" +
        "可能的原因：\n" +
        "1. 网络连接断开\n" +
        "2. DNS 解析失败\n" +
        "3. 目标服务器宕机\n" +
        "4. 防火墙或代理设置\n\n" +
        "建议：\n" +
        "• 检查网络连接\n" +
        "• 在浏览器中验证网站是否可访问\n" +
        "• 检查 URL 是否正确",
      canRetry: true,
      technicalDetails: errorMessage,
    };
  }

  // 8. 通用错误
  return {
    type: "unknown",
    message: errorMessage,
    userMessage: "❌ 克隆失败",
    suggestion:
      "发生了未知错误。\n\n" +
      "建议：\n" +
      "• 检查 URL 是否正确\n" +
      "• 在浏览器中验证页面是否正常访问\n" +
      "• 查看下方技术详情了解具体错误\n" +
      "• 如果问题持续，可能是程序 bug",
    canRetry: true,
    technicalDetails: errorMessage,
  };
}

/**
 * 格式化错误信息用于用户显示
 */
export function formatErrorForUser(diagnostic: CloneError): string {
  let message = `${diagnostic.userMessage}\n\n`;
  message += `${diagnostic.suggestion}\n\n`;

  if (diagnostic.technicalDetails) {
    message += `技术详情：\n${diagnostic.technicalDetails}`;
  }

  return message;
}

/**
 * 判断错误是否可以重试（增强版）
 */
export function shouldRetry(diagnostic: CloneError, attemptCount: number): boolean {
  if (!diagnostic.canRetry) return false;
  if (attemptCount >= 3) return false;

  // 某些错误类型的重试策略
  switch (diagnostic.type) {
    case "empty":
      // 空白页面：只重试 1 次
      return attemptCount < 1;
    case "captcha":
      // 验证码：不重试（重试只会加剧问题）
      return false;
    case "blocked":
      // 403：重试 1 次（等待冷却）
      return attemptCount < 1;
    case "timeout":
      // 超时：可以重试 2 次
      return attemptCount < 2;
    case "network":
      // 网络错误：可以重试 3 次
      return attemptCount < 3;
    default:
      return attemptCount < 2;
  }
}

/**
 * 生成失败资源报告
 */
export function generateFailedAssetsReport(failedAssets: Array<{ url: string; reason?: string }>): string {
  if (failedAssets.length === 0) {
    return "✅ 所有资源下载成功";
  }

  const total = failedAssets.length;
  const byType: Record<string, number> = {};

  failedAssets.forEach((asset) => {
    const ext = asset.url.split(".").pop()?.split("?")[0] || "unknown";
    byType[ext] = (byType[ext] || 0) + 1;
  });

  let report = `⚠️ 共 ${total} 个资源下载失败：\n\n`;
  report += "按类型统计：\n";
  Object.entries(byType)
    .sort(([, a], [, b]) => b - a)
    .forEach(([ext, count]) => {
      report += `  • ${ext}: ${count} 个\n`;
    });

  report += "\n失败资源列表（前 10 个）：\n";
  failedAssets.slice(0, 10).forEach((asset, index) => {
    const shortUrl = asset.url.length > 80 ? asset.url.substring(0, 77) + "..." : asset.url;
    report += `  ${index + 1}. ${shortUrl}\n`;
    if (asset.reason) {
      report += `     原因: ${asset.reason}\n`;
    }
  });

  if (failedAssets.length > 10) {
    report += `  ... 及其他 ${failedAssets.length - 10} 个资源\n`;
  }

  return report;
}

/**
 * 生成性能分析报告
 */
export function generatePerformanceReport(context: DiagnosticContext): string {
  const { renderTime, totalAssets, failedAssets } = context;

  if (!renderTime || !totalAssets) {
    return "无性能数据";
  }

  const successAssets = totalAssets - (failedAssets?.length || 0);
  const successRate = ((successAssets / totalAssets) * 100).toFixed(1);

  let report = "📊 性能统计：\n\n";
  report += `  渲染时间: ${(renderTime / 1000).toFixed(2)}s\n`;
  report += `  总资源数: ${totalAssets}\n`;
  report += `  成功下载: ${successAssets} (${successRate}%)\n`;

  if (failedAssets && failedAssets.length > 0) {
    report += `  失败资源: ${failedAssets.length}\n`;
  }

  // 性能评估
  if (renderTime < 5000) {
    report += "\n✅ 性能良好";
  } else if (renderTime < 15000) {
    report += "\n⚠️ 性能一般（渲染较慢）";
  } else {
    report += "\n❌ 性能较差（渲染很慢）";
  }

  return report;
}

/**
 * 生成完整的诊断报告
 */
export function generateFullDiagnosticReport(
  diagnostic: CloneError,
  context?: DiagnosticContext
): string {
  let report = formatErrorForUser(diagnostic);

  if (context?.failedAssets && context.failedAssets.length > 0) {
    report += "\n\n" + generateFailedAssetsReport(context.failedAssets);
  }

  if (context?.renderTime && context?.totalAssets) {
    report += "\n\n" + generatePerformanceReport(context);
  }

  return report;
}
