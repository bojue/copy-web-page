import { CloneEngine } from "@/lib/cloner";
import { CloneProgress, CloneOptions } from "@/lib/types";
import { config } from "@/lib/config";
import { wrapError } from "@/lib/errors";
import { globalCloneQueue } from "@/lib/job-queue";
import { nanoid } from "nanoid";
import { apiRateLimiter } from "@/lib/rate-limiter-api";
import { cloneCache } from "@/lib/clone-cache";

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
  // 并发任务数限制检查（每IP最多30个并发任务）
  const clientIp = getClientIP(request);
  const rateLimitResult = apiRateLimiter.check(clientIp);

  if (!rateLimitResult.allowed) {
    return Response.json(
      {
        error: "并发任务已满",
        message: `您当前已有 ${rateLimitResult.active} 个任务在执行中，已达并发上限。请等待现有任务完成后重试。`,
      },
      {
        status: 429,
        headers: {
          "X-RateLimit-Limit": "30",
          "X-RateLimit-Remaining": String(rateLimitResult.remaining),
        },
      }
    );
  }

  // 占用并发槽位
  apiRateLimiter.acquire(clientIp);

  const body = await request.json();

  // 验证请求体
  const validation = validateCloneOptions(body);

  if (!validation.valid) {
    return Response.json({ error: validation.error }, { status: 400 });
  }

  const options = validation.options!;

  // 检查缓存：如果相同 URL 已克隆过且 zip 仍存在，直接返回结果
  const cached = cloneCache.get(options.url, options.depth, options.includeJs);
  if (cached) {
    // 缓存命中，释放并发槽位
    apiRateLimiter.release(clientIp);

    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify({ type: "started", jobId: cached.jobId })}\n\n`)
        );
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify({
            type: "complete",
            jobId: cached.jobId,
            pages: cached.pages,
            assets: cached.assets,
            totalSize: cached.totalSize,
          })}\n\n`)
        );
        controller.close();
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        "Connection": "keep-alive",
        "X-Accel-Buffering": "no",
      },
    });
  }

  // 生成任务ID（用于队列跟踪）
  const taskId = nanoid();

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

      // 获取当前队列状态（包含该任务的位置）
      const queueStatus = globalCloneQueue.getStatus(taskId);

      // 如果需要排队，先通知用户（带准确的等待时间估算）
      if (queueStatus.active >= 5 || queueStatus.waiting > 0) {
        const estimatedWaitSeconds = Math.ceil((queueStatus.estimatedWaitMs || 0) / 1000);
        const estimatedWaitMinutes = Math.ceil(estimatedWaitSeconds / 60);

        console.log(`⏸️  任务 ${taskId} 进入队列等待（当前活跃: ${queueStatus.active}, 等待: ${queueStatus.waiting}, 预计 ${estimatedWaitMinutes} 分钟）`);

        send({
          type: "queued",
          position: queueStatus.position || queueStatus.waiting + 1,
          active: queueStatus.active,
          waiting: queueStatus.waiting,
          estimatedWaitSeconds,
          message: `当前有 ${queueStatus.active} 个任务正在执行，您排在第 ${queueStatus.position || queueStatus.waiting + 1} 位${estimatedWaitSeconds > 0 ? `，预计等待 ${estimatedWaitMinutes} 分钟` : ''}`,
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

        // 缓存克隆结果
        cloneCache.set(options.url, options.depth, options.includeJs, {
          jobId: result.jobId,
          pages: result.pages,
          assets: result.assets,
          totalSize: result.totalSize,
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
        // 释放该IP的并发槽位
        apiRateLimiter.release(clientIp);
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
