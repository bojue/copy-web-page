import { NextRequest } from "next/server";
import path from "path";
import { existsSync } from "fs";
import fs from "fs/promises";
import os from "os";
import mime from "mime-types";

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
  if (existsSync(systemPublicTemplateDir)) {
    outputDir = systemPublicTemplateDir;
  } else if (existsSync(projectPublicTemplateDir)) {
    outputDir = projectPublicTemplateDir;
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

  // 安全校验 4: 检查是否为符号链接（防止通过 symlink 逃逸）
  try {
    const stat = await fs.lstat(fullPath);
    if (stat.isSymbolicLink()) {
      const realPath = await fs.realpath(fullPath);
      if (!realPath.startsWith(outputDir)) {
        return Response.json({ error: "Invalid path" }, { status: 403 });
      }
    }
  } catch {
    // 文件不存在的情况在下面处理
  }

  if (!existsSync(fullPath)) {
    return Response.json({ error: "File not found" }, { status: 404 });
  }

  const fileBuffer = await fs.readFile(fullPath);
  const mimeType = mime.lookup(fullPath) || "application/octet-stream";

  return new Response(fileBuffer, {
    headers: {
      "Content-Type": mimeType,
      "Cache-Control": "public, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
