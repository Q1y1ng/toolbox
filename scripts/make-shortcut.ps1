# make-shortcut.ps1 — 在桌面创建 Toolbox 快捷方式
#
# 用法：powershell -NoProfile -ExecutionPolicy Bypass -File scripts/make-shortcut.ps1
# 说明：指向 dist-electron\Toolbox.exe（构建配置里已固定产物名，不带版本号，
#       因此升级重建后快捷方式依然有效）；图标用 assets\icon.ico。
#
# 注意：本文件必须以「UTF-8 带 BOM」保存（PowerShell 5.1 读无 BOM 的 UTF-8 会按 ANSI 解码，
# 中文注释乱码后可能破坏解析）。
$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $PSScriptRoot
$exe = Join-Path $root 'dist-electron\Toolbox.exe'
$ico = Join-Path $root 'assets\icon.ico'
$desktop = [Environment]::GetFolderPath('Desktop')
$lnkPath = Join-Path $desktop 'Toolbox 工具仪表盘.lnk'

if (-not (Test-Path -LiteralPath $exe)) {
  throw "未找到便携版：$exe —— 请先执行 npm run dist"
}
if (-not (Test-Path -LiteralPath $ico)) {
  throw "未找到图标：$ico —— 请先执行 scripts\make-icons.ps1 并复制 .ico"
}

$sh = New-Object -ComObject WScript.Shell
$lnk = $sh.CreateShortcut($lnkPath)
$lnk.TargetPath = $exe
$lnk.WorkingDirectory = $root
$lnk.IconLocation = "$ico,0"
$lnk.Description = 'Toolbox · 本机工具仪表盘（便携版）'
$lnk.Save()

Write-Host "已创建快捷方式：$lnkPath"
Write-Host "  目标：$exe"
Write-Host "  图标：$ico"
