# pin-start.ps1 — 把 Toolbox 放进开始菜单，并尝试"固定到开始屏幕"
#
# 背景（重要，先说清楚能做到什么）：
#   * 「所有应用」列表：只要把 .lnk 放进开始菜单程序目录就会自动出现（受支持，稳）。
#   * 「固定到开始屏幕」（钉成磁贴）：微软自 Win10 起不提供公开 API，
#     只能靠 shell 动词（右键菜单项）。本脚本会**枚举并打印**当前系统实际暴露的动词，
#     然后尝试调用含「固定到 / Pin to Start」的那个，并回报结果（可能被系统忽略）。
#
# 用法：powershell -NoProfile -ExecutionPolicy Bypass -File scripts/pin-start.ps1
#
# 注意：本文件必须以「UTF-8 带 BOM」保存（PS 5.1 读无 BOM 的 UTF-8 会按 ANSI 解码）。
$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $PSScriptRoot
$exe = Join-Path $root 'dist-electron\Toolbox.exe'
$ico = Join-Path $root 'assets\icon.ico'
$name = 'Toolbox 工具仪表盘'

if (-not (Test-Path -LiteralPath $exe)) {
  throw "未找到便携版：$exe —— 请先执行 npm run dist"
}

# ── 1) 放进开始菜单「所有应用」 ──────────────────────────────
$programs = Join-Path $env:APPDATA 'Microsoft\Windows\Start Menu\Programs'
$lnkPath = Join-Path $programs "$name.lnk"

$sh = New-Object -ComObject WScript.Shell
$lnk = $sh.CreateShortcut($lnkPath)
$lnk.TargetPath = $exe
$lnk.WorkingDirectory = $root
if (Test-Path -LiteralPath $ico) { $lnk.IconLocation = "$ico,0" }
$lnk.Description = 'Toolbox · 本机工具仪表盘（便携版）'
$lnk.Save()
Write-Host "[1/2] 已写入开始菜单：$lnkPath"

# ── 2) 探测并尝试「固定到开始屏幕」动词 ──────────────────────
# 注意：NameSpace/ParseName/Verbs 属于 Shell.Application，不是 WScript.Shell
$shellApp = New-Object -ComObject Shell.Application
$folder = $shellApp.NameSpace((Split-Path $lnkPath -Parent))
$item = $folder.ParseName((Split-Path $lnkPath -Leaf))
if (-not $item) { throw "无法解析快捷方式项：$lnkPath" }

$verbs = @()
foreach ($v in $item.Verbs()) {
  $n = ($v.Name -replace '&', '').Trim()
  if ($n) { $verbs += $n }
}
Write-Host "[2/2] 该 .lnk 当前暴露的动词：$($verbs -join ' | ')"

$pinVerb = $verbs | Where-Object { $_ -match '固定到|Pin to Start|Pin to' } | Select-Object -First 1
if (-not $pinVerb) {
  Write-Host "→ 系统未向脚本暴露「固定到开始屏幕」动词（微软的已知限制）。"
  Write-Host "   手动两步即可：按 Win 键 → 输入 toolbox → 右键结果 → 固定到“开始”屏幕"
  exit 0
}

foreach ($v in $item.Verbs()) {
  $n = ($v.Name -replace '&', '').Trim()
  if ($n -eq $pinVerb) {
    Write-Host "→ 尝试调用动词：$n"
    try {
      $v.DoIt()
      Start-Sleep -Seconds 3
    } catch {
      # 已知结果：微软禁止程序化固定（动词在菜单里，但自动化调用被拒）
      Write-Host "→ 被系统拒绝：$($_.Exception.Message)"
      Write-Host "   这是微软的有意设计（固定与否由用户决定，不开放给脚本）。"
      Write-Host "   手动两步即可：按 Win 键 → 输入 toolbox → 右键结果 → 固定到“开始”屏幕"
      exit 0
    }
    break
  }
}

# 复核：再枚举一次动词，看固定类动词是否已从菜单消失（消失通常表示已生效）
$after = @()
foreach ($v in $item.Verbs()) {
  $n = ($v.Name -replace '&', '').Trim()
  if ($n) { $after += $n }
}
$stillThere = $after | Where-Object { $_ -match '固定到|Pin to Start' }
if ($stillThere) {
  Write-Host "→ 动词仍在（'$stillThere'）—— 调用很可能被系统忽略，需要手动固定一次。"
} else {
  Write-Host "→ 固定类动词已消失，通常表示已固定成功（请看一眼开始菜单确认）。"
}
