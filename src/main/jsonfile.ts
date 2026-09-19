/**
 * jsonfile.ts — JSON 读写小工具
 *
 * 写入一律「临时文件 + 重命名」原子替换：state.json / scan-raw.json 在写入过程中
 * 被中断（崩溃、断电）时，磁盘上要么是旧内容要么是新内容，不会出现半截 JSON。
 */
import fs from "node:fs";
import path from "node:path";

export function readJson<T>(file: string, fallback: T | null = null): T | null {
 try {
  return JSON.parse(fs.readFileSync(file, "utf8")) as T;
 } catch {
  return fallback;
 }
}

export function writeJsonAtomic(
 file: string,
 data: unknown,
 pretty = true,
): void {
 fs.mkdirSync(path.dirname(file), { recursive: true });
 const tmp = `${file}.tmp-${process.pid}`;
 fs.writeFileSync(tmp, JSON.stringify(data, null, pretty ? 2 : 0), "utf8");
 fs.renameSync(tmp, file);
}
