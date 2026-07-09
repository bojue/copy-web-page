"use client";

import { useState, useCallback, useRef } from "react";
import CloneForm from "./components/CloneForm";
import CloneProgressDisplay from "./components/CloneProgress";
import { CloneProgress, RateLimitOptions } from "@/lib/types";

export default function Home() {
  const [isLoading, setIsLoading] = useState(false);
  const [progress, setProgress] = useState<CloneProgress | null>(null);
  const [jobId, setJobId] = useState<string | null>(null);
  const [result, setResult] = useState<{ pages: number; assets: number; totalSize: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastOptions, setLastOptions] = useState<{ url: string; depth: number; includeJs: boolean; rateLimit?: Partial<RateLimitOptions> } | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const handleClone = useCallback(
    async (options: { url: string; depth: number; includeJs: boolean; rateLimit?: Partial<RateLimitOptions> }) => {
      setIsLoading(true);
      setProgress(null);
      setJobId(null);
      setResult(null);
      setError(null);
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
                case "started":
                  setJobId(data.jobId);
                  break;
                case "progress":
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
    <div className="min-h-screen bg-gradient-to-br from-gray-950 via-gray-900 to-gray-950 flex items-center justify-center p-6">
      <div className="w-full max-w-2xl">
        {/* Header */}
        <div className="text-center mb-10">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-2xl mb-4 shadow-lg shadow-indigo-500/20">
            <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
            </svg>
          </div>
          <h1 className="text-4xl font-bold text-white mb-3 bg-clip-text text-transparent bg-gradient-to-r from-white to-gray-300">
            Web Page Cloner
          </h1>
          <p className="text-gray-400 text-lg">
            完整克隆任何网页，包含所有样式和资源，禁止获取银行，云等行业内容
          </p>
 
        </div>

        {/* Main Card */}
        <div className="bg-gray-900/50 backdrop-blur-xl border border-gray-800/50 rounded-2xl p-8 shadow-2xl">
          <CloneForm onSubmit={handleClone} isLoading={isLoading} />
          <CloneProgressDisplay
            progress={progress}
            jobId={jobId}
            result={result}
            error={error}
            isLoading={isLoading}
            onCancel={handleCancel}
            onRetry={handleRetry}
          />
        </div>

        {/* Footer */}
        <div className="text-center mt-8 text-gray-500 text-sm">
            ⚠️ 合规提示：本工具仅用于前端技术研究、设计参考与授权测试。严禁用于获取金融机构（银行）、云服务平台等敏感行业站点，严禁用于任何形式的钓鱼及网络欺诈行为。
        </div>
      </div>
    </div>
  );
}
