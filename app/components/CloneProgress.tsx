"use client";

import { CloneProgress } from "@/lib/types";
import Button from "./ui/Button";

interface CloneProgressProps {
  progress: CloneProgress | null;
  jobId: string | null;
  result: { pages: number; assets: number; totalSize: number } | null;
  error: string | null;
  isLoading?: boolean;
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
  onCancel,
  onRetry,
}: CloneProgressProps) {
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
