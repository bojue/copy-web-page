"use client";

import { CloneProgress } from "@/lib/types";
import Button from "./ui/Button";

interface CloneProgressProps {
  progress: CloneProgress | null;
  jobId: string | null;
  result: { pages: number; assets: number; totalSize: number } | null;
  error: string | null;
  isLoading?: boolean;
  queueInfo?: { position: number; active: number; waiting: number; estimatedWaitSeconds: number; message: string } | null;
  onCancel?: () => void;
  onRetry?: () => void;
}

// 阶段名称映射
const STAGE_LABELS: Record<string, string> = {
  rendering: "渲染页面",
  discovering: "发现链接",
  downloading: "下载资源",
  rewriting: "重写路径",
  packaging: "打包文件",
  done: "完成",
  error: "出错",
};

// 格式化文件大小
function formatSize(bytes: number): string {
  if (bytes <= 0) return "0 B";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

export default function CloneProgressDisplay({
  progress,
  jobId,
  result,
  error,
  isLoading,
  queueInfo,
  onCancel,
  onRetry,
}: CloneProgressProps) {
  // 优先显示排队信息
  if (queueInfo) {
    const minutes = Math.ceil(queueInfo.estimatedWaitSeconds / 60);

    return (
      <div className="mt-6 p-4 bg-blue-50 border border-blue-200 rounded">
        <div className="flex items-start gap-2.5">
          <div className="text-blue-600 mt-0.5">
            <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"/>
            </svg>
          </div>
          <div className="flex-1">
            <p className="text-xs font-bold text-blue-800">任务已进入队列</p>
            <p className="text-[11px] text-slate-600 mt-1">
              当前有 <span className="font-semibold text-blue-900">{queueInfo.active}</span> 个任务正在执行，
              您排在第 <span className="font-semibold text-blue-900">{queueInfo.position}</span> 位
              {queueInfo.estimatedWaitSeconds > 0 && (
                <>，预计等待 <span className="font-semibold text-blue-900">{minutes}</span> 分钟</>
              )}
            </p>
          </div>
        </div>

        {/* 排队进度条 */}
        <div className="mt-3">
          <div className="w-full h-2 bg-blue-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-blue-500 rounded-full transition-all duration-1000"
              style={{ width: `${Math.max(10, ((queueInfo.active / (queueInfo.active + queueInfo.waiting)) * 100))}%` }}
            />
          </div>
          <p className="text-[10px] text-slate-500 mt-1 text-center">
            {queueInfo.active} / {queueInfo.active + queueInfo.waiting} 任务队列
          </p>
        </div>

        {onCancel && (
          <button
            onClick={onCancel}
            className="mt-3 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 border border-slate-300 text-[11px] font-bold rounded text-slate-700 transition-colors"
          >
            取消任务
          </button>
        )}
      </div>
    );
  }

  if (error) {
    return (
      <div className="mt-6 p-4 bg-red-50 border border-red-200 rounded flex flex-col gap-3">
        <div className="flex items-start gap-2.5">
          <div className="text-red-600 mt-0.5">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </div>
          <div>
            <p className="text-xs font-bold text-red-800">克隆失败</p>
            <p className="text-[11px] text-slate-600 mt-0.5 whitespace-pre-wrap">{error}</p>
          </div>
        </div>
        {onRetry && (
          <button
            onClick={onRetry}
            className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 border border-slate-300 text-[11px] font-bold rounded text-slate-700 transition-colors"
          >
            重新尝试
          </button>
        )}
      </div>
    );
  }

  if (!progress && !result) return null;

  return (
    <div className="mt-6 space-y-4">
      {/* Progress Bar */}
      {progress && progress.stage !== "done" && (
        <div className="p-4 bg-slate-50 border border-slate-200 rounded">
          <div className="flex justify-between items-start text-xs mb-3">
            <div className="flex flex-col gap-1 flex-1">
              <span className="text-slate-900 font-semibold">{progress.message}</span>
              {progress.details && (
                <span className="text-slate-500 text-[11px]">
                  {progress.details.current !== undefined && progress.details.total !== undefined ? (
                    <>
                      {progress.details.current}/{progress.details.total} {progress.details.itemType || '项'}
                      {progress.details.eta && progress.details.eta.remainingSeconds > 0 && (
                        <span className="ml-2 text-slate-600">
                          · 预计还需 {progress.details.eta.remainingSeconds}s
                          {progress.details.eta.downloadSpeed && (
                            <span className="ml-1">({progress.details.eta.downloadSpeed})</span>
                          )}
                        </span>
                      )}
                    </>
                  ) : progress.details.total !== undefined ? (
                    <>共 {progress.details.total} {progress.details.itemType || '项'}</>
                  ) : null}
                </span>
              )}
              {progress.details?.throttleState?.isThrottled && (
                <span className="text-amber-600 text-[11px] flex items-center gap-1">
                  <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                  </svg>
                  已自动降速 ({progress.details.throttleState.multiplier.toFixed(1)}x)
                  {progress.details.throttleState.reason && ` - ${progress.details.throttleState.reason}`}
                </span>
              )}
            </div>
            <div className="flex items-center gap-2 ml-3">
              <span className="text-[11px] text-slate-500 bg-slate-200 px-2 py-0.5 rounded">
                {STAGE_LABELS[progress.stage] || progress.stage}
              </span>
              <span className="text-[#0066cc] font-bold tabular-nums text-xs">{progress.percent}%</span>
            </div>
          </div>
          <div className="w-full h-2 bg-slate-200 rounded-full overflow-hidden">
            <div
              className="h-full bg-[#0066cc] rounded-full transition-all duration-700 ease-out"
              style={{ width: `${progress.percent}%` }}
            />
          </div>
          {isLoading && onCancel && (
            <button
              onClick={onCancel}
              className="mt-3 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 border border-slate-300 text-[11px] font-bold rounded text-slate-700 transition-colors"
            >
              取消克隆
            </button>
          )}
        </div>
      )}

      {/* Result */}
      {result && jobId && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 rounded flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-start gap-2.5">
            <div className="text-emerald-600 mt-0.5">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <div>
              <p className="text-xs font-bold text-emerald-800">克隆完成</p>
              <p className="text-[11px] text-slate-600 mt-0.5">
                已成功下载 <span className="font-semibold text-slate-900">{result.pages}</span> 个页面，
                共计 <span className="font-semibold text-slate-900">{result.assets}</span> 个关联资源
                {result.totalSize > 0 && (
                  <>，打包后大小为 <span className="font-semibold text-slate-900">{formatSize(result.totalSize)}</span></>
                )}。
              </p>
            </div>
          </div>
          <div className="flex gap-2 shrink-0">
            <a
              href={`/api/clone/${jobId}/preview`}
              target="_blank"
              rel="noopener noreferrer"
              className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 border border-slate-300 text-[11px] font-bold rounded text-slate-700 transition-colors"
            >
              预览页面
            </a>
            <a
              href={`/api/clone/${jobId}/download`}
              download
              className="px-3 py-1.5 bg-[#232f3e] hover:bg-[#1a2530] text-[11px] font-bold rounded text-white transition-colors"
            >
              下载 ZIP 包
            </a>
          </div>
        </div>
      )}
    </div>
  );
}
