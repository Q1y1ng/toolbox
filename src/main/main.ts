/**
 * main.ts — Electron 主进程
 *
 * 职责：窗口 / 托盘 / IPC 契约 / 图标缓存 / 状态探测轮询 / 重新扫描
 *
 * 数据目录（绿色便携原则，绝不往 C: 写）：
 *   开发态   E:\AI\toolbox\data
 *   打包态   <exe 同级>\Toolbox-data   （首次运行从 asar 内的 data/ 播种 curated-tools.json）
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import {
  app,
  BrowserWindow,
  Menu,
  Tray,
  ipcMain,
  nativeImage,
  shell,
} from "electron";
import { Registry } from "./registry";
import { runScan } from "./scanner";
import { probeTools } from "./probe";
import { copyCommand, launchTool, openDir } from "./launcher";
import { readJson, writeJsonAtomic } from "./jsonfile";
import type { LaunchResult, ToolCategory, ToolStatus } from "./types";

const IS_DEV = !app.isPackaged;
const ROOT = path.join(__dirname, "..", "..");
const TOOLS_DIR = "E:\\AI\\tools";

/** 可写数据目录（开发态在仓库里，打包态在 exe 同级） */
function resolveDataDir(): string {
  if (IS_DEV) return path.join(ROOT, "data");
  // 便携版会被解压到临时目录运行，app.getPath('exe') 指向临时副本，
  // 所以必须优先用 electron-builder 注入的 PORTABLE_EXECUTABLE_DIR（原始 exe 所在目录），
  // 否则每次运行的状态/图标缓存都会丢在 temp 里。
  const portableDir = (process.env.PORTABLE_EXECUTABLE_DIR || "").trim();
  const base = portableDir || path.dirname(app.getPath("exe"));
  return path.join(base, "Toolbox-data");
}

/** 随包分发的只读种子目录（asar 内） */
function resolveSeedDir(): string {
  if (IS_DEV) return path.join(ROOT, "data");
  const candidates = [
    path.join(process.resourcesPath, "app.asar", "data"),
    path.join(process.resourcesPath, "app", "data"),
  ];
  return candidates.find((c) => fs.existsSync(c)) ?? candidates[0];
}

const DATA_DIR = resolveDataDir();
const SEED_DIR = resolveSeedDir();

/** 需要从 asar 播种到可写数据目录的文件（新增随包数据文件时加到这里） */
const SEED_FILES = ["curated-tools.json", "startmenu-blurbs.json"];

interface SeedRecord {
  /** 旧格式（单文件时代）：仅 curated；继续兼容以免老安装失去“未改过”判定 */
  curatedSha256?: string;
  /** 新格式：文件名 → 播种时的内容哈希 */
  files?: Record<string, string>;
}

/**
 * 播种 + 升级同步：
 *   首次运行 → 从 asar 拷进数据目录
 *   升级时   → 只有本地副本「自上回播种以来没被改过」才跟随新版
 *              （用户自己编辑过就永远保留用户版本）
 */
function seedDataDir() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const recordFile = path.join(DATA_DIR, "seed-record.json");
  const record = readJson<SeedRecord>(recordFile, null) ?? {};

  const files: Record<string, string> = { ...(record.files ?? {}) };
  if (record.curatedSha256 && !files["curated-tools.json"]) {
    files["curated-tools.json"] = record.curatedSha256; // 旧记录迁移
  }

  for (const name of SEED_FILES) {
    const src = path.join(SEED_DIR, name);
    const dst = path.join(DATA_DIR, name);
    if (!fs.existsSync(src)) continue;

    const bundledText = fs.readFileSync(src, "utf8");
    const bundledHash = sha256(bundledText);

    if (!fs.existsSync(dst)) {
      fs.copyFileSync(src, dst);
      files[name] = bundledHash;
      continue;
    }

    const localHash = sha256(fs.readFileSync(dst, "utf8"));
    const seededHash = files[name] ?? "";
    if (seededHash !== "" && seededHash === localHash && bundledHash !== localHash) {
      fs.copyFileSync(src, dst);
      files[name] = bundledHash;
    }
  }

  writeJsonAtomic(recordFile, { files });
}

function sha256(text: string): string {
  return crypto.createHash("sha256").update(text, "utf8").digest("hex");
}

const registry = new Registry(DATA_DIR);
let win: BrowserWindow | null = null;
let tray: Tray | null = null;
let probeTimer: NodeJS.Timeout | null = null;
const statuses = new Map<string, ToolStatus>();

// ── 图标缓存 ────────────────────────────────────────────────
function iconDir() {
  return path.join(DATA_DIR, "icons");
}

/** 从 exe / lnk 提取图标并缓存为 PNG，返回 file:// URL 供渲染器直接用 */
/** Windows 里只有通用空白图标的扩展名（提出来反而像坏图） */
const GENERIC_ICON_EXT = /\.(cmd|bat|ps1|vbs|html?|msc)$/;

async function iconFor(id: string, file: string): Promise<string | null> {
  try {
    if (!fs.existsSync(file)) return null;
    // 脚本/网页/控制台件：返回 null，让界面用「首字母头像」兑底
    if (GENERIC_ICON_EXT.test(file.toLowerCase())) return null;
    const dir = iconDir();
    fs.mkdirSync(dir, { recursive: true });
    const stamp = fs.statSync(file).mtimeMs.toString(36);
    const safe = id.replace(/[^\w.-]/g, "_");
    const out = path.join(dir, `${safe}-${stamp}.png`);
    if (fs.existsSync(out)) return `file:///${out.replace(/\\/g, "/")}`;
    const img = await app.getFileIcon(file, { size: "normal" });
    if (!img || img.isEmpty()) return null;
    fs.writeFileSync(out, img.toPNG());
    return `file:///${out.replace(/\\/g, "/")}`;
  } catch {
    return null;
  }
}

// ── 探测轮询 ────────────────────────────────────────────────
async function runProbe(): Promise<ToolStatus[]> {
  const list = await probeTools(registry.getTools());
  for (const s of list) statuses.set(s.id, s);
  return list;
}

function startProbeLoop() {
  if (probeTimer) clearInterval(probeTimer);
  const tick = async () => {
    try {
      const list = await runProbe();
      win?.webContents.send("toolbox:status", list);
    } catch {
      /* 探测失败不影响主流程 */
    }
  };
  void tick();
  probeTimer = setInterval(tick, 15_000);
}

// ── 窗口 ────────────────────────────────────────────────────
function createWindow() {
  win = new BrowserWindow({
    width: 1360,
    height: 880,
    minWidth: 1024,
    minHeight: 640,
    backgroundColor: "#12141a",
    title: "Toolbox · 本机工具仪表盘",
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "..", "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      spellcheck: false,
    },
  });
  win.once("ready-to-show", () => win?.show());
  win.on("closed", () => {
    win = null;
  });
  void win.loadFile(
    path.join(__dirname, "..", "..", "src", "renderer", "index.html"),
  );
}

function showWindow() {
  if (!win) createWindow();
  win?.show();
  win?.focus();
}

function createTray() {
  const iconPath = path.join(ROOT, "assets", "tray.png");
  const img = fs.existsSync(iconPath)
    ? nativeImage.createFromPath(iconPath)
    : nativeImage.createEmpty();
  try {
    tray = new Tray(img);
  } catch {
    return; // 无托盘图标也不致命
  }
  tray.setToolTip("Toolbox · 本机工具仪表盘");
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: "显示仪表盘", click: showWindow },
      { label: "重新扫描本机工具", click: () => doRescan() },
      { type: "separator" },
      { label: "打开数据目录", click: () => void shell.openPath(DATA_DIR) },
      { label: "退出", click: () => app.quit() },
    ]),
  );
  tray.on("click", showWindow);
}

function doRescan() {
  win?.webContents.send("toolbox:rescanned", { stage: "start" });
  try {
    const r = runScan(TOOLS_DIR, path.join(DATA_DIR, "scan-raw.json"));
    registry.load();
    void runProbe().then((list) =>
      win?.webContents.send("toolbox:status", list),
    );
    win?.webContents.send("toolbox:rescanned", {
      stage: "done",
      summary: `便携 ${r.portable.tools.length} 目录 · 开始菜单 ${r.startMenu.kept.length} 条（失效 ${r.startMenu.deadCount}）· ${r.elapsedMs} ms`,
    });
  } catch (err) {
    win?.webContents.send("toolbox:rescanned", {
      stage: "error",
      summary: String((err as Error).message),
    });
  }
}

// ── IPC 契约 ───────────────────────────────────────────────
function registerIpc() {
  ipcMain.handle("toolbox:list", () => registry.payload());

  ipcMain.handle(
    "toolbox:launch",
    async (
      _e,
      id: string,
      opts: { admin?: boolean } = {},
    ): Promise<LaunchResult> => {
      const t = registry.find(id);
      if (!t) return { ok: false, message: "未找到该工具" };
      const res = await launchTool(t, opts);
      if (res.ok) {
        registry.markRecent(id);
        setTimeout(
          () =>
            void runProbe().then((l) =>
              win?.webContents.send("toolbox:status", l),
            ),
          1500,
        );
      }
      return res;
    },
  );

  ipcMain.handle("toolbox:openDir", (_e, id: string) => {
    const t = registry.find(id);
    return t ? openDir(t) : { ok: false, message: "未找到该工具" };
  });

  ipcMain.handle("toolbox:copyCommand", (_e, id: string) => {
    const t = registry.find(id);
    return t ? copyCommand(t) : { ok: false, message: "未找到该工具" };
  });

  ipcMain.handle("toolbox:favorite", (_e, id: string, next?: boolean) => {
    const cur = registry.getState().favorites.includes(id);
    const want = typeof next === "boolean" ? next : !cur;
    if (cur !== want) registry.toggleFavorite(id);
    return registry.getState();
  });

  ipcMain.handle("toolbox:hide", (_e, id: string, hidden: boolean) => {
    registry.setHidden(id, hidden);
    registry.load();
    return registry.payload();
  });

  // 批量隐藏/恢复（列表页的“全部隐藏 / 全部恢复”）
  ipcMain.handle("toolbox:hideMany", (_e, ids: string[], hidden: boolean) => {
    for (const id of ids) registry.setHidden(id, hidden);
    registry.load();
    return registry.payload();
  });

  // 把「开始菜单里已失效的快捷方式」移到回收站（可恢复，绝不硬删）。
  // 只对 source=startmenu 的 .lnk 开放：不动便携工具目录、不动 exe 目标本身。
  ipcMain.handle("toolbox:trashLnk", async (_e, id: string) => {
    const t = registry.find(id);
    if (!t) return { ok: false, message: "未找到该条目" };
    if (t.source !== "startmenu" || !t.path.toLowerCase().endsWith(".lnk")) {
      return {
        ok: false,
        message: "只能删除开始菜单快捷方式（便携工具请用隐藏）",
      };
    }
    if (!fs.existsSync(t.path)) {
      registry.setHidden(id, true);
      registry.load();
      return { ok: true, message: "快捷方式已不存在，已从列表隐藏" };
    }
    try {
      await shell.trashItem(t.path);
      registry.setHidden(id, true);
      registry.load();
      return { ok: true, message: `已把「${t.name}」的快捷方式移到回收站` };
    } catch (err) {
      return { ok: false, message: `删除失败：${(err as Error).message}` };
    }
  });

  ipcMain.handle("toolbox:setCategory", (_e, id: string, cat: string) => {
    if (!registry.isValidCategory(cat))
      return { ok: false, message: "非法分类" };
    registry.setCategory(id, cat as ToolCategory);
    return { ok: true, message: "分类已更新" };
  });

  ipcMain.handle("toolbox:rescan", () => {
    doRescan();
    return registry.payload();
  });

  ipcMain.handle("toolbox:probe", async () => runProbe());

  ipcMain.handle("toolbox:icon", async (_e, id: string) => {
    const t = registry.find(id);
    if (!t) return null;
    return iconFor(
      id,
      t.kind === "lnk" && t.target && fs.existsSync(t.target)
        ? t.target
        : t.path,
    );
  });

  ipcMain.handle("toolbox:openDataDir", () => shell.openPath(DATA_DIR));
  ipcMain.handle("toolbox:showInExplorer", (_e, p: string) =>
    shell.showItemInFolder(p.replace(/\//g, "\\")),
  );
}

// ── 生命周期 ───────────────────────────────────────────────
// 单实例锁：多开会互相覆盖 state.json（收藏/隐藏/最近使用），也会抢图标缓存。
// 第二个实例直接退出，并把已存在的窗口唤到前台。
const gotSingleInstance = app.requestSingleInstanceLock();
if (!gotSingleInstance) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (win) {
      if (win.isMinimized()) win.restore();
      win.show();
      win.focus();
    } else {
      createWindow();
    }
  });
}

app.whenReady().then(() => {
  // 先播种再加载：打包态首次运行时 curated-tools.json 是刚刚拷进 DATA_DIR 的，
  // 而 Registry 在模块加载期已经构造过一次（那时文件还不存在），必须重新 load。
  seedDataDir();
  const scanFile = path.join(DATA_DIR, "scan-raw.json");
  if (!fs.existsSync(scanFile)) {
    // 首次运行（或数据目录被清空）：自动扫一次，否则界面只剩 curated 清单
    try {
      runScan(TOOLS_DIR, scanFile);
    } catch {
      /* 扫描失败不阻塞启动，用户可手动重新扫描 */
    }
  }
  registry.load();

  createWindow();
  createTray();
  registerIpc();
  startProbeLoop();
  writeJsonAtomic(path.join(DATA_DIR, "app-state.json"), {
    lastStart: new Date().toISOString(),
  });

  // 截图自检（脚本化验证用，不影响正常启动）：TOOLBOX_SHOT=<png 输出路径>
  //   TOOLBOX_SHOT_JS=<在页面里执行的 JS> 会把返回值写成 <png>.js.json（DOM 取证用）
  const shot = process.env.TOOLBOX_SHOT;
  const shotJs = process.env.TOOLBOX_SHOT_JS;
  if (shot || shotJs) {
    const delay = Number(process.env.TOOLBOX_SHOT_DELAY || 4000);
    setTimeout(() => {
      void (async () => {
        try {
          if (shotJs && win) {
            const result: unknown = await win.webContents.executeJavaScript(
              shotJs,
              true,
            );
            writeJsonAtomic(`${shot || "data/shot.png"}.js.json`, result);
          }
          if (shot) {
            const img = await win?.webContents.capturePage();
            if (img && !img.isEmpty()) fs.writeFileSync(shot, img.toPNG());
          }
        } catch {
          /* 截图/取证失败不阻塞退出 */
        } finally {
          app.quit();
        }
      })();
    }, delay);
  }

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("will-quit", () => {
  if (probeTimer) clearInterval(probeTimer);
  registry.persistState();
});
