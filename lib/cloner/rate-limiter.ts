import { RateLimitOptions, DEFAULT_RATE_LIMIT } from "../types";

export interface RateLimiterState {
  currentConcurrency: number;
  currentWindowRate: number;
  throttleMultiplier: number;
  consecutiveSuccesses: number;
  totalThrottleEvents: number;
  isThrottled: boolean;
}

/**
 * 自适应限流器
 *
 * 功能：
 * 1. 滑动窗口：控制时间窗口内的请求总数
 * 2. 并发控制：信号量模式限制同时进行的请求数
 * 3. 自适应限流：根据 429/403 响应自动降速，成功后逐步恢复
 * 4. 随机抖动：所有延迟添加 ±20% 随机偏移，避免机械节奏被检测
 */
export class RateLimiter {
  private options: RateLimitOptions;
  private activeRequests = 0;
  private requestTimestamps: number[] = [];
  private throttleMultiplier = 1.0;
  private consecutiveSuccesses = 0;
  private totalThrottleEvents = 0;
  private effectiveConcurrency: number;
  private waitQueue: Array<() => void> = [];
  private onStateChange?: (state: RateLimiterState) => void;

  constructor(
    options?: Partial<RateLimitOptions>,
    onStateChange?: (state: RateLimiterState) => void
  ) {
    this.options = { ...DEFAULT_RATE_LIMIT, ...options };
    this.effectiveConcurrency = this.options.concurrency;
    this.onStateChange = onStateChange;
  }

  /**
   * 等待获取一个请求槽位
   * 同时满足：并发限制 + 滑动窗口限制 + 单请求间隔
   */
  async acquire(): Promise<void> {
    // 1. 等待并发槽位
    await this.waitForConcurrencySlot();

    // 2. 等待滑动窗口允许
    if (this.options.requestsPerWindow > 0) {
      await this.waitForWindowSlot();
    }

    // 3. 单请求最小间隔（带抖动）
    if (this.options.perRequestDelayMs > 0) {
      const delay = this.addJitter(this.options.perRequestDelayMs * this.throttleMultiplier);
      await this.sleep(delay);
    }

    // 记录请求时间戳
    this.requestTimestamps.push(Date.now());
    this.activeRequests++;
  }

  /**
   * 释放一个请求槽位
   */
  release(): void {
    this.activeRequests--;
    // 唤醒等待队列中的下一个
    if (this.waitQueue.length > 0) {
      const next = this.waitQueue.shift();
      next?.();
    }
  }

  /**
   * 报告服务器限流（429/403）
   * 触发自适应降速
   */
  reportThrottle(): void {
    if (!this.options.adaptive) return;

    this.totalThrottleEvents++;
    this.consecutiveSuccesses = 0;

    // 增大延迟倍率（上限 5.0）
    this.throttleMultiplier = Math.min(this.throttleMultiplier * 1.5, 5.0);

    // 降低有效并发数（下限 2）
    this.effectiveConcurrency = Math.max(
      2,
      Math.floor(this.effectiveConcurrency * 0.75)
    );

    console.log(
      `🚦 自适应限流触发: multiplier=${this.throttleMultiplier.toFixed(1)}x, ` +
      `concurrency=${this.effectiveConcurrency}, ` +
      `总触发次数=${this.totalThrottleEvents}`
    );

    this.notifyStateChange();
  }

  /**
   * 报告请求成功
   * 连续成功后逐步恢复速率
   */
  reportSuccess(): void {
    if (!this.options.adaptive) return;

    this.consecutiveSuccesses++;

    // 连续 20 次成功后开始恢复
    if (this.consecutiveSuccesses >= 20 && this.throttleMultiplier > 1.0) {
      this.throttleMultiplier = Math.max(1.0, this.throttleMultiplier * 0.9);
      this.consecutiveSuccesses = 0;

      // 恢复并发数（不超过原始配置）
      if (this.effectiveConcurrency < this.options.concurrency) {
        this.effectiveConcurrency = Math.min(
          this.options.concurrency,
          this.effectiveConcurrency + 1
        );
      }

      if (this.throttleMultiplier > 1.05) {
        console.log(
          `✅ 限流恢复中: multiplier=${this.throttleMultiplier.toFixed(1)}x, ` +
          `concurrency=${this.effectiveConcurrency}`
        );
      }

      this.notifyStateChange();
    }
  }

  /**
   * 获取有效的批次间延迟（考虑自适应倍率）
   */
  getEffectiveInterBatchDelay(): number {
    if (this.options.interBatchDelayMs <= 0) return 0;
    return this.addJitter(this.options.interBatchDelayMs * this.throttleMultiplier);
  }

  /**
   * 获取当前限流状态
   */
  getState(): RateLimiterState {
    return {
      currentConcurrency: this.effectiveConcurrency,
      currentWindowRate: this.options.requestsPerWindow,
      throttleMultiplier: this.throttleMultiplier,
      consecutiveSuccesses: this.consecutiveSuccesses,
      totalThrottleEvents: this.totalThrottleEvents,
      isThrottled: this.throttleMultiplier > 1.05,
    };
  }

  /**
   * 获取有效并发数
   */
  getEffectiveConcurrency(): number {
    return this.effectiveConcurrency;
  }

  // --- 内部方法 ---

  private async waitForConcurrencySlot(): Promise<void> {
    if (this.activeRequests < this.effectiveConcurrency) {
      return;
    }
    // 等待直到有空闲槽位
    return new Promise<void>((resolve) => {
      this.waitQueue.push(resolve);
    });
  }

  private async waitForWindowSlot(): Promise<void> {
    const now = Date.now();
    const windowMs = this.options.windowMs * this.throttleMultiplier;

    // 清理过期时间戳
    this.requestTimestamps = this.requestTimestamps.filter(
      (ts) => now - ts < windowMs
    );

    // 如果窗口内请求数已达上限，等待最早的请求过期
    while (this.requestTimestamps.length >= this.options.requestsPerWindow) {
      const oldestTs = this.requestTimestamps[0];
      const waitTime = oldestTs + windowMs - now + 10; // +10ms 缓冲
      if (waitTime > 0) {
        await this.sleep(this.addJitter(waitTime));
      }
      // 重新清理
      const currentTime = Date.now();
      this.requestTimestamps = this.requestTimestamps.filter(
        (ts) => currentTime - ts < windowMs
      );
    }
  }

  private addJitter(baseMs: number): number {
    // ±20% 随机抖动
    const jitter = baseMs * 0.2 * (Math.random() * 2 - 1);
    return Math.max(0, Math.round(baseMs + jitter));
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private notifyStateChange(): void {
    this.onStateChange?.(this.getState());
  }
}
