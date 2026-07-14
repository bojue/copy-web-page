import * as fs from "fs";
import * as path from "path";
import * as os from "os";

interface CacheEntry {
  jobId: string;
  url: string;
  depth: number;
  includeJs: boolean;
  pages: number;
  assets: number;
  totalSize: number;
  createdAt: number;
}

/**
 * 克隆结果缓存
 * 如果同一 URL（相同参数）已经克隆过且 zip 文件仍存在，直接返回缓存结果
 */
class CloneCache {
  private cache = new Map<string, CacheEntry>();

  /**
   * 生成缓存 key（基于 url + depth + includeJs）
   */
  private makeKey(url: string, depth: number, includeJs: boolean): string {
    return `${url}|${depth}|${includeJs}`;
  }

  /**
   * 检查缓存中是否有有效结果
   */
  get(url: string, depth: number, includeJs: boolean): CacheEntry | null {
    const key = this.makeKey(url, depth, includeJs);
    const entry = this.cache.get(key);

    if (!entry) return null;

    // 验证 zip 文件是否仍存在
    const zipPath = path.join(os.tmpdir(), "web-cloner", entry.jobId, "site.zip");
    if (!fs.existsSync(zipPath)) {
      this.cache.delete(key);
      return null;
    }

    return entry;
  }

  /**
   * 写入缓存
   */
  set(url: string, depth: number, includeJs: boolean, result: Omit<CacheEntry, "url" | "depth" | "includeJs" | "createdAt">) {
    const key = this.makeKey(url, depth, includeJs);
    this.cache.set(key, {
      ...result,
      url,
      depth,
      includeJs,
      createdAt: Date.now(),
    });
  }
}

export const cloneCache = new CloneCache();
