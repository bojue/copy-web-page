import { NextRequest } from "next/server";
import path from "path";
import fs from "fs/promises";
import { existsSync } from "fs";
import os from "os";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
  const { jobId } = await params;
  const outputDir = path.join(os.tmpdir(), "web-cloner", jobId, "site");

  if (!existsSync(outputDir)) {
    return Response.json({ error: "Job not found" }, { status: 404 });
  }

  // Find the main HTML file (usually index.html or the first HTML file)
  const files = await fs.readdir(outputDir);
  let htmlFile: string | undefined = files.find((f) => f === "index.html");

  if (!htmlFile) {
    htmlFile = files.find((f) => f.endsWith(".html"));
  }

  if (!htmlFile) {
    return Response.json({ error: "No HTML file found" }, { status: 404 });
  }

  const htmlPath = path.join(outputDir, htmlFile);
  let htmlContent = await fs.readFile(htmlPath, "utf-8");

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

  return new Response(htmlContent, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
    },
  });
}
