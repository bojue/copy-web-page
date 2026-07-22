import { NextRequest } from "next/server";
import path from "path";
import fs from "fs/promises";
import { existsSync } from "fs";
import os from "os";

// 内存缓存，避免重复读取静态模板
const htmlCache = new Map<string, { content: string; timestamp: number }>();
const CACHE_TTL = 3600 * 1000; // 1小时缓存有效期

// 清理过期缓存
function cleanExpiredCache() {
  const now = Date.now();
  for (const [key, value] of htmlCache.entries()) {
    if (now - value.timestamp > CACHE_TTL) {
      htmlCache.delete(key);
    }
  }
}

// 扩展 globalThis 类型
declare global {
  var __cache_cleaner__: NodeJS.Timeout | undefined;
}

// 定期清理缓存（每10分钟）
if (typeof globalThis !== 'undefined' && !globalThis.__cache_cleaner__) {
  globalThis.__cache_cleaner__ = setInterval(cleanExpiredCache, 600000);
}

// 异步查找 HTML 文件
async function findHtmlFile(dir: string): Promise<string | null> {
  try {
    const files = await fs.readdir(dir);
    const indexHtml = files.find((f) => f === "index.html");
    if (indexHtml) return indexHtml;

    const htmlFile = files.find((f) => f.endsWith(".html"));
    return htmlFile || null;
  } catch {
    return null;
  }
}

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
    const cached = htmlCache.get(cacheKey)!;
    if (Date.now() - cached.timestamp < CACHE_TTL) {
      return new Response(cached.content, {
        headers: {
          "Content-Type": "text/html; charset=utf-8",
          "Cache-Control": "public, max-age=3600, stale-while-revalidate=86400",
          "X-Cache": "HIT",
        },
      });
    } else {
      htmlCache.delete(cacheKey);
    }
  }

  // 异步查找 HTML 文件
  const htmlFile = await findHtmlFile(outputDir);
  if (!htmlFile) {
    return Response.json({ error: "No HTML file found" }, { status: 404 });
  }

  const htmlPath = path.join(outputDir, htmlFile);
  let htmlContent: string;

  try {
    htmlContent = await fs.readFile(htmlPath, "utf-8");
  } catch (error) {
    return Response.json({ error: "Failed to read HTML file" }, { status: 500 });
  }

  // 优化：使用更高效的字符串处理方式
  const baseTag = `<base href="/api/clone/${jobId}/preview/assets/">`;

  // 只处理必要的内容，减少正则表达式操作
  // 1. 移除现有的 base 标签
  const baseTagRegex = /<base[^>]*>/gi;
  if (baseTagRegex.test(htmlContent)) {
    htmlContent = htmlContent.replace(baseTagRegex, "");
  }

  // 2. 添加性能优化标签（最小化）
  const optimizationTags = `${baseTag}
<meta name="viewport" content="width=device-width,initial-scale=1">
<link rel="dns-prefetch" href="//fonts.googleapis.com">
<link rel="preconnect" href="//fonts.googleapis.com">`;

  // 3. 注入优化后的内容
  const headMatch = htmlContent.match(/<head([^>]*)>/i);
  if (headMatch) {
    const headIndex = htmlContent.indexOf(headMatch[0]) + headMatch[0].length;
    htmlContent =
      htmlContent.slice(0, headIndex) +
      "\n" + optimizationTags + "\n" +
      htmlContent.slice(headIndex);
  } else {
    htmlContent = optimizationTags + "\n" + htmlContent;
  }

  // 缓存公共模板
  if (isPublicTemplate) {
    htmlCache.set(cacheKey, {
      content: htmlContent,
      timestamp: Date.now(),
    });
  }

  return new Response(htmlContent, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": isPublicTemplate
        ? "public, max-age=3600, stale-while-revalidate=86400"
        : "public, max-age=300",
      "X-Cache": "MISS",
      "Content-Length": String(Buffer.byteLength(htmlContent, "utf-8")),
    },
  });
}
