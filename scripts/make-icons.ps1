# make-icons.ps1 — 生成应用图标（assets\icon.png 256×256 / assets\tray.png 32×32）
# 设计：深色圆角底板 + 2×2 彩色磁贴（对应仪表盘的分类卡片）
# 注意：本文件必须以「UTF-8 带 BOM」保存 —— PowerShell 5.1 读无 BOM 的 UTF-8 会按 ANSI 解码导致中文注释乱码。
Add-Type -AssemblyName System.Drawing
$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $PSScriptRoot
$assets = Join-Path $root 'assets'
New-Item -ItemType Directory -Force -Path $assets | Out-Null

function New-RoundedPath([System.Drawing.RectangleF]$r, [float]$radius) {
  $p = New-Object System.Drawing.Drawing2D.GraphicsPath
  $d = $radius * 2
  $p.AddArc($r.X, $r.Y, $d, $d, 180, 90)
  $p.AddArc($r.Right - $d, $r.Y, $d, $d, 270, 90)
  $p.AddArc($r.Right - $d, $r.Bottom - $d, $d, $d, 0, 90)
  $p.AddArc($r.X, $r.Bottom - $d, $d, $d, 90, 90)
  $p.CloseFigure()
  return $p
}

function New-ToolboxIcon([int]$size, [string]$outPath) {
  $bmp = New-Object System.Drawing.Bitmap $size, $size
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $g.Clear([System.Drawing.Color]::Transparent)

  $s = [float]$size / 256.0

  # 底板
  $bgRect = New-Object System.Drawing.RectangleF (6 * $s), (6 * $s), (244 * $s), (244 * $s)
  $bgPath = New-RoundedPath $bgRect (52 * $s)
  $bgBrush = New-Object System.Drawing.Drawing2D.LinearGradientBrush(
    $bgRect,
    [System.Drawing.Color]::FromArgb(255, 41, 50, 68),
    [System.Drawing.Color]::FromArgb(255, 17, 20, 28),
    [System.Drawing.Drawing2D.LinearGradientMode]::Vertical)
  $g.FillPath($bgBrush, $bgPath)
  $borderPen = New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb(255, 70, 86, 116)), (3 * $s)
  $g.DrawPath($borderPen, $bgPath)

  # 2×2 磁贴（配色取自仪表盘分类）
  $tile = 74 * $s
  $gap = 18 * $s
  $originX = (128 * $s) - $tile - ($gap / 2)
  $originY = (128 * $s) - $tile - ($gap / 2)
  $colors = @(
    @(92, 156, 255),   # 蓝 — 开发
    @(46, 204, 113),   # 绿 — 效率
    @(242, 153, 74),   # 橙 — 系统
    @(155, 123, 255)   # 紫 — 文档
  )
  for ($i = 0; $i -lt 4; $i++) {
    $col = $i % 2
    $row = [math]::Floor($i / 2)
    $x = $originX + $col * ($tile + $gap)
    $y = $originY + $row * ($tile + $gap)
    $r = New-Object System.Drawing.RectangleF $x, $y, $tile, $tile
    $path = New-RoundedPath $r (20 * $s)
    $c = $colors[$i]
    $brush = New-Object System.Drawing.Drawing2D.LinearGradientBrush(
      $r,
      [System.Drawing.Color]::FromArgb(255, $c[0], $c[1], $c[2]),
      [System.Drawing.Color]::FromArgb(255, [int]($c[0] * 0.72), [int]($c[1] * 0.72), [int]($c[2] * 0.72)),
      [System.Drawing.Drawing2D.LinearGradientMode]::Vertical)
    $g.FillPath($brush, $path)
  }

  $bmp.Save($outPath, [System.Drawing.Imaging.ImageFormat]::Png)
  $g.Dispose()
  $bmp.Dispose()
  Write-Host "wrote $outPath"
}

New-ToolboxIcon 256 (Join-Path $assets 'icon.png')
New-ToolboxIcon 32 (Join-Path $assets 'tray.png')
