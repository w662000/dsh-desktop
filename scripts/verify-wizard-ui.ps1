# 验证安装/卸载向导的真实 UI：枚举向导窗口子控件文本 + 采样侧栏像素
# 注意：NSIS 卸载程序运行时会以 %TEMP%\Au_.exe 身份重执行，故按窗口标题找向导窗口。
param(
  [string]$SetupExe = "C:\Users\48843\Desktop\DSH\dsh-desktop\dist\DeepSeek-Harness-Setup-0.1.0.exe",
  [string]$Target = "C:\Users\48843\Desktop\DSH\ui-check-install"
)
$ErrorActionPreference = "Continue"

Add-Type -TypeDefinition @'
using System;
using System.Text;
using System.Runtime.InteropServices;
public class UiProbe {
  [DllImport("user32.dll")] public static extern bool EnumWindows(EnumProc cb, IntPtr lParam);
  [DllImport("user32.dll")] public static extern bool EnumChildWindows(IntPtr parent, EnumProc cb, IntPtr lParam);
  public delegate bool EnumProc(IntPtr hWnd, IntPtr lParam);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern int GetWindowText(IntPtr hWnd, StringBuilder sb, int max);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr hWnd, out RECT rect);
  [StructLayout(LayoutKind.Sequential)] public struct RECT { public int Left, Top, Right, Bottom; }
  [DllImport("user32.dll")] public static extern IntPtr GetDC(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern int ReleaseDC(IntPtr hWnd, IntPtr dc);
  [DllImport("gdi32.dll")] public static extern uint GetPixel(IntPtr dc, int x, int y);
  [DllImport("user32.dll")] public static extern bool PostMessage(IntPtr hWnd, uint msg, IntPtr wParam, IntPtr lParam);
}
'@

function Find-WizardWindow([string]$titlePattern, [int]$timeoutSec = 30) {
  $found = New-Object System.Collections.Generic.List[System.IntPtr]
  $deadline = (Get-Date).AddSeconds($timeoutSec)
  while ((Get-Date) -lt $deadline) {
    $found.Clear()
    $cb = [UiProbe+EnumProc]{
      param($h, $l)
      $sb = New-Object System.Text.StringBuilder 256
      [UiProbe]::GetWindowText($h, $sb, 256) | Out-Null
      if ([UiProbe]::IsWindowVisible($h) -and $sb.ToString() -like $titlePattern) { $found.Add($h) }
      return $true
    }
    [UiProbe]::EnumWindows($cb, [IntPtr]::Zero) | Out-Null
    if ($found.Count -gt 0) { return $found[0] }
    Start-Sleep -Milliseconds 400
  }
  return [IntPtr]::Zero
}

function Get-ChildTexts([IntPtr]$hwnd) {
  $texts = New-Object System.Collections.Generic.List[string]
  $cb = [UiProbe+EnumProc]{
    param($h, $l)
    $sb = New-Object System.Text.StringBuilder 512
    [UiProbe]::GetWindowText($h, $sb, 512) | Out-Null
    $t = $sb.ToString()
    if ($t.Length -gt 0) { $texts.Add($t) }
    return $true
  }
  [UiProbe]::EnumChildWindows($hwnd, $cb, [IntPtr]::Zero) | Out-Null
  return $texts
}

function Test-Wizard([string]$label, [string]$exe, [string]$titlePattern, [string[]]$expectTexts, [bool]$checkSidebar) {
  Write-Output "=== $label ==="
  $p = Start-Process -FilePath $exe -PassThru
  $hwnd = Find-WizardWindow $titlePattern 30
  if ($hwnd -eq [IntPtr]::Zero) {
    Write-Output "  未找到向导窗口（$titlePattern）"
    if (-not $p.HasExited) { & taskkill /PID $p.Id /T /F 2>$null | Out-Null }
    Get-Process -Name "Un_A" -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
    return
  }
  Start-Sleep -Milliseconds 600
  $texts = Get-ChildTexts $hwnd
  Write-Output ("  窗口文本: " + (($texts | Select-Object -First 8) -join " | "))
  foreach ($s in $expectTexts) {
    $hit = $texts | Where-Object { $_ -like "*$s*" }
    Write-Output ("  期望文案 [$s]: " + $(if ($hit) { "✓ 命中" } else { "✗ 未命中" }))
  }
  if ($checkSidebar) {
    $rect = New-Object UiProbe+RECT
    [UiProbe]::GetWindowRect($hwnd, [ref]$rect) | Out-Null
    $dc = [UiProbe]::GetDC([IntPtr]::Zero)
    $c1 = [UiProbe]::GetPixel($dc, $rect.Left + 30, $rect.Top + 120)
    [UiProbe]::ReleaseDC([IntPtr]::Zero, $dc) | Out-Null
    $r = $c1 -band 0xFF; $g = ($c1 -shr 8) -band 0xFF; $b = ($c1 -shr 16) -band 0xFF
    $isBlue = ([math]::Abs($r - 0x56) -lt 45 -and [math]::Abs($g - 0x86) -lt 45 -and [math]::Abs($b - 0xFE) -lt 45)
    Write-Output ("  侧栏像素(30,120) = #" + $r.ToString("X2") + $g.ToString("X2") + $b.ToString("X2") + " → " + $(if ($isBlue) { "✓ 品牌蓝" } else { "✗ 非品牌蓝" }))
  }
  [UiProbe]::PostMessage($hwnd, 0x0010, [IntPtr]::Zero, [IntPtr]::Zero) | Out-Null
  Start-Sleep -Seconds 1
  & taskkill /PID $p.Id /T /F 2>$null | Out-Null
  Get-Process -Name "Un_A" -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
}

# ── 1. 安装向导（首屏应为欢迎页，窗口标题「DeepSeek Harness 安装」）──
Test-Wizard "安装向导" $SetupExe "*DeepSeek Harness 安装*" @("欢迎使用 DeepSeek Harness", "本向导将引导您完成") $true

# ── 2. 静默安装到测试目录（为卸载向导提供卸载程序）──
Remove-Item -Recurse -Force $Target -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Force $Target | Out-Null
$p = Start-Process -FilePath $SetupExe -ArgumentList @("/S", "/D=$Target") -PassThru -Wait
Start-Sleep -Seconds 2
$uninst = Join-Path $Target "Uninstall DeepSeekHarness.exe"
if (-not (Test-Path $uninst)) { Write-Output "卸载程序不存在"; exit 1 }

# ── 3. 卸载向导（首屏应为卸载欢迎页，窗口标题「DeepSeek Harness 解除安装」）──
Test-Wizard "卸载向导" $uninst "*DeepSeek Harness 解除安装*" @("卸载 DeepSeek Harness", "本向导将从您的电脑中卸载", "卸载不会删除您的个人配置") $true

# ── 4. 清理：静默卸载 ──
$p2 = Start-Process -FilePath $uninst -ArgumentList @("/S") -PassThru -Wait
Start-Sleep -Seconds 2
Get-Process -Name "Un_A" -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
Write-Output "清理完成, 安装目录存在: $(Test-Path $Target)"
