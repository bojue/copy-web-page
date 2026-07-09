import * as fs from "fs";
import * as os from "os";
import * as path from "path";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ jobId: string }> }
) {
  const { jobId } = await params;

  // 安全校验：jobId 只允许字母数字和连字符
  if (!/^[a-zA-Z0-9_-]+$/.test(jobId)) {
    return Response.json({ error: "Invalid job ID" }, { status: 400 });
  }

  const zipPath = path.resolve(os.tmpdir(), "web-cloner", jobId, "site.zip");

  // 确保路径在预期目录内
  const expectedPrefix = path.resolve(os.tmpdir(), "web-cloner");
  if (!zipPath.startsWith(expectedPrefix)) {
    return Response.json({ error: "Invalid path" }, { status: 403 });
  }

  if (!fs.existsSync(zipPath)) {
    return Response.json(
      { error: "Job not found or expired" },
      { status: 404 }
    );
  }

  // 流式传输 zip 文件（避免大文件全部加载到内存）
  try {
    const stat = fs.statSync(zipPath);
    const stream = fs.createReadStream(zipPath);

    // 将 Node.js ReadStream 转换为 Web ReadableStream
    const webStream = new ReadableStream({
      start(controller) {
        stream.on("data", (chunk) => {
          controller.enqueue(chunk);
        });
        stream.on("end", () => {
          controller.close();
        });
        stream.on("error", (err) => {
          controller.error(err);
        });
      },
      cancel() {
        stream.destroy();
      },
    });

    return new Response(webStream, {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="cloned-site-${jobId}.zip"`,
        "Content-Length": String(stat.size),
        "Cache-Control": "private, no-cache",
      },
    });
  } catch (err) {
    return Response.json(
      { error: "Failed to read file" },
      { status: 500 }
    );
  }
}
