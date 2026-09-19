#!/usr/bin/env node
/**
 * scan.cjs — 独立扫描入口（命令行用）
 *
 * 实际逻辑在 src/main/scanner.ts（编译到 dist/main/scanner.js），
 * 这样打包后的桌面应用不依赖系统 Node 也能扫描。
 *
 * 用法：npm run scan   （先 tsc 编译）
 */
'use strict';

const path = require('node:path');
const fs = require('node:fs');

const root = path.join(__dirname, '..');
const compiled = path.join(root, 'dist', 'main', 'scanner.js');

if (!fs.existsSync(compiled)) {
  console.error('[scan] 缺少 dist/main/scanner.js —— 请先执行 npm run build');
  process.exit(1);
}

const { runScan } = require(compiled);

const args = process.argv.slice(2);
const argOf = (flag, dflt) => {
  const i = args.indexOf(flag);
  return i >= 0 && args[i + 1] ? args[i + 1] : dflt;
};

const toolsDir = argOf('--tools-dir', 'E:\\AI\\tools');
const out = argOf('--out', path.join(root, 'data', 'scan-raw.json'));

console.log(`[scan] 便携工具目录: ${toolsDir}`);
const r = runScan(toolsDir, out);
console.log(`[scan] 便携目录 ${r.portable.tools.length} 个，错误: ${r.portable.error || '无'}`);
console.log(
  `[scan] 开始菜单保留 ${r.startMenu.kept.length} 条，过滤 ${r.startMenu.droppedCount}，失效 ${r.startMenu.deadCount}`
);
console.log(`[scan] 写出 ${out}（${(fs.statSync(out).size / 1024).toFixed(1)} KB, ${r.elapsedMs} ms）`);
