import { NextRequest } from "next/server";
import path from "path";
import { existsSync, statSync, createReadStream } from "fs";
import fs from "fs/promises";
import os from "os";
import mime from "mime-types";

// 添加文件元数据缓存，避免重复 stat 调用
const fileMetaCache = new Map<string, { size: number; mtime: number; mimeType: string }>();

// 小文件缓存（< 100KB）
const smallFileCache = new Map<string, { buffer: Buffer; timestamp: number }>();
const SMALL_FILE_THRESHOLD = 100 * 1024; // 100KB
const CACHE_TTL = 3600 * 1000; // 1小时

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ jobId: string; path: string[] }> }
) {
  const { jobId, path: filePath } = await params;

  // 安全校验 1: jobId 只允许字母数字和连字符（nanoid 格式）
  if (!/^[a-zA-Z0-9_-]+$/.test(jobId)) {
    return Response.json({ error: "Invalid job ID" }, { status: 400 });
  }

  // 安全校验 2: 路径段不允许包含 .. 或以 . 开头的隐藏文件
  for (const segment of filePath) {
    if (segment === ".." || segment === "." || segment.startsWith(".")) {
      return Response.json({ error: "Invalid path" }, { status: 403 });
    }
  }

  // 首先检查是否是公共模板（不会被清理的案例）
  // 优先级：系统 /public/templates > 项目 public/templates > 临时目录
  const systemPublicTemplateDir = path.resolve("/public", "templates", jobId, "site");
  const projectPublicTemplateDir = path.resolve(process.cwd(), "public", "templates", jobId, "site");
  const tmpOutputDir = path.resolve(os.tmpdir(), "web-cloner", jobId, "site");

  let outputDir: string;
  let isPublicTemplate = false;
  if (existsSync(systemPublicTemplateDir)) {
    outputDir = systemPublicTemplateDir;
    isPublicTemplate = true;
  } else if (existsSync(projectPublicTemplateDir)) {
    outputDir = projectPublicTemplateDir;
    isPublicTemplate = true;
  } else if (existsSync(tmpOutputDir)) {
    outputDir = tmpOutputDir;
  } else {
    return Response.json({ error: "Job not found" }, { status: 404 });
  }

  // Construct the full file path using path.resolve 确保绝对路径
  const fullPath = path.resolve(outputDir, ...filePath);

  // 安全校验 3: 双重验证 - resolve 后必须在 outputDir 内
  if (!fullPath.startsWith(outputDir + path.sep) && fullPath !== outputDir) {
    return Response.json({ error: "Invalid path" }, { status: 403 });
  }

  // 检查文件是否存在
  if (!existsSync(fullPath)) {
    return Response.json({ error: "File not found" }, { status: 404 });
  }

  // 获取文件信息（使用同步方法，因为已经确认文件存在）
  let stat;
  try {
    stat = statSync(fullPath);

    // 安全校验 4: 检查是否为符号链接
    if (stat.isSymbolicLink()) {
      const realPath = await fs.realpath(fullPath);
      if (!realPath.startsWith(outputDir)) {
        return Response.json({ error: "Invalid path" }, { status: 403 });
      }
    }
  } catch {
    return Response.json({ error: "File access denied" }, { status: 403 });
  }

  const mimeType = mime.lookup(fullPath) || "application/octet-stream";
  const fileSize = stat.size;

  // 处理 Range 请求（用于大文件和视频）
  const range = request.headers.get("range");
  const ifNoneMatch = request.headers.get("if-none-match");

  // 生成 ETag（基于文件路径和修改时间）
  const etag = `"${Buffer.from(fullPath + stat.mtime.getTime()).toString("base64").slice(0, 27)}"`;

  // 304 Not Modified
  if (ifNoneMatch === etag) {
    return new Response(null, {
      status: 304,
      headers: {
        "ETag": etag,
        "Cache-Control": isPublicTemplate
          ? "public, max-age=31536000, immutable"
          : "public, max-age=3600",
      },
    });
  }

  // 对于小文件，使用缓存
  const cacheKey = fullPath;
  if (isPublicTemplate && fileSize < SMALL_FILE_THRESHOLD) {
    if (smallFileCache.has(cacheKey)) {
      const cached = smallFileCache.get(cacheKey)!;
      if (Date.now() - cached.timestamp < CACHE_TTL) {
        return new Response(new Uint8Array(cached.buffer), {
          headers: {
            "Content-Type": mimeType,
            "Content-Length": String(fileSize),
            "Cache-Control": "public, max-age=31536000, immutable",
            "X-Content-Type-Options": "nosniff",
            "Access-Control-Allow-Origin": "*",
            "ETag": etag,
            "X-Cache": "HIT",
          },
        });
      } else {
        smallFileCache.delete(cacheKey);
      }
    }

    // 读取并缓存小文件
    const buffer = await fs.readFile(fullPath);
    smallFileCache.set(cacheKey, { buffer, timestamp: Date.now() });

    return new Response(new Uint8Array(buffer), {
      headers: {
        "Content-Type": mimeType,
        "Content-Length": String(fileSize),
        "Cache-Control": "public, max-age=31536000, immutable",
        "X-Content-Type-Options": "nosniff",
        "Access-Control-Allow-Origin": "*",
        "ETag": etag,
        "X-Cache": "MISS",
      },
    });
  }

  // 对于大文件（> 100KB），使用流式传输
  if (range) {
    // 处理 Range 请求
    const parts = range.replace(/bytes=/, "").split("-");
    const start = parseInt(parts[0], 10);
    const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
    const chunkSize = end - start + 1;

    const nodeStream = createReadStream(fullPath, { start, end });

    // 将 Node.js Stream 转换为 Web ReadableStream
    const webStream = new ReadableStream({
      start(controller) {
        nodeStream.on("data", (chunk) => {
          const buffer = chunk instanceof Buffer ? chunk : Buffer.from(chunk);
          controller.enqueue(new Uint8Array(buffer));
        });
        nodeStream.on("end", () => {
          controller.close();
        });
        nodeStream.on("error", (err) => {
          controller.error(err);
        });
      },
      cancel() {
        nodeStream.destroy();
      },
    });

    return new Response(webStream, {
      status: 206,
      headers: {
        "Content-Type": mimeType,
        "Content-Length": String(chunkSize),
        "Content-Range": `bytes ${start}-${end}/${fileSize}`,
        "Accept-Ranges": "bytes",
        "Cache-Control": isPublicTemplate
          ? "public, max-age=31536000, immutable"
          : "public, max-age=3600",
        "X-Content-Type-Options": "nosniff",
        "Access-Control-Allow-Origin": "*",
        "ETag": etag,
      },
    });
  }

  // 流式传输整个文件
  const nodeStream = createReadStream(fullPath);

  // 将 Node.js Stream 转换为 Web ReadableStream
  const webStream = new ReadableStream({
    start(controller) {
      nodeStream.on("data", (chunk) => {
        const buffer = chunk instanceof Buffer ? chunk : Buffer.from(chunk);
        controller.enqueue(new Uint8Array(buffer));
      });
      nodeStream.on("end", () => {
        controller.close();
      });
      nodeStream.on("error", (err) => {
        controller.error(err);
      });
    },
    cancel() {
      nodeStream.destroy();
    },
  });

  return new Response(webStream, {
    headers: {
      "Content-Type": mimeType,
      "Content-Length": String(fileSize),
      "Accept-Ranges": "bytes",
      "Cache-Control": isPublicTemplate
        ? "public, max-age=31536000, immutable"
        : "public, max-age=3600",
      "X-Content-Type-Options": "nosniff",
      "Access-Control-Allow-Origin": "*",
      "ETag": etag,
    },
  });
}
