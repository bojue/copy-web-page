import puppeteer, { Browser, Page } from "puppeteer";

/**
 * 浏览器实例池，用于复用浏览器实例提升多页爬取性能
 * 优化点：
 * 1. 添加健康检查机制，自动重启僵尸浏览器
 * 2. 页面数量追踪，防止内存泄漏
 * 3. 自动清理长期未使用的实例
 * 4. 超时保护机制
 */
class BrowserPool {
  private browser: Browser | null = null;
  private inUse = false;
  private createdAt: number = 0;
  private pageCount: number = 0;
  private lastHealthCheck: number = 0;

  // 配置
  private readonly MAX_PAGES = 20; // 单个浏览器最大页面数
  private readonly MAX_LIFETIME = 10 * 60 * 1000; // 浏览器最大存活时间 10 分钟
  private readonly HEALTH_CHECK_INTERVAL = 30 * 1000; // 健康检查间隔 30 秒

  async getBrowser(): Promise<Browser> {
    // 健康检查：如果浏览器存在但不健康，重启
    if (this.browser) {
      const needRestart = await this.needsRestart();
      if (needRestart) {
        console.log("🔄 浏览器实例不健康，正在重启...");
        await this.closeBrowser();
      }
    }

    if (!this.browser) {
      this.browser = await puppeteer.launch({
        headless: true,
        args: [
          "--no-sandbox",
          "--disable-setuid-sandbox",
          "--disable-web-security",
          "--disable-features=IsolateOrigins,site-per-process",
          "--allow-running-insecure-content",
          "--disable-blink-features=AutomationControlled",
          // 性能优化参数
          "--disable-dev-shm-usage", // 避免共享内存不足
          "--disable-gpu", // 禁用 GPU 加速（无头模式不需要）
          "--no-first-run",
          "--no-zygote",
          "--single-process", // 单进程模式，减少资源占用
          // 内存优化
          "--disable-background-networking",
          "--disable-background-timer-throttling",
          "--disable-backgrounding-occluded-windows",
          "--disable-breakpad",
          "--disable-component-extensions-with-background-pages",
          "--disable-extensions",
          "--disable-features=TranslateUI,BlinkGenPropertyTrees",
          "--disable-ipc-flooding-protection",
          "--disable-renderer-backgrounding",
          // 反检测参数
          "--window-size=1920,1080",
        ],
      });
      this.createdAt = Date.now();
      this.pageCount = 0;
      this.lastHealthCheck = Date.now();
      console.log("✅ 新浏览器实例已创建");
    }
    this.inUse = true;
    return this.browser;
  }

  async closeBrowser(): Promise<void> {
    if (this.browser) {
      try {
        await this.browser.close();
      } catch (err) {
        console.warn("⚠️  关闭浏览器时出错:", err);
      }
      this.browser = null;
    }
    this.inUse = false;
    this.pageCount = 0;
    this.createdAt = 0;
  }

  /**
   * 检查浏览器是否需要重启
   */
  private async needsRestart(): Promise<boolean> {
    if (!this.browser) return false;

    const now = Date.now();

    // 1. 检查是否超过最大存活时间
    if (now - this.createdAt > this.MAX_LIFETIME) {
      console.log("⏱️  浏览器已达到最大存活时间");
      return true;
    }

    // 2. 定期健康检查（避免过于频繁）
    if (now - this.lastHealthCheck < this.HEALTH_CHECK_INTERVAL) {
      return false;
    }

    this.lastHealthCheck = now;

    try {
      // 3. 检查浏览器进程是否还活着
      const isConnected = this.browser.isConnected();
      if (!isConnected) {
        console.log("💀 浏览器进程已断开连接");
        return true;
      }

      // 4. 检查页面数量是否过多（可能内存泄漏）
      const pages = await this.browser.pages();
      this.pageCount = pages.length;
      if (this.pageCount > this.MAX_PAGES) {
        console.log(`📄 页面数量过多 (${this.pageCount}/${this.MAX_PAGES})`);
        return true;
      }

      // 5. 尝试创建并关闭一个测试页面（深度健康检查）
      try {
        const testPage = await this.browser.newPage();
        await testPage.close();
      } catch (testErr) {
        console.log("❌ 浏览器无法创建新页面");
        return true;
      }

      return false;
    } catch (err) {
      console.log("❌ 健康检查失败:", err);
      return true;
    }
  }

  /**
   * 清理所有打开的页面（除了当前正在使用的）
   */
  async cleanupPages(currentPage?: Page): Promise<void> {
    if (!this.browser) return;

    try {
      const pages = await this.browser.pages();
      for (const page of pages) {
        if (page !== currentPage && !page.isClosed()) {
          await page.close().catch(() => {});
        }
      }
      console.log(`🧹 已清理 ${pages.length - (currentPage ? 1 : 0)} 个页面`);
    } catch (err) {
      console.warn("⚠️  清理页面时出错:", err);
    }
  }

  isInUse(): boolean {
    return this.inUse;
  }

  getStats(): { pageCount: number; uptime: number; healthy: boolean } {
    return {
      pageCount: this.pageCount,
      uptime: this.browser ? Date.now() - this.createdAt : 0,
      healthy: this.browser?.isConnected() || false,
    };
  }
}

export const browserPool = new BrowserPool();
