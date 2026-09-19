# Toolbox · 本机工具仪表盘

把散落各处的本机小工具收进一个桌面面板：**扫描 → 分类 → 搜索 → 一键启动 → 状态可见**。

针对的是这个具体处境（不是通用 App Store）：

- `E:\AI\tools` 有 **43 个绿色便携工具目录**（CLI 24 个 + GUI 十几个），加没加 PATH 各不相同，靠记；
- 开始菜单里有 **230+ 个快捷方式**，其中混着系统自带工具（`dfrgui`、`charmap`…）、打印机驱动、卸载程序；
- 桌面上的小工具没有统一入口，找谁都是"先想起来它在哪"。

## 现状（2026-09-19 实测）

| 指标 | 数值 |
| --- | --- |
| 收录工具 | **236**（curated 59 · 开始菜单 176） |
| 分类分布 | 开发 81 · 系统 64 · 常用软件 25 · 媒体 23 · 游戏 16 · 效率 15 · 文档 7 · 自建脚本 4 |
| 扫描耗时 | ≈2.2 s（43 个便携目录 + 237 个 lnk） |
| 失效入口自动识别 | **10 个**（QGIS、MuMu、Steam 过期项、PyCharm 2024.1… 目标已不存在） |
| 带状态探测 | **14 个**（Everything / QuickLook / Snipaste / Clash Verge / Docker / Steam / 微信 / QQ / ToDesk / OBS / KeePassXC / 网易云 / Mermaid Live / LC） |
| 主进程工作集 | ≈64 MB（实测，渲染进程另计） |

## 功能

- **三源合并**：`data/curated-tools.json`（手工权威清单）+ 开始菜单 lnk 扫描 + 便携目录自动发现，
  同一 exe / 同名条目自动去重，curated 优先。
- **一键启动**：按 `kind` 走不同通路 —— GUI 独立进程、lnk 走原快捷方式（保留参数与工作目录）、
  批处理开自己的控制台、**CLI 工具新开 PowerShell 并把工具目录临时前置到 PATH**、本地 html / URL 走浏览器。
- **失效入口检测**：目标不存在的快捷方式标灰 + `⚠ 路径失效`，直接列出，不再点开才发现。
- **状态徽章**：对配了 `probe` 的工具做进程 / 端口 / HTTP 探测（15 s 轮询），绿点=在跑。
- **收藏 / 最近使用 / 待确认收录**：收藏与最近使用落盘；扫描到未登记目录会自动进「待确认收录」。
- **图标自动提取**：`app.getFileIcon()` 抽 exe / lnk 图标，缓存到 `data/icons/`，失败则退化为分类色块。
- **右键 = 管理员启动**，快捷键 `Ctrl+F` 聚焦搜索、`Esc` 清空、搜索框回车启动首个结果。

## 快速开始

```bash
npm install
npm run build        # tsc → dist/
npm run scan         # 扫描本机 → data/scan-raw.json
npm start            # 启动仪表盘
```

### 日常使用

双击根目录的 **`启动Toolbox.cmd`**（优先启动已打包的便携版，没有则回退到开发态）；
或直接双击 **`dist-electron\Toolbox.exe`**，也可用桌面快捷方式（见下）。

### 桌面快捷方式

```bash
npm run dist            # 先构建便携版
npm run shortcut        # 在桌面创建「Toolbox 工具仪表盘」快捷方式
```

产物名固定为 `Toolbox.exe`（不带版本号），所以升级重建后**快捷方式不会失效**；
快捷方式图标用 `assets/icon.ico`。

> 注意：本机桌面已被 OneDrive 重定向至 `C:\Users\<用户>\OneDrive\Desktop`，
> 脚本用 `[Environment]::GetFolderPath('Desktop')` 取真实路径，不写死。

### 打包便携版（单文件 exe，零安装）

```bash
npm run dist         # → dist-electron/Toolbox.exe（≈89 MB）
```

打包版特性：

- 数据落在 **exe 同级的 `Toolbox-data\`**（`PORTABLE_EXECUTABLE_DIR`），不写 C:，删目录即彻底卸载；
- 首次运行自动播种 `curated-tools.json` 并**自动扫描一次**（约 2 秒），开箱即用；
- **升级行为**：种子清单用 `seed-record.json` 记下播种时的哈希 ——
  本地副本没被改过就跟随新版更新；**你自己改过则永远保留你的版本**；
- 之后按「重新扫描」或托盘菜单刷新即可。

其他脚本：

```bash
npm run dev              # build + 启动
npm run typecheck        # tsc --noEmit
npm run verify:launcher  # 启动器契约自检（6 项，无副作用）
npm run shot             # 界面截图自检 → data/shot.png
npm run dist             # electron-builder 打 portable exe
```

## 目录结构

```text
src/main/         主进程
  main.ts         窗口 / 托盘 / IPC 契约 / 图标缓存 / 探测轮询
  scanner.ts      扫描器：便携目录（跳 junction）+ 开始菜单 lnk（UTF-8 修正）
  registry.ts     三源合并、去重、自动分类、状态持久化
  launcher.ts     六类入口的启动执行器
  probe.ts        进程 / 端口 / HTTP 探测
  jsonfile.ts     原子 JSON 读写（临时文件 + rename）
  types.ts        主进程 ↔ 渲染器契约
src/preload.ts    contextBridge 最小暴露面
src/renderer/     纯原生 JS 界面（无框架、无构建）
data/
  curated-tools.json   手工权威清单（进 git）
  scan-raw.json        扫描产物（不进 git，可重建）
  state.json           收藏 / 最近使用（不进 git）
scripts/
  scan.cjs / verify-launcher.cjs / shot.cjs / make-icons.ps1
```

## 数据模型

`curated-tools.json` 每条工具：

```jsonc
{
  "id": "ripgrep",
  "name": "ripgrep (rg)",
  "category": "dev",              // dev|system|doc|media|utility|script|app|game|other
  "kind": "cli",                  // cli|gui|script|web|folder|lnk
  "path": "E:\\AI\\tools\\ripgrep\\rg.exe",
  "version": "15.2.0",
  "desc": "极速全文搜索（比 grep 快一个量级）",
  "tags": ["搜索"],
  "probe": { "type": "process", "name": "everything.exe" }   // 可选，决定卡片绿点
}
```

`probe` 三选一：`{type:"process",name}` / `{type:"port",port}` / `{type:"http",url}`。

**新增一个工具** = 往 `curated-tools.json` 加一条 + `npm run scan`，或直接在界面「重新扫描」；
扫描到但没登记的目录会出现在「待确认收录」，确认后写进 curated 即转正。

## 设计取舍

- **不碰本地大模型**：llama-server 的模型槽位、参数档案、显存预算归 `E:\AI\launch-center`（LC）管，
  本项目只做"工具入口"。两者边界清晰，互不重叠。
- **扫描器在主进程内**（`scanner.ts`），不 shell out 到系统 Node —— 打包后的 exe 不依赖用户装 Node。
- **原子写**：`state.json` / `scan-raw.json` 一律临时文件 + rename，崩溃时不会留半截 JSON。
- **只读扫描**：绝不删除 / 移动 / 重命名任何文件；扫描时跳过 junction 与符号链接（E 盘事故的教训）。

## 已知坑（踩过的）

1. **PowerShell 5.1 输出编码**：stdout 被重定向时按 OEM 代码页（cp936）输出，
   直接 `utf8` 解码会导致中文快捷方式名全变乱码（且让“卸载”类噪音过滤失效）。
   解决：在 PS 脚本首行 `[Console]::OutputEncoding = [System.Text.Encoding]::UTF8`。
2. **PowerShell 脚本文件编码**：`.ps1` 若为无 BOM 的 UTF-8，PS 5.1 按 ANSI 解码，
   中文注释乱码后甚至会破坏脚本解析（报 `TypeNotFound`）。
   解决：`make-icons.ps1` 存为 **UTF-8 带 BOM**。
3. **`.cmd` 内容保持纯 ASCII**：cmd.exe 按 OEM 代码页读 `.cmd`，UTF-8 中文注释会乱码；
   启动器注释因此写英文。
4. **`node_modules/electron` 是目录**：当可执行文件路径用会失败；
   在普通 Node 里 `require('electron')` 才返回真正的 exe 路径。
5. **agent shell 导出了 `ELECTRON_RUN_AS_NODE=1`**：启动 Electron 前必须 `env -u`，
   否则以纯 Node 模式静默退出（`scripts/shot.cjs` 里已处理）。
6. **electron-builder 偶发 `EPERM rename win-unpacked`**：句柄被占（杀毒/索引器），
   **直接重试即可成功**。
7. **git push 卡在 `github.com:443` 时先查代理**：本机跑的是 Clash for Windows，
   监听 `127.0.0.1:7890`，但 **git 不会自动用 Windows 系统代理**，而直连 443 是被墙的。
   判断：`Test-NetConnection github.com -Port 443` 为 False、而 `127.0.0.1:7890` 在 LISTEN。
   推法：`git -c http.proxy=http://127.0.0.1:7890 -c https.proxy=http://127.0.0.1:7890 push origin main`。
   （注意：`api.github.com` 一直接得通，所以 `gh api` 能用来核对远端到底推到哪了 —— 不要只看 push 回显。）

## 性能

- 扫描 234 个入口 ≈ 2.2 s，其中 90% 是 `WScript.Shell` 解析 237 个 lnk。
- 探测只对配了 `probe` 的工具做，且进程探测合并为一次 PowerShell 调用。
