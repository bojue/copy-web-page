/**
 * 并发任务队列（事件驱动，无竞态条件）
 *
 * 核心改动（相比轮询版本）：
 * - 用 Promise + 回调队列替代 setInterval 轮询
 * - 任务完成时精确唤醒队首等待者（FIFO），不存在多个 job 同时抢槽位的竞态
 * - 保证 activeJobs.size 严格 <= maxConcurrency
 */

export interface Job<T> {
  id: string;
  execute: () => Promise<T>;
  createdAt: number;
  priority?: number;
}

export interface QueueStatus {
  active: number;
  waiting: number;
  position?: number;
  estimatedWaitMs?: number;
}

export class JobQueue<T = any> {
  private maxConcurrency: number;
  private activeJobs = new Map<string, Promise<T>>();
  private waitingJobs: Array<{
    job: Job<T>;
    resolve: (value: T) => void;
    reject: (reason: any) => void;
  }> = [];
  private completedCount = 0;
  private averageJobDuration = 30000; // 默认30秒

  constructor(maxConcurrency = 3) {
    this.maxConcurrency = maxConcurrency;
  }

  /**
   * 将任务加入队列
   * 如果未达到并发上限，立即执行；否则排队等待
   */
  async enqueue(job: Job<T>): Promise<T> {
    // 如果有空闲槽位，立即执行
    if (this.activeJobs.size < this.maxConcurrency) {
      return this.executeJob(job);
    }

    // 否则加入等待队列，返回一个 Promise
    // 该 Promise 会在有槽位释放且轮到该任务时被 resolve
    return new Promise<T>((resolve, reject) => {
      this.waitingJobs.push({ job, resolve, reject });
      // 按优先级排序（高优先级在前）
      this.waitingJobs.sort((a, b) => (b.job.priority || 0) - (a.job.priority || 0));
    });
  }

  /**
   * 执行任务
   */
  private async executeJob(job: Job<T>): Promise<T> {
    const startTime = Date.now();
    const promise = job.execute();
    this.activeJobs.set(job.id, promise);

    try {
      const result = await promise;

      // 更新平均执行时间（用于估算等待时间）
      const duration = Date.now() - startTime;
      this.averageJobDuration =
        (this.averageJobDuration * this.completedCount + duration) /
        (this.completedCount + 1);
      this.completedCount++;

      return result;
    } finally {
      this.activeJobs.delete(job.id);
      // 任务完成后，尝试调度下一个等待中的任务
      this.scheduleNext();
    }
  }

  /**
   * 调度等待队列中的下一个任务（事件驱动，无竞态）
   */
  private scheduleNext(): void {
    if (this.waitingJobs.length === 0) return;
    if (this.activeJobs.size >= this.maxConcurrency) return;

    // 取出队首任务
    const next = this.waitingJobs.shift()!;
    // 异步执行，并将结果传回等待者的 Promise
    this.executeJob(next.job).then(next.resolve).catch(next.reject);
  }

  /**
   * 获取队列状态
   */
  getStatus(jobId?: string): QueueStatus {
    const status: QueueStatus = {
      active: this.activeJobs.size,
      waiting: this.waitingJobs.length,
    };

    if (jobId) {
      const position = this.waitingJobs.findIndex((w) => w.job.id === jobId);
      if (position !== -1) {
        status.position = position + 1;
        // 估算等待时间：需要等待前面的任务 + 当前活跃任务完成
        const jobsAhead = position + Math.max(0, this.activeJobs.size - this.maxConcurrency + 1);
        status.estimatedWaitMs = jobsAhead * this.averageJobDuration;
      }
    }

    return status;
  }

  /**
   * 取消排队中的任务
   */
  cancel(jobId: string): boolean {
    const index = this.waitingJobs.findIndex((w) => w.job.id === jobId);
    if (index !== -1) {
      const removed = this.waitingJobs.splice(index, 1)[0];
      removed.reject(new Error("任务已取消"));
      return true;
    }
    return false;
  }

  /**
   * 获取队列统计信息
   */
  getStats() {
    return {
      maxConcurrency: this.maxConcurrency,
      active: this.activeJobs.size,
      waiting: this.waitingJobs.length,
      completed: this.completedCount,
      averageJobDurationMs: Math.round(this.averageJobDuration),
    };
  }
}

// 全局单例队列（支持多用户并发克隆，最多5个任务同时执行）
export const globalCloneQueue = new JobQueue(5);
