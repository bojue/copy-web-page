import { CloneOptions, CloneProgress, CloneResult, Asset, DEFAULT_RATE_LIMIT } from "../types";
import { config } from "../config";
import { renderPage, RenderResult } from "./renderer";
import { downloadAssets } from "./asset-downloader";
import { processCssFiles } from "./css-processor";
import { rewriteHtml } from "./path-rewriter";
import { discoverLinks } from "./crawler";
import { createZip } from "./zip-packager";
import { browserPool } from "./browser-pool";
import { RateLimiter } from "./rate-limiter";
import { ProgressManager } from "./progress-manager";
import { FileManager } from "./file-manager";
import { HtmlProcessor } from "./html-processor";
import { Browser } from "puppeteer";
import * as fs from "fs";

export class CloneEngine {
  private fileManager: FileManager;
  private progressManager: ProgressManager;

  constructor(onProgress?: (progress: CloneProgress) => void) {
    this.fileManager = new FileManager();
    this.progressManager = new ProgressManager(onProgress);
  }

  async clone(options: CloneOptions): Promise<CloneResult> {
    const { url, depth, includeJs } = options;
    const visitedUrls = new Set<string>();
    const allAssets: Asset[] = [];
    // 内存中保存页面 HTML，减少磁盘 I/O
    const pageHtmlMap = new Map<string, string>();
    const pageFiles: Array<{ url: string; filename: string }> = [];
    const allInlinedCss: string[] = [];
    const allCanvasSnapshots: Array<{ selector: string; dataUrl: string }> = [];
    const isMultiPage = depth > 1;

    // 创建共享的限流器实例
    const rateLimitOptions = { ...DEFAULT_RATE_LIMIT, ...options.rateLimit };
    const rateLimiter = new RateLimiter(rateLimitOptions, (state) => {
      // 自适应限流状态变化时通知前端
      if (state.isThrottled) {
        this.progressManager.emit(
          "downloading",
          `检测到频率限制，已自动降速 (${state.throttleMultiplier.toFixed(1)}x)`,
          this.progressManager.getLastPercent(),
          {
            throttleState: {
              isThrottled: true,
              multiplier: state.throttleMultiplier,
              reason: `已触发 ${state.totalThrottleEvents} 次限流`,
            },
          }
        );
      }
    });

    // 为多页爬取时获取一个独占的浏览器实例
    let taskBrowser: Browser | null = null;

    try {
      // Phase 1: Render pages (多页爬取时复用浏览器实例)
      const urlsToVisit: Array<{ url: string; currentDepth: number }> = [
        { url, currentDepth: 1 },
      ];

      // 多页模式下提前获取浏览器，整个任务复用
      if (isMultiPage) {
        taskBrowser = await browserPool.acquire();
      }

      while (urlsToVisit.length > 0) {
        const current = urlsToVisit.shift()!;
        if (visitedUrls.has(current.url)) continue;
        visitedUrls.add(current.url);

        const pageIndex = visitedUrls.size;
        this.progressManager.emitRenderProgress(pageIndex, current.url);

        // 多页爬取时，页面间添加随机延迟（模拟真实用户浏览行为）
        if (isMultiPage && pageIndex > 1) {
          const delay = config.multiPage.minPageDelay + Math.random() * (config.multiPage.maxPageDelay - config.multiPage.minPageDelay);
          console.log(`  ⏳ 页面间延迟 ${(delay / 1000).toFixed(1)}s（反爬保护）`);
          await new Promise((r) => setTimeout(r, delay));
        }

        const result: RenderResult = await renderPage(current.url, {
          includeJs,
          reuseBrowser: isMultiPage,
          browser: taskBrowser || undefined, // 多页时传入共享浏览器
        });

        // Store page HTML in memory（不写磁盘）
        const filename = pageIndex === 1 ? "index.html" : `page${pageIndex}.html`;
        pageFiles.push({ url: current.url, filename });
        pageHtmlMap.set(filename, result.html);
        allAssets.push(...result.assets);

        // Collect computed CSS
        if (result.inlinedCss) {
          allInlinedCss.push(result.inlinedCss);
        }

        // Collect canvas snapshots
        if (result.canvasSnapshots) {
          allCanvasSnapshots.push(...result.canvasSnapshots);
        }

        // Process iframe contents - save as separate HTML files
        if (result.iframeContents) {
          for (let i = 0; i < result.iframeContents.length; i++) {
            const iframe = result.iframeContents[i];
            this.fileManager.writeIframeHtml(pageIndex, i, iframe.html);
            allAssets.push(...iframe.assets);
          }
        }

        // Discover links for multi-page crawling
        if (current.currentDepth < depth) {
          const links = discoverLinks(result.html, current.url, depth, current.currentDepth);
          for (const link of links.slice(0, config.multiPage.maxLinksPerDepth)) {
            if (!visitedUrls.has(link)) {
              urlsToVisit.push({ url: link, currentDepth: current.currentDepth + 1 });
            }
          }
        }
      }

      // Phase 2: Download assets (优化进度报告)
      this.progressManager.emitDownloadPrepare(allAssets.length);

      // Deduplicate assets by URL
      const uniqueAssets = HtmlProcessor.deduplicateAssets(allAssets);
      this.progressManager.emitDeduplicationComplete(allAssets.length, uniqueAssets.length);

      const downloadedAssets = await downloadAssets(
        uniqueAssets,
        this.fileManager.getOutputDir(),
        (done, total, stats) => {
          if (stats) {
            // 计算 ETA
            const elapsedSec = stats.elapsedMs / 1000;
            const downloadSpeed = stats.downloadedBytes / elapsedSec; // bytes/sec
            const remaining = total - done;
            const avgTimePerAsset = elapsedSec / done;
            const remainingSeconds = Math.ceil(remaining * avgTimePerAsset);

            // 格式化下载速度
            let speedStr = "";
            if (downloadSpeed > 1024 * 1024) {
              speedStr = `${(downloadSpeed / (1024 * 1024)).toFixed(1)} MB/s`;
            } else if (downloadSpeed > 1024) {
              speedStr = `${(downloadSpeed / 1024).toFixed(1)} KB/s`;
            } else {
              speedStr = `${downloadSpeed.toFixed(0)} B/s`;
            }

            this.progressManager.emitDownloadProgress(done, total, {
              remainingSeconds,
              downloadSpeed: speedStr,
            });
          } else {
            this.progressManager.emitDownloadProgress(done, total);
          }
        },
        url,
        rateLimiter
      );

      // Phase 3: Process CSS files (download fonts/images referenced in CSS)
      const cssAssets = downloadedAssets.filter(a => a.type === "css" && a.localPath);
      this.progressManager.emitCssProcessing(cssAssets.length);
      const cssExtraAssets = await processCssFiles(downloadedAssets, this.fileManager.getOutputDir(), rateLimiter);
      const finalAssets = [...downloadedAssets, ...cssExtraAssets];

      // Phase 4: Save canvas snapshots as image files (仅在有 canvas 时处理)
      if (allCanvasSnapshots.length > 0) {
        this.progressManager.emitCanvasProcessing(allCanvasSnapshots.length);
        for (const snapshot of allCanvasSnapshots) {
          const snapshotPath = this.fileManager.writeCanvasSnapshot(snapshot.dataUrl);

          // Add to assets for path rewriting
          finalAssets.push({
            url: `__canvas__${snapshot.selector}`,
            type: "image",
            localPath: snapshotPath,
          });
        }
      }

      // Phase 5: Save inlined CSS (仅在有内联 CSS 时处理)
      let computedCssPath = "";
      if (allInlinedCss.length > 0) {
        this.progressManager.emitStyleSaving();
        const inlinedCssContent = allInlinedCss.join("\n\n");
        computedCssPath = this.fileManager.writeCss(inlinedCssContent);

        // Rewrite URLs in computed.css to point to already-downloaded local assets
        const rewrittenCss = HtmlProcessor.rewriteCssUrls(
          computedCssPath,
          inlinedCssContent,
          finalAssets,
          url
        );
        this.fileManager.writeCss(rewrittenCss);
      }

      // Phase 6: Rewrite HTML paths（从内存读取 HTML，减少一次磁盘读）
      this.progressManager.emitPathRewriting();
      for (const page of pageFiles) {
        let html = pageHtmlMap.get(page.filename) || "";
        html = rewriteHtml(html, finalAssets, {
          includeJs,
          pageFilename: page.filename,
          pageUrl: page.url,
        });

        // Inject computed CSS into the page
        if (computedCssPath) {
          html = HtmlProcessor.injectComputedCss(html, computedCssPath);
        }

        // Replace canvas elements with snapshot images
        html = HtmlProcessor.replaceCanvasWithImages(html, allCanvasSnapshots, finalAssets);

        // 最终写入磁盘（只写一次）
        this.fileManager.writePageHtml(page.filename, html);
      }

      // 释放内存中的 HTML
      pageHtmlMap.clear();

      // Phase 7: Package as zip
      this.progressManager.emitPackaging();
      await createZip(this.fileManager.getOutputDir(), this.fileManager.getZipPath());

      // 计算总资源大小
      let totalSize = 0;
      try {
        const stats = fs.statSync(this.fileManager.getZipPath());
        totalSize = stats.size;
      } catch {}

      // 关闭任务级浏览器（如果使用了）
      if (taskBrowser) {
        await browserPool.release(taskBrowser);
        taskBrowser = null;
      }

      this.progressManager.emitComplete();

      return {
        jobId: this.fileManager.getJobId(),
        pages: pageFiles.length,
        assets: finalAssets.filter((a) => a.localPath).length,
        totalSize,
        zipPath: this.fileManager.getZipPath(),
      };
    } catch (error) {
      // 出错时也要释放浏览器
      if (taskBrowser) {
        await browserPool.release(taskBrowser).catch(() => {});
        taskBrowser = null;
      }
      const message = error instanceof Error ? error.message : "Unknown error";
      this.progressManager.emitError(message);
      throw error;
    }
  }

  getJobId(): string {
    return this.fileManager.getJobId();
  }

  getZipPath(): string {
    return this.fileManager.getZipPath();
  }

  cleanup() {
    this.fileManager.cleanup();
  }
}
