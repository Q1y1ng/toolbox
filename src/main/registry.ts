/**
 * registry.ts — 工具档案合并
 *
 * 数据流：
 *   data/curated-tools.json（手工权威）  ─┐
 *   data/scan-raw.json（扫描产物）        ─┼─► Tool[] + Payload
 *   data/state.json（收藏/隐藏/最近）     ─┘
 *
 * 原则：curated 优先；同路径/同名去重；扫描项一律带 source 标记，可整体隐藏。
 */
import fs from "node:fs";
import path from "node:path";
import { readJson, writeJsonAtomic } from "./jsonfile";
import type { ScanResult } from "./scanner";
import type {
  CategoryMeta,
  Payload,
  Tool,
  ToolCategory,
  ToolboxState,
} from "./types";

export const CATEGORIES: CategoryMeta[] = [
  { id: "project", label: "我的项目", icon: "🧩", color: "#56CCF2" },
  { id: "dev", label: "开发工具", icon: "⌨", color: "#4C8DFF" },
  { id: "system", label: "系统运维", icon: "🧰", color: "#F2994A" },
  { id: "doc", label: "文档排版", icon: "📄", color: "#9B7BFF" },
  { id: "media", label: "网络媒体", icon: "🎬", color: "#EB5757" },
  { id: "utility", label: "效率安全", icon: "⚡", color: "#27AE60" },
  { id: "script", label: "自建脚本", icon: "🧪", color: "#2D9CDB" },
  { id: "app", label: "常用软件", icon: "📦", color: "#6C7A89" },
  { id: "game", label: "游戏娱乐", icon: "🎮", color: "#BB6BD9" },
  { id: "other", label: "其他", icon: "•", color: "#828282" },
];

const CATEGORY_IDS = new Set(CATEGORIES.map((c) => c.id));

/** 开始菜单自动归类规则（按顺序匹配，首个命中生效） */
const CATEGORY_RULES: { re: RegExp; cat: ToolCategory }[] = [
  {
    re: /\b(steam|epic|ea app|rockstar|paradox|faceit|plain craft|spt\.|star ?map|mumu|perfectworld|5e对战|三角洲|鹰角|launcher|game)\b/i,
    cat: "game",
  },
  {
    re: /(visual studio|pycharm|git |git$|node\.js|docker|unity|qgis|osgeo|python|anaconda|spyder|idle \(|postgres|pgadmin|psql|wsl|nsight|cuda|windows kits|developer|command prompt|powershell|performance analyzer|performance recorder|gpuview|application verifier|debuggable package|stack builder|java|jdk|flutter)/i,
    cat: "dev",
  },
  {
    re: /(7-zip|gpu-z|图吧工具箱|afterburner|riva tuner|rivatuner|nexus|sideloadly|爱思助手|todesk|lenovo|联想|legion|machenike|disk|task manager|registry|event viewer|services|compmgmt|msconfig|msinfo32|dfrgui|cleanmgr|resource monitor|performance monitor|system information|administrative tools|iscsi|hyper-v|odbc|print management|recoverydrive|security configuration|firewall|memory diagnostics|speech recognition|steps recorder|character map|remote desktop|media player|wordpad|livecaptions|magnify|narrator|on-screen keyboard|voiceaccess|app cert kit|sysinternals|everything|crystaldiskinfo|wiztree|ventoy|rufus|memclean)/i,
    cat: "system",
  },
  {
    re: /(photoshop|lightroom|premiere|acrobat|audition|after effects|illustrator|黑magic|blackmagic|epson|musescore|obs|剪映|网易云音乐|listen1|potplayer|foobar|vlc|音频|音乐|视频|相机)/i,
    cat: "media",
  },
  {
    re: /(微信|qq|oopz|迅雷|网盘|123|夸克|百度|to ?desk|clash|加速器|输入法|邮箱|电脑管家|koook|kook|钉钉|飞书|telegram|discord)/i,
    cat: "utility",
  },
];

function categorize(
  name: string,
  target: string | undefined,
  fallback: ToolCategory = "app",
): ToolCategory {
  const hay = `${name} ${target || ""}`;
  for (const r of CATEGORY_RULES) if (r.re.test(hay)) return r.cat;
  return fallback;
}

function readJsonOrNull<T>(file: string): T | null {
  return readJson<T>(file, null);
}

/** 由名称生成稳定 id（无外部依赖，同一名称必得同一 id） */
function stableId(prefix: string, name: string): string {
  let h = 5381;
  for (let i = 0; i < name.length; i++)
    h = ((h << 5) + h + name.charCodeAt(i)) | 0;
  return `${prefix}-${(h >>> 0).toString(36)}`;
}

const DEFAULT_STATE: ToolboxState = {
  favorites: [],
  hidden: [],
  recent: [],
  categoryOverrides: {},
};

/** 开始菜单条目的简介库（data/startmenu-blurbs.json） */
interface BlurbRules {
  byName?: Record<string, string>;
  byPath?: { re: string; desc: string }[];
  byCategory?: Record<string, string>;
}

export class Registry {
  private tools: Tool[] = [];
  private state: ToolboxState = { ...DEFAULT_STATE };
  private lastScan: string | null = null;
  private uncoveredDirs: string[] = [];
  private blurbs: { byName: Record<string, string>; byPath: { re: RegExp; desc: string }[]; byCategory: Record<string, string> } = {
    byName: {},
    byPath: [],
    byCategory: {},
  };

  constructor(private dataDir: string) {
    this.loadBlurbs();
    this.load();
  }

  /** 载入开始菜单简介库（缺失时不影响主流程） */
  private loadBlurbs() {
    const raw = readJsonOrNull<BlurbRules>(this.p("startmenu-blurbs.json"));
    if (!raw) return;
    this.blurbs = {
      byName: raw.byName || {},
      byPath: (raw.byPath || []).map((r) => ({ re: new RegExp(r.re), desc: r.desc })),
      byCategory: raw.byCategory || {},
    };
  }

  /**
   * 给开始菜单条目补一句人话简介：
   *   名称精确匹配 → 目标路径正则（自上而下首个命中）→ 分类兑底 → 最后退回文件名
   */
  private blurbFor(
    name: string,
    target: string | undefined,
    lnk: string,
  ): string {
    const byName = this.blurbs.byName[name];
    if (byName) return byName;
    // 只拿 target 去匹配路径规则：
    // 开始菜单的 lnk 自身路径都含 `...\Microsoft\Windows\Start Menu\...`，
    // 把 lnk 一起丢进去会让「Windows 系统工具」这类规则误命中（如 7-Zip）。
    // 只有 target 为空时才退回用 lnk。
    const hay = (target || "").trim() || lnk || "";
    for (const r of this.blurbs.byPath) {
      if (r.re.test(hay)) return r.desc;
    }
    const cat = categorize(name, target);
    const byCat = this.blurbs.byCategory[cat];
    if (byCat) return byCat;
    return `开始菜单入口：${path.basename(target || lnk)}`;
  }

  private p(...s: string[]) {
    return path.join(this.dataDir, ...s);
  }

  getState(): ToolboxState {
    return this.state;
  }

  getTools(): Tool[] {
    return this.tools;
  }

  find(id: string): Tool | undefined {
    return this.tools.find((t) => t.id === id);
  }

  /** 收藏 / 隐藏 / 最近使用 落盘 */
  persistState() {
    writeJsonAtomic(this.p("state.json"), this.state);
  }

  markRecent(id: string) {
    const rest = this.state.recent.filter((r) => r.id !== id);
    this.state.recent = [{ id, at: Date.now() }, ...rest].slice(0, 40);
    this.persistState();
  }

  toggleFavorite(id: string): boolean {
    const i = this.state.favorites.indexOf(id);
    if (i >= 0) this.state.favorites.splice(i, 1);
    else this.state.favorites.push(id);
    this.persistState();
    return i < 0;
  }

  setHidden(id: string, hidden: boolean) {
    const i = this.state.hidden.indexOf(id);
    if (hidden && i < 0) this.state.hidden.push(id);
    if (!hidden && i >= 0) this.state.hidden.splice(i, 1);
    this.persistState();
  }

  setCategory(id: string, cat: ToolCategory) {
    this.state.categoryOverrides[id] = cat;
    this.persistState();
    this.load();
  }

  /** 重新加载全部数据源（curated → 开始菜单 → 未收录便携目录） */
  load() {
    const curated = readJsonOrNull<{ tools: Tool[] }>(
      this.p("curated-tools.json"),
    );
    const scan = readJsonOrNull<ScanResult>(this.p("scan-raw.json"));
    const st = readJsonOrNull<ToolboxState>(this.p("state.json"));
    if (st) this.state = { ...DEFAULT_STATE, ...st };

    const tools = this.fromCurated(curated?.tools || []);
    const seen = {
      paths: new Set(tools.map((t) => t.path.toLowerCase())),
      names: new Set(tools.map((t) => t.name.toLowerCase())),
      targets: new Set(tools.map((t) => (t.target || t.path).toLowerCase())),
    };
    tools.push(...this.fromStartMenu(scan, seen));
    tools.push(...this.fromPortable(scan, tools));

    tools.sort((a, b) => a.name.localeCompare(b.name, "zh-Hans-CN"));
    this.tools = tools;
  }

  private cat(id: string, fallback: ToolCategory): ToolCategory {
    return this.state.categoryOverrides[id] || fallback;
  }

  /** 1) curated 权威清单：路径实测 + 分类可被用户覆盖 */
  private fromCurated(list: Tool[]): Tool[] {
    return list.map((t) => ({
      ...t,
      category: this.cat(t.id, t.category),
      dir: t.dir || path.dirname(t.path),
      source: "curated" as const,
      exists: fs.existsSync(t.path),
    }));
  }

  /** 2) 开始菜单扫描：跳过与 curated 同目标 / 同名的条目 */
  private fromStartMenu(
    scan: ScanResult | null,
    seen: { paths: Set<string>; names: Set<string>; targets: Set<string> },
  ): Tool[] {
    this.lastScan = scan?.scannedAt || null;
    const out: Tool[] = [];
    for (const s of scan?.startMenu?.kept || []) {
      const tgt = (s.target || "").toLowerCase();
      if (!tgt || seen.targets.has(tgt) || seen.paths.has(tgt)) continue;
      const exists = s.targetExists ?? fs.existsSync(s.target);
      // 同名去重只对「还活着的」条目生效：
      // 失效的同名快捷方式要保留下来（否则“失效入口”清单会漏报，看不到陈旧快捷方式）。
      if (exists && seen.names.has(s.name.toLowerCase())) continue;
      const id = stableId("sm", s.name);
      out.push({
        id,
        name: s.name,
        category: this.cat(id, categorize(s.name, s.target)),
        kind: "lnk",
        path: s.lnk,
        target: s.target,
        desc: exists
          ? this.blurbFor(s.name, s.target, s.lnk)
          : "⚠ 目标路径不存在（快捷方式已失效）",
        tags: [],
        source: "startmenu",
        exists,
        dir: path.dirname(exists ? s.target : s.lnk),
      });
    }
    return out;
  }

  /** 3) 未被 curated 覆盖的便携目录（待确认收录） */
  private fromPortable(scan: ScanResult | null, curatedTools: Tool[]): Tool[] {
    // curated 工具的 exe 常在子目录（如 go\bin\go.exe、obs\bin\64bit\obs64.exe），
    // 所以要看「便携目录是否为某个 curated 路径的祖先」而不是比目录字面相等。
    const curatedPaths = curatedTools.map((t) =>
      (t.dir || t.path).toLowerCase(),
    );
    const isCovered = (portableDir: string) => {
      const d = portableDir.toLowerCase().replace(/[\\/]+$/, "");
      return curatedPaths.some(
        (p) => p === d || p.startsWith(`${d}\\`) || p.startsWith(`${d}/`),
      );
    };
    const out: Tool[] = [];
    const uncovered: string[] = [];
    for (const d of scan?.portable?.tools || []) {
      if (isCovered(d.dir)) continue;
      const exe = d.executables.find((e) =>
        e.path.toLowerCase().endsWith(".exe"),
      );
      if (!exe) continue; // logs / _rebuild 这类无 exe 目录不进列表
      uncovered.push(d.folder);
      const id = `pf-${d.folder}`;
      out.push({
        id,
        name: d.folder,
        category: this.cat(id, categorize(d.folder, exe.path, "other")),
        kind: "gui",
        path: exe.path,
        desc: `便携目录自动发现：${exe.name}`,
        tags: ["待确认"],
        source: "portable",
        exists: true,
        dir: d.dir,
      });
    }
    this.uncoveredDirs = uncovered;
    return out;
  }

  payload(): Payload {
    return {
      tools: this.tools,
      categories: CATEGORIES,
      state: this.state,
      stats: {
        total: this.tools.length,
        dead: this.tools.filter((t) => !t.exists).length,
        curated: this.tools.filter((t) => t.source === "curated").length,
        startmenu: this.tools.filter((t) => t.source === "startmenu").length,
        lastScan: this.lastScan,
        uncoveredDirs: this.uncoveredDirs,
      },
    };
  }

  isValidCategory(c: string): c is ToolCategory {
    return CATEGORY_IDS.has(c as ToolCategory);
  }
}
