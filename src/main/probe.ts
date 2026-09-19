/**
 * probe.ts — 运行状态探测
 *
 * 只对「配了 probe 的工具」做探测，避免每轮把 200+ 工具全查一遍：
 *   process → 一次 PowerShell 批量取进程名（比逐个 tasklist 快一个量级）
 *   port    → TCP 连接 127.0.0.1:port（800 ms 超时）
 *   http    → GET 期望 2xx/3xx（1.5 s 超时）
 */
import net from "node:net";
import { execFile } from "node:child_process";
import type { ProbeSpec, Tool, ToolStatus } from "./types";

function probePort(port: number, timeout = 800): Promise<boolean> {
  return new Promise((resolve) => {
    const sock = new net.Socket();
    let settled = false;
    const done = (v: boolean) => {
      if (settled) return;
      settled = true;
      sock.destroy();
      resolve(v);
    };
    sock.setTimeout(timeout);
    sock.once("connect", () => done(true));
    sock.once("timeout", () => done(false));
    sock.once("error", () => done(false));
    sock.connect(port, "127.0.0.1");
  });
}

async function probeHttp(url: string, timeout = 1500): Promise<boolean> {
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeout);
    const res = await fetch(url, { signal: ctrl.signal });
    clearTimeout(timer);
    return res.status < 400;
  } catch {
    return false;
  }
}

/** 批量查询进程是否存在，返回小写进程名集合 */
function listProcesses(names: string[]): Promise<Set<string>> {
  return new Promise((resolve) => {
    const bare = names.map((n) => n.replace(/\.exe$/i, ""));
    const quoted = bare.map((n) => `'${n.replace(/'/g, "''")}'`).join(",");
    const ps = `$names = @(${quoted}); Get-Process -ErrorAction SilentlyContinue | Where-Object { $names -contains $_.ProcessName } | Select-Object -ExpandProperty ProcessName -Unique`;
    execFile(
      "powershell.exe",
      ["-NoProfile", "-NonInteractive", "-Command", ps],
      { timeout: 8000, windowsHide: true },
      (_err, stdout) => {
        const set = new Set<string>();
        for (const line of String(stdout || "").split(/\r?\n/)) {
          const t = line.trim();
          if (t) set.add(t.toLowerCase());
        }
        resolve(set);
      },
    );
  });
}

async function statusFor(
  t: Tool,
  spec: ProbeSpec,
  running: Set<string>,
): Promise<ToolStatus> {
  const checkedAt = Date.now();
  if (spec.type === "process") {
    const key = spec.name.replace(/\.exe$/i, "").toLowerCase();
    const isUp = running.has(key);
    return {
      id: t.id,
      state: isUp ? "running" : "stopped",
      detail: isUp ? `${spec.name} 正在运行` : `${spec.name} 未运行`,
      checkedAt,
    };
  }
  if (spec.type === "port") {
    const up = await probePort(spec.port);
    return {
      id: t.id,
      state: up ? "running" : "stopped",
      detail: up ? `端口 ${spec.port} 在监听` : `端口 ${spec.port} 无响应`,
      checkedAt,
    };
  }
  const up = await probeHttp(spec.url);
  return {
    id: t.id,
    state: up ? "running" : "stopped",
    detail: up ? `${spec.url} 可访问` : `${spec.url} 不可访问`,
    checkedAt,
  };
}

export async function probeTools(tools: Tool[]): Promise<ToolStatus[]> {
  // 单次遍历：挑出配了 probe 的工具，同时收集要批量查询的进程名
  const probed: { tool: Tool; spec: ProbeSpec }[] = [];
  const procNames: string[] = [];
  for (const t of tools) {
    const spec = t.probe;
    if (!spec) continue;
    probed.push({ tool: t, spec });
    if (spec.type === "process") procNames.push(spec.name);
  }
  if (!probed.length) return [];

  const running = procNames.length
    ? await listProcesses(procNames)
    : new Set<string>();
  return Promise.all(probed.map((p) => statusFor(p.tool, p.spec, running)));
}
