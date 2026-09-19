/** 共享类型定义（主进程 / 预加载 / 渲染器契约） */

export type ToolKind = "cli" | "gui" | "script" | "web" | "folder" | "lnk";

export type ToolCategory =
  | "project"
  | "dev"
  | "system"
  | "doc"
  | "media"
  | "utility"
  | "script"
  | "app"
  | "game"
  | "other";

export type ProbeSpec =
  | { type: "process"; name: string }
  | { type: "port"; port: number }
  | { type: "http"; url: string };

export interface Tool {
  id: string;
  name: string;
  category: ToolCategory;
  kind: ToolKind;
  /** 启动目标：exe / bat / 目录 / html / url / lnk */
  path: string;
  /** lnk 类型时的真实目标，用于取图标与死链判定 */
  target?: string;
  args?: string[];
  version?: string;
  desc?: string;
  tags?: string[];
  probe?: ProbeSpec;
  /** curated = 手工权威清单 | startmenu = 开始菜单扫描 | portable = 便携目录扫描 */
  source: "curated" | "startmenu" | "portable";
  /** 启动路径是否存在（死链检测） */
  exists: boolean;
  /** 便携工具所在目录（打开目录 / CLI 用） */
  dir?: string;
}

export interface ToolStatus {
  id: string;
  state: "running" | "stopped" | "unknown";
  detail?: string;
  checkedAt: number;
}

export interface CategoryMeta {
  id: ToolCategory;
  label: string;
  icon: string;
  color: string;
}

export interface ToolboxState {
  favorites: string[];
  hidden: string[];
  recent: { id: string; at: number }[];
  categoryOverrides: Record<string, ToolCategory>;
}

export interface Payload {
  tools: Tool[];
  categories: CategoryMeta[];
  state: ToolboxState;
  stats: {
    total: number;
    dead: number;
    curated: number;
    startmenu: number;
    lastScan: string | null;
    uncoveredDirs: string[];
  };
}

export interface LaunchResult {
  ok: boolean;
  message: string;
}
