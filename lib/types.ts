export interface RateLimitOptions {
  /** 最大并发请求数，默认 10 */
  concurrency: number;
  /** 每时间窗口内允许的请求数，0 = 不限制，默认 0 */
  requestsPerWindow: number;
  /** 时间窗口大小（毫秒），默认 2000 */
  windowMs: number;
  /** 批次间延迟（毫秒），默认 0 */
  interBatchDelayMs: number;
  /** 单请求最小间隔（毫秒），默认 0 */
  perRequestDelayMs: number;
  /** 是否启用自适应限流（遇到 429/403 自动降速），默认 true */
  adaptive: boolean;
}

export const DEFAULT_RATE_LIMIT: RateLimitOptions = {
  concurrency: 10,
  requestsPerWindow: 0,
  windowMs: 2000,
  interBatchDelayMs: 200,
  perRequestDelayMs: 0,
  adaptive: true,
};

/** 预设配置 */
export const RATE_LIMIT_PRESETS: Record<string, RateLimitOptions> = {
  aggressive: {
    concurrency: 20,
    requestsPerWindow: 0,
    windowMs: 2000,
    interBatchDelayMs: 0,
    perRequestDelayMs: 0,
    adaptive: true,
  },
  normal: {
    concurrency: 10,
    requestsPerWindow: 0,
    windowMs: 2000,
    interBatchDelayMs: 200,
    perRequestDelayMs: 0,
    adaptive: true,
  },
  careful: {
    concurrency: 5,
    requestsPerWindow: 10,
    windowMs: 2000,
    interBatchDelayMs: 500,
    perRequestDelayMs: 100,
    adaptive: true,
  },
  stealth: {
    concurrency: 3,
    requestsPerWindow: 5,
    windowMs: 3000,
    interBatchDelayMs: 1000,
    perRequestDelayMs: 300,
    adaptive: true,
  },
};

export interface CloneOptions {
  url: string;
  depth: number; // 1-3
  includeJs: boolean;
  rateLimit?: Partial<RateLimitOptions>;
}

export interface Asset {
  url: string;
  type: "css" | "js" | "image" | "font" | "other";
  localPath: string; // relative path in output folder
}

export interface PageResult {
  url: string;
  html: string;
  assets: Asset[];
}

export interface CloneProgress {
  stage: "rendering" | "discovering" | "downloading" | "rewriting" | "packaging" | "done" | "error";
  message: string;
  percent: number;
  details?: {
    current?: number;
    total?: number;
    itemType?: string;
    throttleState?: {
      isThrottled: boolean;
      multiplier: number;
      reason?: string;
    };
    eta?: {
      remainingSeconds: number;
      downloadSpeed?: string; // e.g. "2.5 MB/s"
    };
  };
}

export interface CloneResult {
  jobId: string;
  pages: number;
  assets: number;
  totalSize: number; // 总资源大小（字节）
  zipPath: string;
}

// 页面类型检测结果
export interface PageTypeDetection {
  // 框架检测
  framework?: "react" | "vue" | "angular" | "nextjs" | "nuxtjs" | "none";

  // 内容渲染方式
  renderType: "static" | "spa" | "hybrid";

  // JS 依赖程度
  jsDependency: "none" | "optional" | "required";

  // 建议
  recommendation: {
    includeJs: boolean;
    reason: string;
  };

  // 检测到的特征
  features: {
    hasReactRoot: boolean;
    hasVueApp: boolean;
    hasAngularApp: boolean;
    hasNextData: boolean;
    hasNuxtData: boolean;
    emptyBodyBeforeJs: boolean;
    dynamicContentRatio: number; // 0-1, JS 生成内容的比例
  };
}

// 错误诊断结果
export interface CloneError {
  type: "network" | "blocked" | "captcha" | "empty" | "timeout" | "unknown";
  message: string;
  userMessage: string; // 用户友好的错误消息
  suggestion: string; // 解决建议
  canRetry: boolean;
  technicalDetails?: string;
}
