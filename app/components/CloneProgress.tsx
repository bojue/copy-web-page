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
      <div className="mt-8 p-5 bg-red-900/20 border border-red-800/50 rounded-xl backdrop-blur-sm animate-in fade-in slide-in-from-top-2 duration-300">
        <div className="flex items-start gap-3">
          <svg className="w-5 h-5 text-red-400 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
          </svg>
          <div className="flex-1">
            <p className="text-red-400 font-semibold">克隆失败</p>
            <p className="text-red-300/90 text-sm mt-1 whitespace-pre-wrap">{error}</p>
          </div>
        </div>
        {/* 重试按钮 */}
        {onRetry && (
          <Button
            onClick={onRetry}
            variant="danger"
            className="mt-4"
          >
            重新尝试
          </Button>
        )}
      </div>
    );
  }

  if (!progress && !result) return null;

  return (
    <div className="mt-8 space-y-5 animate-in fade-in slide-in-from-top-2 duration-300">
      {/* Progress Bar */}
      {progress && progress.stage !== "done" && (
        <div className="p-5 bg-gray-800/30 border border-gray-700/50 rounded-xl backdrop-blur-sm">
          <div className="flex justify-between items-center text-sm mb-3">
            <div className="flex flex-col gap-1">
              <span className="text-gray-300 font-medium">{progress.message}</span>
              {progress.details && (
                <span className="text-gray-500 text-xs">
                  {progress.details.current !== undefined && progress.details.total !== undefined ? (
                    <>
                      {progress.details.current}/{progress.details.total} {progress.details.itemType || '项'}
                      {/* ETA 显示 */}
                      {progress.details.eta && progress.details.eta.remainingSeconds > 0 && (
                        <span className="ml-2 text-indigo-400">
                          · 预计还需 {progress.details.eta.remainingSeconds}s
                          {progress.details.eta.downloadSpeed && (
                            <span className="ml-1 text-gray-500">({progress.details.eta.downloadSpeed})</span>
                          )}
                        </span>
                      )}
                    </>
                  ) : progress.details.total !== undefined ? (
                    <>
                      共 {progress.details.total} {progress.details.itemType || '项'}
                    </>
                  ) : null}
                </span>
              )}
              {/* 限流状态提示 */}
              {progress.details?.throttleState?.isThrottled && (
                <span className="text-amber-400/80 text-xs flex items-center gap-1">
                  <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                  </svg>
                  已自动降速 ({progress.details.throttleState.multiplier.toFixed(1)}x)
                  {progress.details.throttleState.reason && ` - ${progress.details.throttleState.reason}`}
                </span>
              )}
            </div>
            <div className="flex items-center gap-3">
              {/* 阶段标签 */}
              <span className="text-xs text-gray-500 bg-gray-800 px-2 py-0.5 rounded-md">
                {STAGE_LABELS[progress.stage] || progress.stage}
              </span>
              <span className="text-indigo-400 font-bold tabular-nums">{progress.percent}%</span>
            </div>
          </div>
          <div className="w-full h-2.5 bg-gray-800 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-indigo-500 to-purple-500 rounded-full transition-all duration-700 ease-out"
              style={{ width: `${progress.percent}%` }}
            />
          </div>
          {/* 取消按钮 */}
          {isLoading && onCancel && (
            <Button
              onClick={onCancel}
              variant="secondary"
              className="mt-3 py-2 text-sm"
            >
              取消克隆
            </Button>
          )}
        </div>
      )}

      {/* Result */}
      {result && jobId && (
        <div className="p-5 bg-green-900/20 border border-green-800/50 rounded-xl backdrop-blur-sm">
          <div className="flex items-start gap-3 mb-4">
            <svg className="w-6 h-6 text-green-400 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
            </svg>
            <div className="flex-1">
              <p className="text-green-400 font-semibold text-lg">克隆完成</p>
              <p className="text-gray-300 text-sm mt-1">
                已克隆 <span className="font-semibold text-green-400">{result.pages}</span> 个页面，
                下载 <span className="font-semibold text-green-400">{result.assets}</span> 个资源
                {result.totalSize > 0 && (
                  <>，总大小 <span className="font-semibold text-green-400">{formatSize(result.totalSize)}</span></>
                )}
              </p>
            </div>
          </div>
          <div className="flex gap-3">
            <a
              href={`/api/clone/${jobId}/preview`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex-1 px-5 py-3 bg-blue-600 hover:bg-blue-500 text-white font-medium rounded-xl transition-all duration-200 text-center hover:scale-[1.02] active:scale-[0.98] shadow-lg shadow-blue-500/20"
            >
              预览页面
            </a>
            <a
              href={`/api/clone/${jobId}/download`}
              download
              className="flex-1 px-5 py-3 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white font-medium rounded-xl transition-all duration-200 text-center hover:scale-[1.02] active:scale-[0.98] shadow-lg shadow-indigo-500/20"
            >
              下载 ZIP
            </a>
          </div>
        </div>
      )}
    </div>
  );
}
