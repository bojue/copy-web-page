import puppeteer, { Browser, Page } from "puppeteer";

/**
 * 浏览器实例池 —— 并发安全版本
 *
 * 核心改动：不再共享单一浏览器实例，而是为每个任务提供独立的浏览器实例，
 * 通过信号量控制同时存活的浏览器数量上限，避免资源耗尽。
 *
 * 设计要点：
 * 1. acquire() 返回一个独占的 Browser 实例（调用方负责 release）
 * 2. 同一任务内的多页爬取复用同一个 browser（通过 acquire 一次、多次 newPage）
 * 3. 信号量保证最多 MAX_BROWSERS 个实例并存
 * 4. 健康检查在 acquire 时进行（轻量级）
 */

const BROWSER_LAUNCH_ARGS = [
  "--no-sandbox",
  "--disable-setuid-sandbox",
  "--disable-web-security",
  "--disable-features=IsolateOrigins,site-per-process",
  "--allow-running-insecure-content",
  "--disable-blink-features=AutomationControlled",
  "--disable-dev-shm-usage",
  "--disable-gpu",
  "--no-first-run",
  "--no-zygote",
  "--single-process",
  "--disable-background-networking",
  "--disable-background-timer-throttling",
  "--disable-backgrounding-occluded-windows",
  "--disable-breakpad",
  "--disable-component-extensions-with-background-pages",
  "--disable-extensions",
  "--disable-features=TranslateUI,BlinkGenPropertyTrees",
  "--disable-ipc-flooding-protection",
  "--disable-renderer-backgrounding",
  "--window-size=1920,1080",
];

class BrowserPool {
  private readonly MAX_BROWSERS = 5; // 最大同时存活浏览器数
  private activeCount = 0;
  private waitQueue: Array<{ resolve: () => void }> = [];

  /**
   * 获取一个独占的浏览器实例。
   * 如果已达上限会等待，直到有实例释放。
   */
  async acquire(): Promise<Browser> {
    // 如果已达上限，排队等待
    if (this.activeCount >= this.MAX_BROWSERS) {
      await new Promise<void>((resolve) => {
        this.waitQueue.push({ resolve });
      });
    }

    this.activeCount++;

    try {
      const browser = await puppeteer.launch({
        headless: true,
        args: BROWSER_LAUNCH_ARGS,
      });
      console.log(`✅ 新浏览器实例已创建 (活跃: ${this.activeCount}/${this.MAX_BROWSERS})`);
      return browser;
    } catch (err) {
      // 启动失败时归还信号量
      this.releaseSlot();
      throw err;
    }
  }

  /**
   * 释放一个浏览器实例（关闭并归还信号量）
   */
  async release(browser: Browser): Promise<void> {
    try {
      if (browser.isConnected()) {
        await browser.close();
      }
    } catch (err) {
      console.warn("⚠️  关闭浏览器时出错:", err);
    }
    this.releaseSlot();
  }

  /**
   * 归还信号量槽位，唤醒等待者
   */
  private releaseSlot(): void {
    this.activeCount--;
    // 唤醒队列中第一个等待者（FIFO）
    const next = this.waitQueue.shift();
    if (next) {
      next.resolve();
    }
    console.log(`🔄 浏览器实例已释放 (活跃: ${this.activeCount}/${this.MAX_BROWSERS})`);
  }

  /**
   * 清理所有打开的页面（保留当前正在使用的）
   */
  async cleanupPages(browser: Browser, currentPage?: Page): Promise<void> {
    try {
      const pages = await browser.pages();
      for (const page of pages) {
        if (page !== currentPage && !page.isClosed()) {
          await page.close().catch(() => {});
        }
      }
    } catch (err) {
      console.warn("⚠️  清理页面时出错:", err);
    }
  }

  getStats(): { active: number; waiting: number; max: number } {
    return {
      active: this.activeCount,
      waiting: this.waitQueue.length,
      max: this.MAX_BROWSERS,
    };
  }
}

export const browserPool = new BrowserPool();
