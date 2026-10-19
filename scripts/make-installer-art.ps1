# 生成安装向导视觉素材（仿 WorkBuddy 风格：纯色蓝侧栏 + 居中白色 logo + 产品名）
# 产物：build/installerSidebar.bmp (164x314, 24bpp) / build/installerHeader.bmp (150x57, 24bpp)
$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Drawing

$root = Split-Path -Parent $PSScriptRoot
$srcPng = Join-Path $root "build\source-icon.png"
$outDir = Join-Path $root "build"

if (-not (Test-Path $srcPng)) { throw "缺少图标源文件: $srcPng" }

# 品牌色：与应用深色主题一致
$brand = [System.Drawing.Color]::FromArgb(255, 86, 134, 254)   # #5686FE

function New-WhiteImageAttributes([double]$opacity) {
    $cm = New-Object System.Drawing.Imaging.ColorMatrix
    $cm.Matrix00 = -1; $cm.Matrix11 = -1; $cm.Matrix22 = -1  # 反色（黑 logo → 白）
    $cm.Matrix33 = [float]$opacity
    $cm.Matrix40 = 1; $cm.Matrix41 = 1; $cm.Matrix42 = 1
    $cm.Matrix44 = 1
    $ia = New-Object System.Drawing.Imaging.ImageAttributes
    $ia.SetColorMatrix($cm)
    return $ia
}

$icon = [System.Drawing.Bitmap]::FromFile($srcPng)

# ───────────────── 侧栏 164x314 ─────────────────
$side = New-Object System.Drawing.Bitmap 164, 314
$g = [System.Drawing.Graphics]::FromImage($side)
$g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
$g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit
$g.Clear($brand)

# 主 logo：反白 76px，顶部居中
$g.DrawImage($icon, (New-Object System.Drawing.Rectangle 44, 52, 76, 76), 0, 0, $icon.Width, $icon.Height,
    [System.Drawing.GraphicsUnit]::Pixel, (New-WhiteImageAttributes 1.0))

# 底部大 logo 水印（18% 不透明度，下缘裁切）
$g.DrawImage($icon, (New-Object System.Drawing.Rectangle 18, 192, 128, 128), 0, 0, $icon.Width, $icon.Height,
    [System.Drawing.GraphicsUnit]::Pixel, (New-WhiteImageAttributes 0.18))

# 产品名：自动缩放到 144px 宽度以内
$fontSize = 14.0
$titleFont = $null
do {
    if ($titleFont) { $titleFont.Dispose() }
    $titleFont = New-Object System.Drawing.Font('Segoe UI', $fontSize, [System.Drawing.FontStyle]::Bold)
    $measured = $g.MeasureString('DeepSeek Harness', $titleFont)
    if ($measured.Width -le 144) { break }
    $fontSize -= 0.5
} while ($fontSize -ge 9)

$fmt = New-Object System.Drawing.StringFormat
$fmt.Alignment = [System.Drawing.StringAlignment]::Center
$fmt.LineAlignment = [System.Drawing.StringAlignment]::Center
$white = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::White)
$g.DrawString('DeepSeek Harness', $titleFont, $white, (New-Object System.Drawing.RectangleF 4, 140, 156, 30), $fmt)

$subFont = New-Object System.Drawing.Font('Microsoft YaHei', 9)
$dim = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(215, 255, 255, 255))
$g.DrawString('AI 助手 · 桌面应用', $subFont, $dim, (New-Object System.Drawing.RectangleF 4, 170, 156, 20), $fmt)

$side24 = New-Object System.Drawing.Bitmap 164, 314, ([System.Drawing.Imaging.PixelFormat]::Format24bppRgb)
$g24 = [System.Drawing.Graphics]::FromImage($side24)
$g24.DrawImage($side, 0, 0)
$side24.Save((Join-Path $outDir "installerSidebar.bmp"), [System.Drawing.Imaging.ImageFormat]::Bmp)
$g.Dispose(); $g24.Dispose(); $side.Dispose(); $side24.Dispose()
Write-Output "installerSidebar.bmp 已生成 (164x314)"

# ───────────────── 头部 150x57 ─────────────────
$head = New-Object System.Drawing.Bitmap 150, 57, ([System.Drawing.Imaging.PixelFormat]::Format24bppRgb)
$h = [System.Drawing.Graphics]::FromImage($head)
$h.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$h.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
$h.Clear([System.Drawing.Color]::White)
# 左侧小 logo（原始黑 logo 在白色背景上）
$h.DrawImage($icon, (New-Object System.Drawing.Rectangle 16, 14, 28, 28), 0, 0, $icon.Width, $icon.Height,
    [System.Drawing.GraphicsUnit]::Pixel)
# 底部品牌蓝细线
$brandBrush = New-Object System.Drawing.SolidBrush $brand
$h.FillRectangle($brandBrush, 0, 55, 150, 2)
$head.Save((Join-Path $outDir "installerHeader.bmp"), [System.Drawing.Imaging.ImageFormat]::Bmp)
$h.Dispose(); $head.Dispose(); $icon.Dispose()
Write-Output "installerHeader.bmp 已生成 (150x57)"
