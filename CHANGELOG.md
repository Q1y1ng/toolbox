# Changelog

本文件格式参考 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)。

## [未发布]

### 新增

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

### 修复

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
- 打包：`npm run dist` → `dist-electron/Toolbox 0.1.0.exe`（便携单文件，≈89 MB，已实测运行）；
  新增根目录 `启动Toolbox.cmd`（优先便携版，回退开发态）。
- 代码风格由 pi-lens/biome 统一（双引号 + 多行属性展开），纯格式化、行为不变
  （重排后 `tsc --noEmit` 通过、启动器自检 6/6）。
