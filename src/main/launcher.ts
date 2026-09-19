/**
 * launcher.ts — 启动执行器
 *
 * 六类入口各自的安全启动方式（绝不拼接 shell 字符串执行外部数据）：
 *   gui    → spawn(exe, {detached}) 独立进程
 *   lnk    → shell.openPath(lnk) 保留原快捷方式的参数/工作目录
 *   script → cmd /c start "" <bat>（批处理需要自己的控制台）
 *   cli    → 新开 PowerShell 窗口，cd 到工具目录并把该目录前置到 PATH
 *   web    → URL 走系统浏览器；本地 html 走默认程序
 *   folder → shell.openPath(目录)
 *
 * 安全说明：这里所有路径都来自本机自己的清单（data/curated-tools.json）与本地扫描结果，
 * 不接受来自网络的输入；spawn 一律用「可执行文件 + 参数数组」形式，不经过 shell。
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { clipboard, shell } from 'electron';
import type { LaunchResult, Tool } from './types';

const PWSH = 'E:\\AI\\tools\\powershell\\pwsh.exe';

function shellForTerminal(): string {
  return fs.existsSync(PWSH) ? PWSH : 'powershell.exe';
}

function toolDir(t: Tool): string {
  return t.dir || path.dirname(t.path);
}

function existingDir(t: Tool): string | undefined {
  const d = toolDir(t);
  return fs.existsSync(d) ? d : undefined;
}

/** 生成「复制命令」给出的可粘贴命令 */
export function commandFor(t: Tool): string {
  const dir = toolDir(t);
  const base = path.basename(t.path);
  switch (t.kind) {
    case 'cli':
      return `cd "${dir}"\n.\\${base}`;
    case 'script':
      return `"${t.path}"`;
    case 'web':
      return /^https?:/i.test(t.path) ? t.path : `start "" "${t.path}"`;
    default:
      return `"${t.path}"`;
  }
}

/** PowerShell 单引号转义（路径含空格/引号都安全） */
function psQuote(s: string): string {
  return `'${s.replace(/'/g, "''")}'`;
}

/** CLI 工具：新开终端窗口，定位到工具目录并说明用法 */
function launchCli(t: Tool): LaunchResult {
  const dir = toolDir(t);
  const base = path.basename(t.path);
  const hint = t.desc ? `Toolbox · ${t.name} — ${t.desc}` : `Toolbox · ${t.name}`;
  const usage = `可直接输入：${base}  （目录已加入 PATH）`;
  const ps = [
    `Set-Location -LiteralPath ${psQuote(dir)}`,
    `if (Test-Path -LiteralPath ${psQuote(t.path)}) { $env:PATH = ${psQuote(dir)} + ';' + $env:PATH }`,
    `Write-Host ${psQuote(hint)} -ForegroundColor Cyan`,
    `Write-Host ${psQuote(usage)} -ForegroundColor DarkGray`,
  ].join('; ');

  spawn(shellForTerminal(), ['-NoExit', '-Command', ps], {
    detached: true,
    stdio: 'ignore',
    cwd: existingDir(t),
    windowsHide: false,
  }).unref();
  return { ok: true, message: `已在新终端打开 ${t.name}` };
}

function launchGui(t: Tool): LaunchResult {
  spawn(t.path, t.args || [], {
    detached: true,
    stdio: 'ignore',
    cwd: existingDir(t),
    windowsHide: false,
  }).unref();
  return { ok: true, message: `已启动 ${t.name}` };
}

function launchScript(t: Tool): LaunchResult {
  spawn('cmd.exe', ['/c', 'start', '', t.path], {
    detached: true,
    stdio: 'ignore',
    cwd: existingDir(t),
    windowsHide: true,
  }).unref();
  return { ok: true, message: `已运行脚本 ${t.name}` };
}

/** 提权启动：走 UAC，由系统弹窗确认 */
function launchViaUac(t: Tool): LaunchResult {
  const target = t.target && fs.existsSync(t.target) ? t.target : t.path;
  spawn('powershell.exe', ['-NoProfile', '-Command', `Start-Process -FilePath ${psQuote(target)} -Verb RunAs`], {
    detached: true,
    stdio: 'ignore',
    windowsHide: true,
  }).unref();
  return { ok: true, message: `已请求管理员权限启动 ${t.name}` };
}

async function openPathResult(target: string, okMsg: string): Promise<LaunchResult> {
  const err = await shell.openPath(target);
  return err ? { ok: false, message: err } : { ok: true, message: okMsg };
}

export async function launchTool(t: Tool, opts: { admin?: boolean } = {}): Promise<LaunchResult> {
  if (t.kind !== 'web' && !fs.existsSync(t.path)) {
    return { ok: false, message: `路径不存在：${t.path}` };
  }
  if (opts.admin) return launchViaUac(t);

  try {
    switch (t.kind) {
      case 'web': {
        if (/^https?:/i.test(t.path)) {
          await shell.openExternal(t.path);
          return { ok: true, message: `已在浏览器打开 ${t.name}` };
        }
        return await openPathResult(t.path, `已打开 ${t.name}`);
      }
      case 'folder':
        return await openPathResult(toolDir(t), `已打开目录 ${t.name}`);
      case 'lnk':
        return await openPathResult(t.path, `已启动 ${t.name}`);
      case 'script':
        return launchScript(t);
      case 'cli':
        return launchCli(t);
      case 'gui':
      default:
        return launchGui(t);
    }
  } catch (err) {
    return { ok: false, message: `启动失败：${(err as Error).message}` };
  }
}

export async function openDir(t: Tool): Promise<LaunchResult> {
  const dir = toolDir(t);
  if (!fs.existsSync(dir)) return { ok: false, message: `目录不存在：${dir}` };
  return openPathResult(dir, `已打开 ${dir}`);
}

export function copyCommand(t: Tool): LaunchResult {
  clipboard.writeText(commandFor(t));
  return { ok: true, message: `已复制命令（${t.name}）` };
}
