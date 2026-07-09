/**
 * 并发任务队列
 *
 * 商业化关键功能：防止多用户同时克隆导致服务器资源耗尽
 * - 限制同时执行的克隆任务数量
 * - 超出并发限制的任务自动排队等待
 * - 提供队列状态查询（位置、预计等待时间）
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
  private waitingJobs: Job<T>[] = [];
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

    // 否则加入等待队列（按优先级排序）
    this.waitingJobs.push(job);
    this.waitingJobs.sort((a, b) => (b.priority || 0) - (a.priority || 0));

    // 等待直到有空闲槽位
    return new Promise<T>((resolve, reject) => {
      const checkInterval = setInterval(() => {
        if (this.activeJobs.size < this.maxConcurrency) {
          clearInterval(checkInterval);
          const index = this.waitingJobs.findIndex((j) => j.id === job.id);
          if (index !== -1) {
            this.waitingJobs.splice(index, 1);
            this.executeJob(job).then(resolve).catch(reject);
          }
        }
      }, 500); // 每500ms检查一次
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
    }
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
      const position = this.waitingJobs.findIndex((j) => j.id === jobId);
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
    const index = this.waitingJobs.findIndex((j) => j.id === jobId);
    if (index !== -1) {
      this.waitingJobs.splice(index, 1);
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

// 全局单例队列（支持多用户并发克隆）
export const globalCloneQueue = new JobQueue(3);
