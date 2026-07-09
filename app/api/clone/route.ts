import { CloneEngine } from "@/lib/cloner";
import { CloneProgress, CloneOptions } from "@/lib/types";
import { config } from "@/lib/config";
import { wrapError } from "@/lib/errors";
import { globalCloneQueue } from "@/lib/job-queue";
import { nanoid } from "nanoid";
import { apiRateLimiter } from "@/lib/rate-limiter-api";

export const maxDuration = 120;

/**
 * 获取客户端真实 IP
 */
function getClientIP(request: Request): string {
  // 优先从代理头获取真实 IP
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    return forwarded.split(",")[0].trim();
  }

  const realIp = request.headers.get("x-real-ip");
  if (realIp) {
    return realIp;
  }

  // 回退到 CF 或其他云服务商的头
  const cfIp = request.headers.get("cf-connecting-ip");
  if (cfIp) {
    return cfIp;
  }

  return "unknown";
}

/**
 * 简单的参数验证（避免 Zod 在构建时的兼容性问题）
 */
function validateCloneOptions(body: any): { valid: boolean; options?: CloneOptions; error?: string } {
  // 验证 URL
  if (!body.url || typeof body.url !== "string" || !body.url.trim()) {
    return { valid: false, error: "URL 不能为空" };
  }

  try {
    const url = new URL(body.url);
    if (!url.protocol.startsWith("http")) {
      return { valid: false, error: "URL 必须以 http:// 或 https:// 开头" };
    }
  } catch {
    return { valid: false, error: "无效的 URL 格式" };
  }

  // 验证并规范化 depth
  let depth = 1;
  if (body.depth !== undefined) {
    depth = Number(body.depth);
    if (!Number.isInteger(depth) || depth < 1 || depth > 3) {
      return { valid: false, error: "深度必须是 1-3 之间的整数" };
    }
  }

  // 验证 includeJs
  const includeJs = body.includeJs !== undefined ? Boolean(body.includeJs) : true;

  // 验证 rateLimit（如果提供）
  let rateLimit: Record<string, number | boolean> | undefined = undefined;
  if (body.rateLimit && typeof body.rateLimit === "object") {
    rateLimit = {};

    if (typeof body.rateLimit.concurrency === "number") {
      const val = Math.floor(body.rateLimit.concurrency);
      if (val >= 1 && val <= 30) rateLimit.concurrency = val;
    }

    if (typeof body.rateLimit.requestsPerWindow === "number") {
      const val = Math.floor(body.rateLimit.requestsPerWindow);
      if (val >= 0 && val <= 100) rateLimit.requestsPerWindow = val;
    }

    if (typeof body.rateLimit.windowMs === "number") {
      const val = Math.floor(body.rateLimit.windowMs);
      if (val >= 500 && val <= 10000) rateLimit.windowMs = val;
    }

    if (typeof body.rateLimit.interBatchDelayMs === "number") {
      const val = Math.floor(body.rateLimit.interBatchDelayMs);
      if (val >= 0 && val <= 5000) rateLimit.interBatchDelayMs = val;
    }

    if (typeof body.rateLimit.perRequestDelayMs === "number") {
      const val = Math.floor(body.rateLimit.perRequestDelayMs);
      if (val >= 0 && val <= 3000) rateLimit.perRequestDelayMs = val;
    }

    if (typeof body.rateLimit.adaptive === "boolean") {
      rateLimit.adaptive = body.rateLimit.adaptive;
    }
  }

  return {
    valid: true,
    options: {
      url: body.url.trim(),
      depth,
      includeJs,
      rateLimit,
    },
  };
}

export async function POST(request: Request) {
  // API 速率限制检查
  const clientIp = getClientIP(request);
  const rateLimitResult = apiRateLimiter.check(clientIp);

  if (!rateLimitResult.allowed) {
    const resetIn = Math.ceil((rateLimitResult.resetAt - Date.now()) / 1000);
    return Response.json(
      {
        error: "请求过于频繁",
        message: `您已超过速率限制（每分钟最多 10 次请求）。请在 ${resetIn} 秒后重试。`,
        retryAfter: resetIn,
      },
      {
        status: 429,
        headers: {
          "Retry-After": String(resetIn),
          "X-RateLimit-Limit": "10",
          "X-RateLimit-Remaining": "0",
          "X-RateLimit-Reset": String(Math.floor(rateLimitResult.resetAt / 1000)),
        },
      }
    );
  }

  const body = await request.json();

  // 验证请求体
  const validation = validateCloneOptions(body);

  if (!validation.valid) {
    return Response.json({ error: validation.error }, { status: 400 });
  }

  const options = validation.options!;

  // 生成任务ID（用于队列跟踪）
  const taskId = nanoid();

  // 检查队列状态
  const queueStatus = globalCloneQueue.getStatus();

  // 如果队列已满，通知前端排队信息
  if (queueStatus.active >= 3) {
    console.log(`⏸️  任务 ${taskId} 进入队列等待（当前活跃: ${queueStatus.active}, 等待: ${queueStatus.waiting}）`);
  }

  // Create SSE stream with heartbeat
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      let lastSendTime = Date.now();
      let heartbeatTimer: ReturnType<typeof setInterval> | null = null;

      const send = (data: object) => {
        try {
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify(data)}\n\n`)
          );
          lastSendTime = Date.now();
        } catch {
          // Stream may have been closed
        }
      };

      // 如果需要排队，先通知用户
      if (queueStatus.waiting > 0) {
        send({
          type: "queued",
          position: queueStatus.waiting + 1,
          message: `当前有 ${queueStatus.active} 个任务正在执行，您的任务排在第 ${queueStatus.waiting + 1} 位`,
        });
      }

      // SSE 心跳：定期检查，如果超过阈值没有消息则发送心跳
      // 防止代理/CDN/负载均衡器因长时间无数据而断开连接
      heartbeatTimer = setInterval(() => {
        const elapsed = Date.now() - lastSendTime;
        if (elapsed > config.clone.heartbeatThreshold) {
          send({ type: "heartbeat", timestamp: Date.now() });
        }
      }, config.clone.heartbeatInterval);

      const onProgress = (progress: CloneProgress) => {
        send({ type: "progress", ...progress });
      };

      try {
        // 将任务加入队列执行
        const result = await globalCloneQueue.enqueue({
          id: taskId,
          execute: async () => {
            const engine = new CloneEngine(onProgress);

            try {
              send({ type: "started", jobId: engine.getJobId() });

              const cloneResult = await engine.clone(options);

              // Auto-cleanup after configured delay
              setTimeout(() => {
                engine.cleanup();
              }, config.clone.autoCleanupDelay);

              return cloneResult;
            } catch (error) {
              // 清理资源
              engine.cleanup();
              throw error;
            }
          },
          createdAt: Date.now(),
        });

        send({
          type: "complete",
          jobId: result.jobId,
          pages: result.pages,
          assets: result.assets,
          totalSize: result.totalSize,
        });
      } catch (error) {
        const cloneError = wrapError(error);
        send({
          type: "error",
          message: cloneError.userMessage,
          suggestion: cloneError.suggestion,
          retryable: cloneError.retryable,
        });
      } finally {
        // 清理心跳定时器
        if (heartbeatTimer) {
          clearInterval(heartbeatTimer);
        }
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      "Connection": "keep-alive",
      "X-Accel-Buffering": "no", // 禁用 Nginx 缓冲
    },
  });
}
