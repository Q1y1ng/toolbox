/**
 * shot.cjs — 界面截图自检
 *
 *   npm run shot             → data/shot.png
 *   npm run shot -- out.png  → 指定输出
 *
 * 原理：以 TOOLBOX_SHOT 环境变量启动 Electron，主进程在窗口就绪后截屏并退出
 * （见 src/main/main.ts 的同名分支）。用于回归时快速确认界面没画崩。
 */
'use strict';

const path = require('node:path');
const fs = require('node:fs');
const { spawnSync } = require('node:child_process');

const root = path.join(__dirname, '..');
// 在普通 Node 里 require('electron') 返回可执行文件路径字符串
const electron = require('electron');
const out = path.resolve(process.argv[2] || path.join(root, 'data', 'shot.png'));

if (!fs.existsSync(electron)) {
  console.error('缺少 Electron —— 请先 npm install');
  process.exit(1);
}

const env = { ...process.env, TOOLBOX_SHOT: out, TOOLBOX_SHOT_DELAY: process.env.TOOLBOX_SHOT_DELAY || '5000' };
// agent shell 会导出 ELECTRON_RUN_AS_NODE=1，那会让 Electron 以纯 Node 模式启动（无窗口）
delete env.ELECTRON_RUN_AS_NODE;

console.log(`[shot] 启动 Electron 截图 → ${out}`);
const r = spawnSync(electron, ['.'], { cwd: root, env, stdio: 'inherit', timeout: 120_000 });

if (!fs.existsSync(out)) {
  console.error(`[shot] 截图失败（exit=${r.status}）`);
  process.exit(1);
}
console.log(`[shot] 完成 ${out}（${(fs.statSync(out).size / 1024).toFixed(0)} KB）`);
