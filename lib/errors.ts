/**
 * 自定义错误类型系统
 * 提供类型安全的错误处理和用户友好的错误消息
 */

export type ErrorType = "network" | "blocked" | "captcha" | "timeout" | "validation" | "unknown";

export interface ErrorDetails {
  type: ErrorType;
  message: string;
  userMessage: string;
  suggestion: string;
  retryable: boolean;
  technicalDetails?: string;
  statusCode?: number;
}

/**
 * 基础克隆错误类
 */
export class CloneError extends Error {
  public readonly type: ErrorType;
  public readonly userMessage: string;
  public readonly suggestion: string;
  public readonly retryable: boolean;
  public readonly technicalDetails?: string;
  public readonly statusCode?: number;

  constructor(details: ErrorDetails) {
    super(details.message);
    this.name = "CloneError";
    this.type = details.type;
    this.userMessage = details.userMessage;
    this.suggestion = details.suggestion;
    this.retryable = details.retryable;
    this.technicalDetails = details.technicalDetails;
    this.statusCode = details.statusCode;

    // 维护正确的原型链
    Object.setPrototypeOf(this, CloneError.prototype);
  }

  /**
   * 将错误转换为 JSON 格式（用于 API 响应）
   */
  toJSON() {
    return {
      type: this.type,
      message: this.userMessage,
      suggestion: this.suggestion,
      retryable: this.retryable,
      technicalDetails: this.technicalDetails,
      statusCode: this.statusCode,
    };
  }
}

/**
 * 网络错误
 */
export class NetworkError extends CloneError {
  constructor(message: string, technicalDetails?: string) {
    super({
      type: "network",
      message,
      userMessage: "网络连接失败",
      suggestion: "请检查网络连接，或稍后重试",
      retryable: true,
      technicalDetails,
    });
    this.name = "NetworkError";
  }
}

/**
 * 被阻止/反爬虫错误
 */
export class BlockedError extends CloneError {
  constructor(message: string, statusCode?: number) {
    super({
      type: "blocked",
      message,
      userMessage: "访问被目标网站阻止",
      suggestion: "该网站可能有反爬虫保护。尝试降低请求频率或使用「隐身模式」",
      retryable: true,
      statusCode,
    });
    this.name = "BlockedError";
  }
}

/**
 * 验证码错误
 */
export class CaptchaError extends CloneError {
  constructor(message: string) {
    super({
      type: "captcha",
      message,
      userMessage: "网站需要验证码",
      suggestion: "该网站需要人工验证，无法自动克隆",
      retryable: false,
    });
    this.name = "CaptchaError";
  }
}

/**
 * 超时错误
 */
export class TimeoutError extends CloneError {
  constructor(message: string, technicalDetails?: string) {
    super({
      type: "timeout",
      message,
      userMessage: "请求超时",
      suggestion: "页面加载时间过长。可以尝试增加超时时间或稍后重试",
      retryable: true,
      technicalDetails,
    });
    this.name = "TimeoutError";
  }
}

/**
 * 验证错误
 */
export class ValidationError extends CloneError {
  constructor(message: string, details?: string) {
    super({
      type: "validation",
      message,
      userMessage: "参数验证失败",
      suggestion: "请检查输入参数是否正确",
      retryable: false,
      technicalDetails: details,
    });
    this.name = "ValidationError";
  }
}

/**
 * 从标准 Error 或 HTTP 状态码创建适当的 CloneError
 */
export function createErrorFromResponse(statusCode: number, url: string): CloneError {
  if (statusCode === 403) {
    return new BlockedError(`访问被拒绝 (403): ${url}`, statusCode);
  }

  if (statusCode === 429) {
    return new BlockedError(`请求过于频繁 (429): ${url}`, statusCode);
  }

  if (statusCode >= 500) {
    return new NetworkError(`服务器错误 (${statusCode}): ${url}`);
  }

  if (statusCode === 404) {
    return new NetworkError(`页面不存在 (404): ${url}`);
  }

  return new CloneError({
    type: "unknown",
    message: `HTTP ${statusCode}: ${url}`,
    userMessage: `请求失败 (${statusCode})`,
    suggestion: "请检查 URL 是否正确，或稍后重试",
    retryable: statusCode >= 500,
    statusCode,
  });
}

/**
 * 从标准 Error 创建 CloneError
 */
export function wrapError(error: unknown): CloneError {
  if (error instanceof CloneError) {
    return error;
  }

  if (error instanceof Error) {
    const message = error.message.toLowerCase();

    // 超时相关（含 puppeteer 的 net::ERR_*TIMED_OUT 下划线形式）
    if (
      message.includes("timeout") ||
      message.includes("timed out") ||
      message.includes("timed_out")
    ) {
      return new TimeoutError(error.message, error.stack);
    }

    // 网络连接相关（含 puppeteer 的 net::ERR_CONNECTION_* / 连接被重置）
    if (
      message.includes("econnrefused") ||
      message.includes("enotfound") ||
      message.includes("econnreset") ||
      message.includes("net::err") ||
      message.includes("network") ||
      message.includes("fetch failed")
    ) {
      return new NetworkError(error.message, error.stack);
    }

    // 反爬虫相关
    if (message.includes("403") || message.includes("forbidden")) {
      return new BlockedError(error.message);
    }

    if (message.includes("429") || message.includes("rate limit")) {
      return new BlockedError(error.message);
    }

    // 验证码相关
    if (message.includes("captcha") || message.includes("recaptcha")) {
      return new CaptchaError(error.message);
    }
  }

  // 未知错误
  return new CloneError({
    type: "unknown",
    message: error instanceof Error ? error.message : String(error),
    userMessage: "发生未知错误",
    suggestion: "请稍后重试，或联系支持",
    retryable: false,
    technicalDetails: error instanceof Error ? error.stack : undefined,
  });
}

/**
 * 判断错误是否可重试
 */
export function isRetryableError(error: unknown): boolean {
  if (error instanceof CloneError) {
    return error.retryable;
  }

  // 对于非 CloneError，使用启发式判断
  if (error instanceof Error) {
    const message = error.message.toLowerCase();
    return (
      message.includes("timeout") ||
      message.includes("network") ||
      message.includes("econnrefused") ||
      message.includes("500") ||
      message.includes("502") ||
      message.includes("503") ||
      message.includes("504")
    );
  }

  return false;
}
