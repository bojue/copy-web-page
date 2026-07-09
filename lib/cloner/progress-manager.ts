import { CloneProgress } from "../types";

/**
 * 进度管理器
 * 负责统一管理和发送克隆进度
 */
export class ProgressManager {
  private onProgress?: (progress: CloneProgress) => void;
  private lastPercent = 0;

  constructor(onProgress?: (progress: CloneProgress) => void) {
    this.onProgress = onProgress;
  }

  /**
   * 发送进度更新
   */
  emit(
    stage: CloneProgress["stage"],
    message: string,
    percent: number,
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
        downloadSpeed?: string;
      };
    }
  ) {
    this.lastPercent = percent;
    this.onProgress?.({ stage, message, percent, details });
  }

  /**
   * 获取上次发送的进度百分比
   */
  getLastPercent(): number {
    return this.lastPercent;
  }

  /**
   * 计算并发送渲染阶段进度
   */
  emitRenderProgress(pageIndex: number, url: string) {
    const percent = 10 + Math.min((pageIndex - 1) * 3, 15);
    const hostname = new URL(url).hostname;
    const pathname = new URL(url).pathname;
    this.emit(
      "rendering",
      `正在渲染页面 (${pageIndex}): ${hostname}${pathname}`,
      percent
    );
  }

  /**
   * 发送下载准备进度
   */
  emitDownloadPrepare(totalAssets: number) {
    this.emit(
      "downloading",
      `正在准备下载资源...`,
      30,
      { total: totalAssets, itemType: "资源" }
    );
  }

  /**
   * 发送去重完成进度
   */
  emitDeduplicationComplete(before: number, after: number) {
    this.emit(
      "downloading",
      `资源去重完成 (${before} → ${after})`,
      32,
      { current: after, total: before, itemType: "资源" }
    );
  }

  /**
   * 发送下载进度
   */
  emitDownloadProgress(done: number, total: number, eta?: { remainingSeconds: number; downloadSpeed: string }) {
    const percent = 32 + Math.round((done / total) * 28); // 32-60%
    this.emit(
      "downloading",
      `正在下载资源...`,
      percent,
      {
        current: done,
        total,
        itemType: "资源文件",
        eta: eta ? {
          remainingSeconds: eta.remainingSeconds,
          downloadSpeed: eta.downloadSpeed,
        } : undefined,
      }
    );
  }

  /**
   * 发送 CSS 处理进度
   */
  emitCssProcessing(totalCss: number) {
    this.emit(
      "rewriting",
      `正在处理 CSS 文件...`,
      62,
      { total: totalCss, itemType: "CSS 文件" }
    );
  }

  /**
   * 发送 Canvas 处理进度
   */
  emitCanvasProcessing(totalCanvas: number) {
    this.emit(
      "rewriting",
      `正在处理 Canvas 快照...`,
      68,
      { total: totalCanvas, itemType: "Canvas" }
    );
  }

  /**
   * 发送样式保存进度
   */
  emitStyleSaving() {
    this.emit("rewriting", "正在保存计算样式...", 72);
  }

  /**
   * 发送路径重写进度
   */
  emitPathRewriting() {
    this.emit("rewriting", "正在重写资源路径...", 78);
  }

  /**
   * 发送打包进度
   */
  emitPackaging() {
    this.emit("packaging", "正在打包 ZIP...", 90);
  }

  /**
   * 发送完成进度
   */
  emitComplete() {
    this.emit("done", "克隆完成!", 100);
  }

  /**
   * 发送错误
   */
  emitError(message: string) {
    this.emit("error", `克隆失败: ${message}`, 0);
  }
}
