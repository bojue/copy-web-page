/**
 * 并发任务限制器
 * 基于每IP的活跃任务数限制，而非时间窗口请求数
 * 每个克隆任务会下载大量资源，按请求次数限流不合理
 */

export class ConcurrencyLimiter {
  private activeTasks = new Map<string, number>(); // IP -> 当前活跃任务数
  private maxConcurrentPerIp: number;

  constructor(maxConcurrentPerIp = 30) {
    this.maxConcurrentPerIp = maxConcurrentPerIp;
  }

  /**
   * 检查该IP是否允许新增任务
   */
  check(key: string): { allowed: boolean; active: number; remaining: number } {
    const active = this.activeTasks.get(key) || 0;
    const allowed = active < this.maxConcurrentPerIp;
    const remaining = Math.max(0, this.maxConcurrentPerIp - active);

    return { allowed, active, remaining };
  }

  /**
   * 占用一个并发槽位（任务开始时调用）
   */
  acquire(key: string): void {
    const current = this.activeTasks.get(key) || 0;
    this.activeTasks.set(key, current + 1);
  }

  /**
   * 释放一个并发槽位（任务结束时调用）
   */
  release(key: string): void {
    const current = this.activeTasks.get(key) || 0;
    if (current <= 1) {
      this.activeTasks.delete(key);
    } else {
      this.activeTasks.set(key, current - 1);
    }
  }

  /**
   * 获取统计信息
   */
  getStats() {
    let totalActive = 0;
    for (const count of this.activeTasks.values()) {
      totalActive += count;
    }
    return {
      totalIps: this.activeTasks.size,
      totalActive,
      maxConcurrentPerIp: this.maxConcurrentPerIp,
    };
  }
}

// 全局并发限制器：每IP最多30个并发克隆任务
export const apiRateLimiter = new ConcurrencyLimiter(30);
