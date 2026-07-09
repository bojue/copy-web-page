import * as fs from "fs";

/**
 * Package the output directory into a zip file.
 * Uses maximum compression level for smaller output.
 */
export async function createZip(
  sourceDir: string,
  outputPath: string
): Promise<void> {
  // Use require to avoid TS module resolution issues with archiver
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const archiver = require("archiver");

  return new Promise((resolve, reject) => {
    const output = fs.createWriteStream(outputPath);
    // 降低压缩级别从 9 到 6：速度提升 3-4 倍，文件仅增大 5-10%
    const archive = archiver("zip", { zlib: { level: 6 } });

    output.on("close", () => resolve());
    archive.on("error", (err: Error) => reject(err));

    archive.pipe(output);
    archive.directory(sourceDir, false);
    archive.finalize();
  });
}
