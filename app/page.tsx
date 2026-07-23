"use client";

import { useState, useCallback, useRef } from "react";
import CloneForm from "./components/CloneForm";
import CloneProgressDisplay from "./components/CloneProgress";
import NavHeader from "./components/NavHeader";
import { CloneProgress, RateLimitOptions } from "@/lib/types";

export default function Home() {
  const [isLoading, setIsLoading] = useState(false);
  const [progress, setProgress] = useState<CloneProgress | null>(null);
  const [jobId, setJobId] = useState<string | null>(null);
  const [result, setResult] = useState<{ pages: number; assets: number; totalSize: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [queueInfo, setQueueInfo] = useState<{ position: number; active: number; waiting: number; estimatedWaitSeconds: number; message: string } | null>(null);
  const [lastOptions, setLastOptions] = useState<{ url: string; depth: number; includeJs: boolean; rateLimit?: Partial<RateLimitOptions> } | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const handleClone = useCallback(
    async (options: { url: string; depth: number; includeJs: boolean; rateLimit?: Partial<RateLimitOptions> }) => {
      setIsLoading(true);
      setProgress(null);
      setJobId(null);
      setResult(null);
      setError(null);
      setQueueInfo(null);
      setLastOptions(options);

      // 创建 AbortController 用于取消
      const abortController = new AbortController();
      abortControllerRef.current = abortController;

      try {
        const response = await fetch("/api/clone", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(options),
          signal: abortController.signal,
        });

        if (!response.ok) {
          let errorMessage = "Request failed";
          try {
            const contentType = response.headers.get("content-type");
            if (contentType && contentType.includes("application/json")) {
              const data = await response.json();
              errorMessage = data.error || data.message || errorMessage;
            } else {
              // 如果返回的不是 JSON（可能是 HTML 错误页面）
              const text = await response.text();
              errorMessage = `服务器错误 (${response.status}): ${text.substring(0, 100)}`;
            }
          } catch {
            errorMessage = `HTTP ${response.status}: ${response.statusText}`;
          }
          throw new Error(errorMessage);
        }

        const reader = response.body?.getReader();
        if (!reader) throw new Error("No response stream");

        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n\n");
          buffer = lines.pop() || "";

          for (const line of lines) {
            if (!line.startsWith("data: ")) continue;
            try {
              const data = JSON.parse(line.slice(6));

              switch (data.type) {
                case "queued":
                  setQueueInfo({
                    position: data.position,
                    active: data.active,
                    waiting: data.waiting,
                    estimatedWaitSeconds: data.estimatedWaitSeconds,
                    message: data.message
                  });
                  break;
                case "started":
                  setQueueInfo(null);
                  setJobId(data.jobId);
                  break;
                case "progress":
                  setQueueInfo(null);
                  setProgress({
                    stage: data.stage,
                    message: data.message,
                    percent: data.percent,
                    details: data.details,
                  });
                  break;
                case "complete":
                  setJobId(data.jobId);
                  setResult({ pages: data.pages, assets: data.assets, totalSize: data.totalSize || 0 });
                  setProgress({ stage: "done", message: "Done", percent: 100 });
                  break;
                case "error":
                  setError(
                    data.suggestion
                      ? `${data.message}\n${data.suggestion}`
                      : data.message
                  );
                  break;
              }
            } catch {
              // 跳过解析失败的 SSE 消息
            }
          }
        }
      } catch (err) {
        if (err instanceof Error && err.name === "AbortError") {
          setError("克隆已取消");
        } else {
          setError(err instanceof Error ? err.message : "Unknown error");
        }
      } finally {
        setIsLoading(false);
        abortControllerRef.current = null;
      }
    },
    []
  );

  const handleCancel = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
  }, []);

  const handleRetry = useCallback(() => {
    if (lastOptions) {
      handleClone(lastOptions);
    }
  }, [lastOptions, handleClone]);

  return (
    <div className="bg-[#ffffff] text-[#16191f] min-h-screen flex flex-col">
      <NavHeader />

      {/* 主体内容 */}
      <main className="max-w-6xl w-full mx-auto px-6 py-12 md:py-16 flex-grow flex items-center justify-center">
        <div className="w-full grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-16 items-start relative">

          {/* 左侧：介绍区域 */}
          <div className="lg:col-span-5 flex flex-col lg:pt-4">
            <h2 className="text-3xl font-bold tracking-tight text-slate-900 leading-tight">
              克隆网页资源
            </h2>
            <p className="text-slate-600 text-sm leading-relaxed mt-3 max-w-sm">
              提取目标网页的完整资源包，包括样式表、脚本、字体及媒体文件，重构为可部署的静态资源。
            </p>

            <div className="mt-8 space-y-5 border-t border-slate-200 pt-6">
              <div className="flex gap-3">
                <svg className="w-5 h-5 text-slate-400 mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <div>
                  <p className="text-sm font-medium text-slate-800">完整资源捕获</p>
                  <p className="text-xs text-slate-500 mt-0.5">CSS、图片、字体、脚本全量下载，自动重写为本地路径。</p>
                </div>
              </div>

              <div className="flex gap-3">
                <svg className="w-5 h-5 text-slate-400 mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <div>
                  <p className="text-sm font-medium text-slate-800">智能频率控制</p>
                  <p className="text-xs text-slate-500 mt-0.5">多种速率预设，自适应限流，避免触发目标站点限制。</p>
                </div>
              </div>

              <div className="flex gap-3">
                <svg className="w-5 h-5 text-slate-400 mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <div>
                  <p className="text-sm font-medium text-slate-800">标准化输出</p>
                  <p className="text-xs text-slate-500 mt-0.5">生成纯净 HTML/CSS 静态包，ZIP 打包，可直接部署。</p>
                </div>
              </div>
            </div>
          </div>

    
          {/* 右侧：表单和结果区域 */}
          <div className="lg:col-span-7 bg-white p-6 md:p-8 border border-slate-200 rounded shadow-sm space-y-6">
    

            <CloneForm onSubmit={handleClone} isLoading={isLoading} />
            <CloneProgressDisplay
              progress={progress}
              jobId={jobId}
              result={result}
              error={error}
              isLoading={isLoading}
              queueInfo={queueInfo}
              onCancel={handleCancel}
              onRetry={handleRetry}
            />
          </div>

        </div>
      </main>

      {/* 页脚 */}
      <footer className="w-full text-center py-6 border-t border-slate-200 bg-white">
        <p className="text-[11px] text-slate-500">
          Web Page Cloner · 开源轻量级工具 · 仅供技术研究与授权测试使用
        </p>
      </footer>
    </div>
  );
}
