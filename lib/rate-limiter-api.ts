/**
 * 简单的内存速率限制器
 * 商业化关键：防止DOS攻击和API滥用
 */

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

export class RateLimiter {
  private store = new Map<string, RateLimitEntry>();
  private maxRequests: number;
  private windowMs: number;

  constructor(maxRequests = 10, windowMs = 60000) {
    this.maxRequests = maxRequests;
    this.windowMs = windowMs;

    // 定期清理过期条目（防止内存泄漏）
    setInterval(() => {
      const now = Date.now();
      for (const [key, entry] of this.store.entries()) {
        if (entry.resetAt < now) {
          this.store.delete(key);
        }
      }
    }, this.windowMs);
  }

  /**
   * 检查是否被限流
   * @param key 通常是 IP 地址
   * @returns { allowed: boolean, remaining: number, resetAt: number }
   */
  check(key: string): { allowed: boolean; remaining: number; resetAt: number } {
    const now = Date.now();
    let entry = this.store.get(key);

    // 如果条目不存在或已过期，创建新条目
    if (!entry || entry.resetAt < now) {
      entry = {
        count: 0,
        resetAt: now + this.windowMs,
      };
      this.store.set(key, entry);
    }

    // 增加计数
    entry.count++;

    const allowed = entry.count <= this.maxRequests;
    const remaining = Math.max(0, this.maxRequests - entry.count);

    return {
      allowed,
      remaining,
      resetAt: entry.resetAt,
    };
  }

  /**
   * 重置某个 key 的限制（用于测试或管理员手动解封）
   */
  reset(key: string): void {
    this.store.delete(key);
  }

  /**
   * 获取统计信息
   */
  getStats() {
    return {
      totalKeys: this.store.size,
      maxRequests: this.maxRequests,
      windowMs: this.windowMs,
    };
  }
}

// 全局速率限制器：每分钟10次请求
export const apiRateLimiter = new RateLimiter(10, 60000);
