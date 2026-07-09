import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { nanoid } from "nanoid";

/**
 * 文件管理器
 * 负责管理临时文件、目录和清理工作
 */
export class FileManager {
  private jobId: string;
  private outputDir: string;
  private zipPath: string;

  constructor(jobId?: string) {
    this.jobId = jobId || nanoid(10);
    this.outputDir = path.join(os.tmpdir(), "web-cloner", this.jobId, "site");
    this.zipPath = path.join(os.tmpdir(), "web-cloner", this.jobId, "site.zip");
    this.ensureOutputDir();
  }

  /**
   * 确保输出目录存在
   */
  private ensureOutputDir() {
    fs.mkdirSync(this.outputDir, { recursive: true });
  }

  /**
   * 获取 Job ID
   */
  getJobId(): string {
    return this.jobId;
  }

  /**
   * 获取输出目录路径
   */
  getOutputDir(): string {
    return this.outputDir;
  }

  /**
   * 获取 ZIP 文件路径
   */
  getZipPath(): string {
    return this.zipPath;
  }

  /**
   * 写入页面 HTML 文件
   */
  writePageHtml(filename: string, content: string) {
    const filePath = path.join(this.outputDir, filename);
    fs.writeFileSync(filePath, content);
  }

  /**
   * 写入 iframe HTML 文件
   */
  writeIframeHtml(pageIndex: number, iframeIndex: number, content: string) {
    const filename = `iframe_${pageIndex}_${iframeIndex}.html`;
    const filePath = path.join(this.outputDir, filename);
    fs.writeFileSync(filePath, `<!DOCTYPE html>\n${content}`);
  }

  /**
   * 写入 Canvas 快照
   */
  writeCanvasSnapshot(dataUrl: string): string {
    const base64Data = dataUrl.replace(/^data:image\/\w+;base64,/, "");
    const buffer = Buffer.from(base64Data, "base64");
    const snapshotPath = `assets/images/canvas_${nanoid(6)}.png`;
    const fullPath = path.join(this.outputDir, snapshotPath);
    fs.mkdirSync(path.dirname(fullPath), { recursive: true });
    fs.writeFileSync(fullPath, buffer);
    return snapshotPath;
  }

  /**
   * 写入计算后的 CSS
   */
  writeCss(content: string): string {
    const cssPath = "assets/css/computed.css";
    const fullPath = path.join(this.outputDir, cssPath);
    fs.mkdirSync(path.dirname(fullPath), { recursive: true });
    fs.writeFileSync(fullPath, content);
    return cssPath;
  }

  /**
   * 读取 CSS 文件
   */
  readCss(relativePath: string): string {
    const fullPath = path.join(this.outputDir, relativePath);
    return fs.readFileSync(fullPath, "utf-8");
  }

  /**
   * 清理所有临时文件
   */
  cleanup() {
    const jobDir = path.join(os.tmpdir(), "web-cloner", this.jobId);
    fs.rmSync(jobDir, { recursive: true, force: true });
  }
}
