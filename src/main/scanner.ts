/**
 * scanner.ts — 本机工具扫描器（主进程内运行，打包后不依赖系统 Node）
 *
 * 产出 data/scan-raw.json：
 *   { scannedAt, toolsDir, portable: {...}, startMenu: {...}, elapsedMs }
 *
 * 约束（AGENTS.md 删除纪律的只读对称版）：
 *   - 只读扫描，绝不删除 / 移动 / 重命名任何文件
 *   - 不跟随 junction / 符号链接（跳过 reparse point）
 *   - 外部命令一律带超时
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { writeJsonAtomic } from './jsonfile';

const EXE_EXT = new Set(['.exe', '.cmd', '.bat']);
const SKIP_DIRS = new Set([
  'node_modules',
  '.git',
  'docs',
  'locales',
  'lang',
  'languages',
  'translations',
  '__pycache__',
]);

export interface PortableEntry {
  folder: string;
  dir: string;
  exists: boolean;
  executables: { path: string; name: string; size: number; depth: number }[];
}

export interface StartMenuEntry {
  name: string;
  lnk: string;
  target: string;
  args?: string;
  workdir?: string;
  targetExists?: boolean;
  lnkExists?: boolean;
}

export interface ScanResult {
  scannedAt: string;
  toolsDir: string;
  portable: { tools: PortableEntry[]; error: string | null };
  startMenu: {
    kept: StartMenuEntry[];
    droppedCount: number;
    deadCount: number;
    error: string | null;
  };
  elapsedMs: number;
}

function isReparsePoint(p: string): boolean {
  try {
    return fs.lstatSync(p).isSymbolicLink();
  } catch {
    return false;
  }
}

export function findExecutables(rootDir: string): PortableEntry['executables'] {
  const found: PortableEntry['executables'] = [];
  const queue: { dir: string; depth: number }[] = [{ dir: rootDir, depth: 0 }];
  while (queue.length) {
    const { dir, depth } = queue.shift()!;
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const e of entries) {
      const full = path.join(dir, e.name);
      if (isReparsePoint(full)) continue;
      if (e.isFile()) {
        if (EXE_EXT.has(path.extname(e.name).toLowerCase())) {
          let size = 0;
          try {
            size = fs.statSync(full).size;
          } catch {
            /* 忽略不可读文件 */
          }
          found.push({ path: full, name: e.name, size, depth });
        }
      } else if (e.isDirectory() && depth < 2 && !SKIP_DIRS.has(e.name.toLowerCase()) && !e.name.startsWith('.')) {
        queue.push({ dir: full, depth: depth + 1 });
      }
    }
  }
  return found;
}

export function scanPortableTools(dir: string): { tools: PortableEntry[]; error: string | null } {
  const out: PortableEntry[] = [];
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch (err) {
    return { tools: [], error: String((err as Error).message) };
  }
  for (const e of entries) {
    if (!e.isDirectory()) continue;
    const full = path.join(dir, e.name);
    if (isReparsePoint(full)) continue;
    out.push({ folder: e.name, dir: full, exists: true, executables: findExecutables(full) });
  }
  return { tools: out, error: null };
}

/** PowerShell 5.1 默认按 OEM 代码页输出，必须显式切 UTF-8，否则中文名变乱码 */
const PS_LNK_SCRIPT = `
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$ErrorActionPreference = 'SilentlyContinue'
$roots = @(
  'C:\\ProgramData\\Microsoft\\Windows\\Start Menu\\Programs',
  (Join-Path $env:APPDATA 'Microsoft\\Windows\\Start Menu\\Programs')
)
$sh = New-Object -ComObject WScript.Shell
$rows = @()
foreach ($root in $roots) {
  if (-not (Test-Path $root)) { continue }
  Get-ChildItem -LiteralPath $root -Recurse -Filter *.lnk -File | ForEach-Object {
    $lnk = $_.FullName
    try { $s = $sh.CreateShortcut($lnk) } catch { return }
    $rows += [pscustomobject]@{
      name    = $_.BaseName
      lnk     = $lnk
      target  = $s.TargetPath
      args    = $s.Arguments
      workdir = $s.WorkingDirectory
    }
  }
}
$rows | ConvertTo-Json -Depth 3 -Compress
`;

export function readStartMenuLinks(): { items: StartMenuEntry[]; error: string | null } {
  try {
    const buf = execFileSync(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', PS_LNK_SCRIPT],
      { encoding: 'utf8', timeout: 120_000, maxBuffer: 32 * 1024 * 1024 }
    );
    const text = String(buf).trim();
    if (!text) return { items: [], error: null };
    const parsed = JSON.parse(text);
    return { items: Array.isArray(parsed) ? parsed : [parsed], error: null };
  } catch (err) {
    return { items: [], error: String((err as Error).message || err) };
  }
}

const NOISE_RE =
  /(^|[\s\-_（(])(uninstall|卸载|remove|help|帮助|readme|read me|manual|手册|licen[cs]e|许可|changelog|更新日志|release notes|版本说明|documentation|文档|samples?|示例|localization|skin format|user guide|update|updater|升级|reporter|report a problem|error report|setup|安装|readme|wizard|助手|诊断|diagnostic|redistributable|runtime|driver|驱动|reference|参考|translator|recover|恢复|crash|support|反馈|feedback)([\s\-_）)]|$)/i;
const NOISE_NAME_EXACT = new Set(['uninstall', 'readme', 'setup', 'help']);
const PREFIX_NOISE_RE = /^(卸载|uninstall|remove\s)/i;

export function isNoise(name: string): boolean {
  const n = name.trim();
  if (!n) return true;
  if (NOISE_NAME_EXACT.has(n.toLowerCase())) return true;
  if (PREFIX_NOISE_RE.test(n)) return true;
  return NOISE_RE.test(n);
}

export function filterStartMenu(items: StartMenuEntry[]): {
  kept: StartMenuEntry[];
  droppedCount: number;
  deadCount: number;
} {
  const kept: StartMenuEntry[] = [];
  let droppedCount = 0;
  for (const it of items) {
    const target = (it.target || '').trim();
    if (!target) {
      droppedCount++;
      continue;
    }
    if (isNoise(it.name)) {
      droppedCount++;
      continue;
    }
    const low = target.toLowerCase();
    if (low.endsWith('\\unins000.exe') || low.includes('\\uninstall')) {
      droppedCount++;
      continue;
    }
    it.targetExists = fs.existsSync(target);
    it.lnkExists = fs.existsSync(it.lnk);
    kept.push(it);
  }
  return { kept, droppedCount, deadCount: kept.filter((k) => !k.targetExists).length };
}

export function runScan(toolsDir: string, outFile: string): ScanResult {
  const t0 = Date.now();
  const portable = scanPortableTools(toolsDir);
  const sm = readStartMenuLinks();
  const { kept, droppedCount, deadCount } = filterStartMenu(sm.items);

  const result: ScanResult = {
    scannedAt: new Date().toISOString(),
    toolsDir,
    portable,
    startMenu: { kept, droppedCount, deadCount, error: sm.error },
    elapsedMs: Date.now() - t0,
  };
  writeJsonAtomic(outFile, result);
  return result;
}
