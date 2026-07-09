/**
 * 全局配置管理
 * 优先级：环境变量 > 默认值
 */

export const config = {
  download: {
    /** 最大并发下载数 */
    concurrency: Number(process.env.DOWNLOAD_CONCURRENCY) || 20,
    /** 最大重试次数 */
    maxRetries: Number(process.env.MAX_RETRIES) || 3,
    /** 请求超时时间（毫秒） */
    timeout: Number(process.env.DOWNLOAD_TIMEOUT) || 15000,
  },

  browser: {
    /** Puppeteer 超时时间（毫秒） */
    timeout: Number(process.env.BROWSER_TIMEOUT) || 30000,
    /** 页面加载等待时间（毫秒） */
    waitForNetworkIdle: Number(process.env.WAIT_FOR_NETWORK_IDLE) || 2000,
  },

  clone: {
    /** 自动清理临时文件的延迟时间（毫秒），默认1小时 */
    autoCleanupDelay: Number(process.env.AUTO_CLEANUP_DELAY) || 3600000,
    /** SSE 心跳检查间隔（毫秒） */
    heartbeatInterval: Number(process.env.HEARTBEAT_INTERVAL) || 15000,
    /** SSE 心跳阈值（毫秒），超过此时间无消息则发送心跳 */
    heartbeatThreshold: Number(process.env.HEARTBEAT_THRESHOLD) || 20000,
  },

  multiPage: {
    /** 多页爬取时的最小页面间延迟（毫秒） */
    minPageDelay: Number(process.env.MIN_PAGE_DELAY) || 1500,
    /** 多页爬取时的最大页面间延迟（毫秒） */
    maxPageDelay: Number(process.env.MAX_PAGE_DELAY) || 3500,
    /** 每层最多发现链接数 */
    maxLinksPerDepth: Number(process.env.MAX_LINKS_PER_DEPTH) || 10,
  },
};
