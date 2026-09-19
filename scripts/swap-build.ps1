# swap-build.ps1 — 把旁路构建的新版便携 exe 就位到 dist-electron\Toolbox.exe
#
# 为什么需要它：正在运行的 Toolbox 实例（便携启动器会一直持有 exe 句柄）
# 会让 electron-builder 卡在 "output file is locked for writing"。
# 所以构建可以先落到 dist-electron-next\，等实例关闭后再就位。
#
# 用法：
#   powershell -NoProfile -ExecutionPolicy Bypass -File scripts/swap-build.ps1
#   powershell -NoProfile -ExecutionPolicy Bypass -File scripts/swap-build.ps1 -Force   # 先关掉在跑的实例
#
# 注意：本文件必须以「UTF-8 带 BOM」保存。
#
# 另注：param() 必须是脚本里第一条语句（前面只能有注释），否则 PowerShell 直接报解析失败。
param(
  [switch]$Force
)

$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $PSScriptRoot
$next = Join-Path $root 'dist-electron-next\Toolbox.exe'
$live = Join-Path $root 'dist-electron\Toolbox.exe'

if (-not (Test-Path -LiteralPath $next)) {
  throw "没找到旁路构建：$next —— 请先执行 npm run dist:next"
}

# 找出正在运行的实例（含从 dist-electron 启动的便携启动器）
$running = Get-CimInstance Win32_Process -Filter "Name = 'Toolbox.exe'" -ErrorAction SilentlyContinue
if ($running) {
  if (-not $Force) {
    Write-Host "检测到 $($running.Count) 个 Toolbox.exe 正在运行："
    $running | ForEach-Object { Write-Host ("  PID {0}  {1}" -f $_.ProcessId, $_.ExecutablePath) }
    Write-Host "`n请先关闭它们再运行本脚本；或加 -Force 让脚本强制关闭。"
    exit 1
  }
  Write-Host "强制关闭 $($running.Count) 个实例…"
  $running | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
  Start-Sleep -Seconds 3
}

Copy-Item -LiteralPath $next -Destination $live -Force
$src = (Get-Item -LiteralPath $next).LastWriteTime
$dst = (Get-Item -LiteralPath $live).LastWriteTime
Write-Host "已就位：$live"
Write-Host "  源文件时间：$src"
Write-Host "  目标文件时间：$dst"
Write-Host "`n完成，可从开始菜单/桌面快捷方式启动新版。"
