/**
 * verify-launcher.cjs — 启动器契约自检（无副作用）
 *
 *   npm run verify:launcher
 *
 * 为什么这么绕：launcher.js 依赖 electron 的 shell/clipboard，只能在真正的
 * Electron 主进程里 require；而 Electron 不支持 `-e` 内联脚本，Windows 上主进程
 * 的 stdout 也不可靠地连到父控制台 —— 所以生成一个临时 Electron 应用入口，
 * 让它把结果写进 JSON 文件再读回来。
 *
 * 检查项：
 *   1. 四类 kind 的「复制命令」文本
 *   2. 路径不存在时返回失败而不是抛异常
 *   3. spawn 通路真的能拉起一个「打印帮助后自己退出」的控制台程序（sigcheck64 -?）
 */
"use strict";

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

const root = path.join(__dirname, "..");
const launcherPath = path.join(root, "dist", "main", "launcher.js");
// 在普通 Node 里 require('electron') 返回的是可执行文件路径字符串
const electron = require("electron");

if (!fs.existsSync(launcherPath)) {
 console.error("缺少 dist/main/launcher.js —— 请先 npm run build");
 process.exit(1);
}

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "toolbox-verify-"));
const resultFile = path.join(tmpDir, "result.json");
const appFile = path.join(tmpDir, "main.js");

const appSource = `
const { app } = require('electron');
const fs = require('node:fs');
const { commandFor, launchTool } = require(${JSON.stringify(launcherPath)});

const out = [];
const T = (o) => Object.assign({
  id: 'x', name: 't', category: 'dev', source: 'curated', exists: true,
  dir: 'E:\\\\AI\\\\tools', version: '', tags: []
}, o);

out.push(['cli', commandFor(T({ kind: 'cli', path: 'E:\\\\AI\\\\tools\\\\jq\\\\jq.exe', dir: undefined }))]);
out.push(['script', commandFor(T({ kind: 'script', path: 'E:\\\\AI\\\\tools\\\\HEAOZIE\\\\定时休眠\\\\定时睡眠.bat' }))]);
out.push(['web', commandFor(T({ kind: 'web', path: 'http://127.0.0.1:3000' }))]);
out.push(['gui', commandFor(T({ kind: 'gui', path: 'E:\\\\AI\\\\tools\\\\mpv\\\\mpv.exe' }))]);

function finish(code) {
  try { fs.writeFileSync(${JSON.stringify(resultFile)}, JSON.stringify(out), 'utf8'); } catch (e) {}
  app.exit(code);
}

launchTool(T({ kind: 'gui', path: 'E:\\\\AI\\\\tools\\\\__nope__\\\\nope.exe' }))
  .then((r) => {
    out.push(['deadPath', JSON.stringify(r)]);
    return launchTool(T({
      kind: 'gui',
      path: 'E:\\\\AI\\\\tools\\\\sysinternals\\\\sigcheck64.exe',
      args: ['-?'],
      dir: 'E:\\\\AI\\\\tools\\\\sysinternals'
    }));
  })
  .then((r) => { out.push(['spawn', JSON.stringify(r)]); finish(0); })
  .catch((e) => { out.push(['error', String(e && e.message)]); finish(1); });

setTimeout(() => finish(2), 20000);
`;

fs.writeFileSync(appFile, appSource, "utf8");

const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE; // 否则 Electron 以纯 Node 模式启动

let exitCode = 0;
try {
 execFileSync(electron, [appFile], {
  cwd: root,
  env,
  stdio: "ignore",
  timeout: 90_000,
 });
} catch (err) {
 exitCode = err.status ?? -1;
}

const raw = fs.existsSync(resultFile)
 ? fs.readFileSync(resultFile, "utf8")
 : "";
let results = [];
try {
 results = JSON.parse(raw);
} catch {
 results = [];
}

try {
 fs.rmSync(tmpDir, { recursive: false, force: true });
} catch {
 /* 临时目录清理失败不影响判定 */
}

const map = new Map(results);
const checks = [];
const check = (name, ok, detail = "") => {
 checks.push({ name, ok: !!ok });
 console.log(`${ok ? "✓" : "✗"} ${name}${detail ? ` — ${detail}` : ""}`);
};

if (!map.size) {
 console.error(`✗ 未取到检查结果（Electron exit=${exitCode}）`);
 process.exit(1);
}

check(
 "复制命令 · cli 含 cd + 相对调用",
 /cd "E:\\AI\\tools\\jq"[\s\S]*\.\\jq\.exe/.test(map.get("cli") || ""),
 map.get("cli")?.replace(/\n/g, " ⏎ "),
);
check(
 "复制命令 · script 为带引号路径",
 (map.get("script") || "").startsWith('"') &&
  (map.get("script") || "").endsWith('"'),
);
check("复制命令 · web 直出 URL", map.get("web") === "http://127.0.0.1:3000");
check("复制命令 · gui 带引号路径", (map.get("gui") || "").includes("mpv.exe"));

let dead = {};
try {
 dead = JSON.parse(map.get("deadPath") || "{}");
} catch {
 dead = {};
}
check("死路径返回 ok:false 而非抛异常", dead.ok === false, dead.message);

let spawned = {};
try {
 spawned = JSON.parse(map.get("spawn") || "{}");
} catch {
 spawned = {};
}
check("spawn 通路返回 ok:true", spawned.ok === true, spawned.message);

const failed = checks.filter((c) => !c.ok).length;
console.log(`\n${checks.length - failed}/${checks.length} 通过`);
process.exit(failed ? 1 : 0);
