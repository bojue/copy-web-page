import { NextRequest } from "next/server";
import path from "path";
import fs from "fs/promises";
import { existsSync, readdirSync, readFileSync } from "fs";
import os from "os";

// 内存缓存，避免重复读取静态模板
const htmlCache = new Map<string, string>();

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
  const { jobId } = await params;

  // 首先检查是否是公共模板（不会被清理的案例）
  // 优先级：系统 /public/templates > 项目 public/templates > 临时目录
  const systemPublicTemplateDir = path.join("/public", "templates", jobId, "site");
  const projectPublicTemplateDir = path.join(process.cwd(), "public", "templates", jobId, "site");
  const tmpOutputDir = path.join(os.tmpdir(), "web-cloner", jobId, "site");

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

  // 对于公共模板，使用缓存
  const cacheKey = `${jobId}:${outputDir}`;
  if (isPublicTemplate && htmlCache.has(cacheKey)) {
    return new Response(htmlCache.get(cacheKey), {
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "public, max-age=3600, stale-while-revalidate=86400",
        "X-Cache": "HIT",
      },
    });
  }

  // Find the main HTML file (usually index.html or the first HTML file)
  const files = readdirSync(outputDir);
  let htmlFile: string | undefined = files.find((f) => f === "index.html");

  if (!htmlFile) {
    htmlFile = files.find((f) => f.endsWith(".html"));
  }

  if (!htmlFile) {
    return Response.json({ error: "No HTML file found" }, { status: 404 });
  }

  const htmlPath = path.join(outputDir, htmlFile);
  let htmlContent = readFileSync(htmlPath, "utf-8");

  // Remove any existing <base> tag to avoid conflicts
  htmlContent = htmlContent.replace(/<base[^>]*>/gi, "");

  // For preview: inject a base tag pointing to our assets route
  // This allows relative paths like "assets/css/0.css" to resolve correctly
  const baseTag = `<base href="/api/clone/${jobId}/preview/assets/">`;

  // For resources that weren't successfully rewritten to local paths
  // (still have absolute URLs like https://... or protocol-relative //...),
  // they will load directly from the original server, acting as a fallback
  if (htmlContent.match(/<head([^>]*)>/i)) {
    htmlContent = htmlContent.replace(/<head([^>]*)>/i, `<head$1>\n  ${baseTag}`);
  } else {
    htmlContent = baseTag + "\n" + htmlContent;
  }

  // 缓存公共模板
  if (isPublicTemplate) {
    htmlCache.set(cacheKey, htmlContent);
  }

  return new Response(htmlContent, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": isPublicTemplate
        ? "public, max-age=3600, stale-while-revalidate=86400"
        : "public, max-age=300",
      "X-Cache": "MISS",
    },
  });
}
