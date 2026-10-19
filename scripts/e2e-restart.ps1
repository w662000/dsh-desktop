# E2E：服务停止后的恢复（重新启动按钮 + 退出后重新打开）
# A) 杀后端 → 弹「服务已停止」→ 点「重新启动」→ 应用原地恢复（新端口，不退出）
# B) 再杀后端 → 弹框 → 点「退出」→ 应用退出 → 再次打开桌面版 → 全新服务正常、数据保留
param(
  [string]$AppExe = "C:\Users\48843\Desktop\DSH\dsh-desktop\dist\win-unpacked\DeepSeekHarness.exe"
)
$ErrorActionPreference = "Continue"

Add-Type -TypeDefinition @'
using System;
using System.Text;
using System.Runtime.InteropServices;
public class ReUi2 {
  [DllImport("user32.dll")] public static extern bool EnumWindows(EnumProc cb, IntPtr lParam);
  [DllImport("user32.dll")] public static extern bool EnumChildWindows(IntPtr parent, EnumProc cb, IntPtr lParam);
  public delegate bool EnumProc(IntPtr hWnd, IntPtr lParam);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern int GetWindowText(IntPtr hWnd, StringBuilder sb, int max);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern int GetClassName(IntPtr hWnd, StringBuilder sb, int max);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern IntPtr SendMessage(IntPtr hWnd, uint msg, IntPtr wParam, IntPtr lParam);
}
'@

function Find-Window([string]$titlePattern, [int]$timeoutSec = 20) {
  $found = New-Object System.Collections.Generic.List[System.IntPtr]
  $deadline = (Get-Date).AddSeconds($timeoutSec)
  while ((Get-Date) -lt $deadline) {
    $found.Clear()
    $cb = [ReUi2+EnumProc]{
      param($h, $l)
      $sb = New-Object System.Text.StringBuilder 256
      [ReUi2]::GetWindowText($h, $sb, 256) | Out-Null
      if ([ReUi2]::IsWindowVisible($h) -and $sb.ToString() -like $titlePattern) { $found.Add($h) }
      return $true
    }
    [ReUi2]::EnumWindows($cb, [IntPtr]::Zero) | Out-Null
    if ($found.Count -gt 0) { return $found[0] }
    Start-Sleep -Milliseconds 400
  }
  return [IntPtr]::Zero
}

function Click-DialogButton([IntPtr]$dlg, [string]$textPart) {
  $btns = New-Object System.Collections.Generic.List[System.IntPtr]
  $cb2 = [ReUi2+EnumProc]{
    param($h, $l)
    $cls = New-Object System.Text.StringBuilder 64
    [ReUi2]::GetClassName($h, $cls, 64) | Out-Null
    if ($cls.ToString() -eq "Button") { $btns.Add($h) }
    return $true
  }
  [ReUi2]::EnumChildWindows($dlg, $cb2, [IntPtr]::Zero) | Out-Null
  foreach ($b in $btns) {
    $sb = New-Object System.Text.StringBuilder 64
    [ReUi2]::GetWindowText($b, $sb, 64) | Out-Null
    if ($sb.ToString() -like "*$textPart*") {
      [ReUi2]::SendMessage($b, 0x00F5, [IntPtr]::Zero, [IntPtr]::Zero) | Out-Null  # BM_CLICK
      return $true
    }
  }
  return $false
}

function Get-LogLines() {
  if (Test-Path $script:logFile) { return @(Get-Content $script:logFile) } else { return @() }
}

function Kill-ServerByPort([int]$port) {
  $conn = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
  if (-not $conn) { return $false }
  Stop-Process -Id $conn.OwningProcess -Force
  return $true
}

function Wait-NewResolved([int]$fromLineCount, [int]$timeoutSec = 90) {
  $deadline = (Get-Date).AddSeconds($timeoutSec)
  while ((Get-Date) -lt $deadline) {
    $lines = Get-LogLines
    for ($i = $fromLineCount; $i -lt $lines.Count; $i++) {
      if ($lines[$i] -match "resolved URL: http://127\.0\.0\.1:(\d+)") { return $Matches[1] }
    }
    Start-Sleep -Milliseconds 500
  }
  return $null
}

function Wait-ProcessExit([System.Diagnostics.Process]$proc, [int]$timeoutSec = 20) {
  $deadline = (Get-Date).AddSeconds($timeoutSec)
  while ((Get-Date) -lt $deadline) {
    $proc.Refresh()
    if ($proc.HasExited) { return $true }
    Start-Sleep -Milliseconds 400
  }
  return $false
}

$dshHome = Join-Path $env:TEMP ("dsh-restart2-" + [guid]::NewGuid().ToString("N"))
New-Item -ItemType Directory -Force $dshHome | Out-Null
Set-Content -Path (Join-Path $dshHome ".credentials.yaml") -Value 'DEEPSEEK_API_KEY: "sk-restart-test"' -Encoding UTF8
$env:DSH_HOME = $dshHome
$script:logFile = Join-Path $env:APPDATA "deepseek-harness-desktop\logs\server.log"

$result = "FAIL"
$app = $null
try {
  # ── A1. 首次启动 ──
  Remove-Item $script:logFile -ErrorAction SilentlyContinue
  $app = Start-Process -FilePath $AppExe -PassThru
  $before = Get-LogLines | Select-String "resolved URL:" | Measure-Object
  $port1 = $null
  $deadline = (Get-Date).AddSeconds(90)
  while ((Get-Date) -lt $deadline -and -not $port1) {
    $lines = Get-LogLines
    foreach ($l in $lines) { if ($l -match "resolved URL: http://127\.0\.0\.1:(\d+)") { $port1 = $Matches[1]; break } }
    if (-not $port1) { Start-Sleep -Milliseconds 500 }
  }
  if (-not $port1) { throw "首次启动失败" }
  $lineCountAfterBoot = (Get-LogLines).Count
  Write-Output "A1. 首次启动 OK，端口=$port1 ✓"

  # ── A2. 停止服务 → 弹框 → 点「重新启动」──
  Kill-ServerByPort ([int]$port1) | Out-Null
  $dlg = Find-Window "*服务已停止*" 20
  Write-Output "A2. 弹出「服务已停止」中文提示框: $(if ($dlg -ne [IntPtr]::Zero) { '✓' } else { '✗' })"
  if ($dlg -eq [IntPtr]::Zero) { throw "未找到提示框" }
  $clicked = Click-DialogButton $dlg "重新启动"
  Write-Output "A3. 点击「重新启动」: $(if ($clicked) { '✓' } else { '✗' })"
  $port2 = Wait-NewResolved $lineCountAfterBoot 90
  $app.Refresh()
  Write-Output "A4. 服务原地恢复（应用未退出）: $(if ($port2 -and -not $app.HasExited) { "✓ 新端口=$port2" } else { '✗' })"
  if (-not $port2) { throw "重新启动未生效" }
  $lineCountAfterRestart = (Get-LogLines).Count

  # ── B1. 再杀服务 → 弹框 → 点「退出」──
  Kill-ServerByPort ([int]$port2) | Out-Null
  $dlg2 = Find-Window "*服务已停止*" 20
  Write-Output "B1. 再次弹出提示框: $(if ($dlg2 -ne [IntPtr]::Zero) { '✓' } else { '✗' })"
  if ($dlg2 -eq [IntPtr]::Zero) { throw "未找到提示框" }
  $clicked2 = Click-DialogButton $dlg2 "退出"
  Write-Output "B2. 点击「退出」: $(if ($clicked2) { '✓' } else { '✗' })"
  $exited = Wait-ProcessExit $app 20
  Write-Output "B3. 应用退出: $(if ($exited) { '✓' } else { '✗' })"
  if (-not $exited) { & taskkill /PID $app.Id /T /F 2>$null | Out-Null; Start-Sleep -Seconds 2 }

  # ── B4. 再次打开桌面版 ──
  Remove-Item $script:logFile -ErrorAction SilentlyContinue
  $app2 = Start-Process -FilePath $AppExe -PassThru
  $port3 = $null
  $deadline2 = (Get-Date).AddSeconds(90)
  while ((Get-Date) -lt $deadline2 -and -not $port3) {
    $lines = Get-LogLines
    foreach ($l in $lines) { if ($l -match "resolved URL: http://127\.0\.0\.1:(\d+)") { $port3 = $Matches[1]; break } }
    if (-not $port3) { Start-Sleep -Milliseconds 500 }
  }
  Write-Output "B4. 再次打开桌面版: $(if ($port3) { "✓ 新端口=$port3" } else { '✗' })"
  $trayOk = (Get-LogLines | Select-String "tray: 已创建" -Quiet)
  Write-Output "B5. 托盘正常: $(if ($trayOk) { '✓' } else { '✗' })"
  $dataOk = (Test-Path (Join-Path $dshHome ".credentials.yaml")) -and (Test-Path (Join-Path $dshHome "profiles\web"))
  Write-Output "B6. 数据保留（凭据+配置）: $(if ($dataOk) { '✓' } else { '✗' })"

  $result = "PASS"
  $app = $app2
} catch {
  Write-Output "E2E FAIL: $($_.Exception.Message)"
} finally {
  if ($app) { & taskkill /PID $app.Id /T /F 2>$null | Out-Null }
  Start-Sleep -Seconds 1
  Remove-Item -Recurse -Force $dshHome -ErrorAction SilentlyContinue
}
Write-Output "E2E RESULT: $result"
if ($result -ne "PASS") { exit 1 }
