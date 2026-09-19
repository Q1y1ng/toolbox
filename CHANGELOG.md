# Changelog

本文件格式参考 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)。

## [未发布]

### 新增

- **每个条目都有简介**：
  - 开始菜单条目：新增 `data/startmenu-blurbs.json`（三级匹配：名称精确 → 目标路径正则 → 分类兜底），
    把原先 166 条「简介就是文件路径」的卡片全部换成一句人话（如
    `7-Zip File Manager => 7-Zip 文件管理器（压缩/解压）`、`Epson Scan 2 => Epson 扫描驱动主程序`）。
  - 修掉一个真 bug：路径规则原先同时匹配 `target + lnk`，而**所有开始菜单 lnk 的路径都含
    `...\Microsoft\Windows\Start Menu\...`** → 「Windows 系统工具」规则误命中（如 7-Zip）。
    改为**只匹配 target**（target 为空才退回 lnk）；影响面已量化（10 条命中，其中 8 条是失效项不走简介）。
- **「我的项目」分类**：`E:\AI` 下的 10 个项目各一张卡（一句简介 + `📂 打开目录`）：
  Toolbox 自身 / launch-center / pi-standalone-gui / AI Chat / token-monitor /
  Starstate / exam-pilot / RandomDrawer / _inventory / 便携工具集目录。
- 卡片主按钮文案随类型变：目录 → `📂 打开目录`、命令行 → `▶ 开终端`、网页 → `▶ 打开`。
- 新增「开始菜单」：`npm run pin:start`（`scripts/pin-start.ps1`）写入
  `%APPDATA%\Microsoft\Windows\Start Menu\Programs\Toolbox 工具仪表盘.lnk`，
  之后 `Win` 键搜 `toolbox` 即可启动；并会枚举 shell 动词尝试“固定到开始屏幕”——
  实测该动词存在但程序化调用被系统拒（`0x80070005 E_ACCESSDENIED`），已优雅处理并给出手动两步路径。
- 收录 `marktext-0.19.1-bak`（Mark Text 备份版）。**取证时发现目录名与内容不符**：
  目录名叫 `-0.19.1-bak`，实际装的是 **0.20.0-rc.4**，而 `marktext\` 里才是 0.19.1——
  已把这个事实写进卡片描述，避免以后被名字误导。
- 项目骨架：TypeScript + Electron 43，`tsc` 编译到 `dist/`，渲染层为无构建的原生 JS。
- **扫描器**（`src/main/scanner.ts`）：便携工具目录（BFS 深度 2、跳过 junction）+ 开始菜单
  lnk 解析（`WScript.Shell` COM），噪声过滤（卸载程序 / 帮助文档 / 更新器 / 示例），
  目标存在性检测（失效入口）。同时提供 `npm run scan` 命令行入口。
- **档案合并**（`src/main/registry.ts`）：curated 权威清单 + 开始菜单扫描 + 便携目录自动发现
  三源合并，按目标路径 / 名称去重（curated 优先），开始菜单条目按关键词自动归类到 9 个分类，
  未被登记的便携目录进入「待确认收录」。
- **启动执行器**（`src/main/launcher.ts`）：`gui` / `lnk` / `script` / `cli` / `web` / `folder`
  六类入口分别走对应通路；CLI 工具会新开 PowerShell 并把工具目录临时前置到 PATH；
  支持 `admin` 提权启动（UAC）；提供「复制命令」文本。
- **状态探测**（`src/main/probe.ts`）：`process` / `port` / `http` 三种探针，进程探测合并为
  单次 PowerShell 批量查询，15 s 轮询并通过 IPC 推送。
- **图标缓存**：`app.getFileIcon()` 提取 exe / lnk 图标，按 id + mtime 缓存 PNG 到 `data/icons/`。
- **仪表盘界面**（`src/renderer/`）：分类导航 + 收藏 / 最近使用 / 失效入口 / 待确认收录四个视图、
  来源筛选、即时搜索（`Ctrl+F` / `Esc` / 回车启动首个结果）、卡片操作（启动 / 目录 / 复制命令 / 收藏）、
  运行状态绿点、失效卡片置灰、右键管理员启动。
- **托盘**：显示仪表盘 / 重新扫描 / 打开数据目录 / 退出。
- **原子 JSON 写入**（`src/main/jsonfile.ts`）：临时文件 + rename，避免崩溃留下半截 JSON。
- 应用图标生成脚本（`scripts/make-icons.ps1`，纯 System.Drawing）与界面截图自检（`scripts/shot.cjs`）。
- 启动器契约自检（`scripts/verify-launcher.cjs`，6 项：四类复制命令 + 死路径返回 + spawn 通路）。
- **移除不需要 / 失效的条目**（三种力度）：
  - 卡片 `✕` 隐藏（不删文件，可在新增的「已隐藏」视图恢复）；
  - 「失效入口」视图顶部 `全部隐藏（N 条）`、「已隐藏」视图顶部 `全部恢复`；
  - 失效的**开始菜单快捷方式**可 `🧹` 删除 → 走 `shell.trashItem` 进回收站（可还原）；
    便携工具只能隐藏，永远不删；后端只对 `source=startmenu` 且 `*.lnk` 的条目开放此操作。
- `.cmd/.bat/.ps1/.html/.msc` 这类只有 Windows 通用空白图标的目标不再提图标，
  改显示**首字母头像**（分类配色）——之前的空白图看着就像“图标没显示”。
- `TOOLBOX_SHOT_JS` 探针：启动时在页面里跑一段 JS 并把返回值写成 JSON，
  用于回归时直接量 DOM（卡片数 / 名字 / 图标加载 / 滚动容量 / 隐藏流程），
  不必再靠肉眼看截图。

### 修复

- `folder` 类条目（项目卡）的打开目标错误：原先走 `toolDir()` 会打开**父目录**，
  现在 `path` 本身是目录时直接开它（`launchTool` 与 `openDir` 两处都修了）。
- **所有卡片名字为空**：早前一次改写 meta 渲染时，`oldText` 含了
  `node.querySelector(".name").textContent = t.name` 而 `newText` 漏写，等于手滑删掉了
  赋名行（现在补回，并用 DOM 探针断言 `emptyNames === 0`）。
- **鼠标滚轮无法滚动**：`html,body{overflow:hidden}` + 网格项默认 `min-height:auto`，
  导致 `.grid` 从不产生滚动条；给 `#app/.main/.grid/.sidebar` 补 `min-height:0` 修复。
  实测：常用软件视图 `scrollHeight 1683 > clientHeight 777`，`canScroll=true`。
- 开始菜单快捷方式中文名乱码：PowerShell 5.1 重定向 stdout 时按 OEM 代码页输出，
  在 PS 脚本首行强制 `[Console]::OutputEncoding = UTF8` 解决；该问题同时导致「卸载」类
  噪声过滤失效，一并修复。
- 图标生成脚本在 PS 5.1 下报 `TypeNotFound`：`.ps1` 存为 UTF-8 带 BOM（无 BOM 时按 ANSI 解码，
  中文注释乱码会破坏解析）。
- 「待确认收录」误报 `go` / `obs` / `rust`：这些工具的 exe 位于子目录
  （`go\bin`、`obs\bin\64bit`、`rust\cargo\bin`），原先按目录字面相等比较导致漏判；
  改为判断「便携目录是否为某条 curated 路径的祖先」。
- `node_modules/electron` 是目录而非可执行文件：改用普通 Node 下 `require('electron')`
  返回的 exe 路径。
- **打包版首次运行显示 0 个工具**：`Registry` 在模块加载期构造（那时 `curated-tools.json`
  还没从 asar 播种到数据目录），播种后没有重新加载——现在播种后显式 `registry.load()`。
- **便携版数据目录会丢在临时目录**：便携 exe 运行时 `app.getPath('exe')` 指向解压副本，
  改为优先使用 electron-builder 注入的 `PORTABLE_EXECUTABLE_DIR`，数据落在 exe 同级
  `Toolbox-data\`。

### 变更

- 首次运行（数据目录无 `scan-raw.json`）会自动扫描一次，开箱即用，不再只剩 curated 清单。
- 打包：`npm run dist` → `dist-electron/Toolbox.exe`（便携单文件，≈89 MB，已实测运行）；
  新增根目录 `启动Toolbox.cmd`（优先便携版，回退开发态）。
- **产物名固定为 `Toolbox.exe`**（去掉版本号），使桌面快捷方式与启动器不会随版本升级失效。
- **种子清单升级策略**：`seed-record.json` 记录播种时的内容哈希 —— 本地副本未被改动
  则跟随新版覆盖；用户自己改过则永久保留（已用三个场景实测验证：全新播种 59 条 /
  未改过→跟随新版 / 改过→保留用户版本）。
- 开始菜单的同名去重只对「目标仍存在」的条目生效：失效的同名快捷方式不再被
  置删，避免“失效入口”清单漏报（Steam 指向 `D:\pro\steam.exe` 的陈旧项现在能看到了）。
- 新增 8 个带状态探测的常驻应用条目（Clash Verge / Docker Desktop / Steam / 微信 / QQ /
  ToDesk / 网易云音乐 / launch-center 的 LC.exe），并给 KeePassXC / OBS 补上探测；
  带探测工具由 4 个增加到 **14 个**。
- 新增 `scripts/make-shortcut.ps1`（`npm run shortcut`）：在**真实桌面**
  （`[Environment]::GetFolderPath('Desktop')`，本机被 OneDrive 重定向）创建快捷方式。
- 代码风格由 pi-lens/biome 统一（双引号 + 多行属性展开），纯格式化、行为不变
  （重排后 `tsc --noEmit` 通过、启动器自检 6/6）。
