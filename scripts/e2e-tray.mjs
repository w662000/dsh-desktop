// E2E：托盘驻留行为（用原生 WM_CLOSE 精确模拟点击右上角关闭按钮）
// 1. 启动（已预置 Key，跳过引导）→ 服务就绪、托盘创建
// 2. 向主窗口发送 WM_CLOSE（与点击 X 完全相同的路径）
// 3. 验证：应用进程存活、DSH 服务未退出、窗口只是隐藏（页面目标仍在）、单实例锁有效
// 用法: node scripts/e2e-tray.mjs <exe> <dshHome> [port]
import { spawn } from "node:child_process";
import { readFileSync, rmSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import path from "node:path";
import os from "node:os";

const [, , exe, dshHome, port = "9340"] = process.argv;
if (!exe || !dshHome) {
  console.error("用法: node e2e-tray.mjs <exe> <dshHome> [port]");
  process.exit(2);
}

mkdirSync(dshHome, { recursive: true });
writeFileSync(path.join(dshHome, ".credentials.yaml"), 'DEEPSEEK_API_KEY: "sk-tray-test"\n', "utf8");

const logFile = path.join(process.env.APPDATA, "deepseek-harness-desktop", "logs", "server.log");
rmSync(logFile, { force: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const withTimeout = (p, ms, label) =>
  Promise.race([p, sleep(ms).then(() => { throw new Error(`${label} 超时 (${ms}ms)`); })]);
async function waitFor(fn, timeoutMs, intervalMs = 500) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const v = await fn();
      if (v) return v;
    } catch { /* retry */ }
    await sleep(intervalMs);
  }
  return null;
}

const child = spawn(exe, [`--remote-debugging-port=${port}`], {
  env: { ...process.env, DSH_HOME: dshHome, DEEPSEEK_API_KEY: "" },
  stdio: "ignore",
  // 注意：不能用 windowsHide:true —— Chromium 会沿用 STARTUPINFO 的 SW_HIDE，
  // 导致首窗口以隐藏状态创建，测试时 MainWindowHandle 取不到。
});

// WM_CLOSE 助手：向目标进程的主窗口发送 WM_CLOSE（等同点击 X）
const wmCloseHelper = path.join(os.tmpdir(), `wmclose-${child.pid}.ps1`);
const wmCloseOut = path.join(os.tmpdir(), `wmclose-${child.pid}.txt`);
writeFileSync(
  wmCloseHelper,
  `param([int]$TargetPid, [string]$OutFile)
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public class WmClose {
  [DllImport("user32.dll")] public static extern bool PostMessage(IntPtr hWnd, uint msg, IntPtr wParam, IntPtr lParam);
}
'@
$proc = Get-Process -Id $TargetPid -ErrorAction SilentlyContinue
if ($null -eq $proc) { Set-Content -Path $OutFile -Value "NOPROC"; exit }
$diag = @()
foreach ($q in (Get-Process DeepSeekHarness -ErrorAction SilentlyContinue)) {
  $diag += ("pid=" + $q.Id + " hwnd=" + $q.MainWindowHandle + " title=" + $q.MainWindowTitle)
}
$h = $proc.MainWindowHandle
if ($h -eq [IntPtr]::Zero) { Set-Content -Path $OutFile -Value ("NOTFOUND|" + ($diag -join "; ")); exit }
[WmClose]::PostMessage($h, 0x0010, [IntPtr]::Zero, [IntPtr]::Zero) | Out-Null
Set-Content -Path $OutFile -Value ("SENT:" + $h)
`,
  "utf8"
);

function sendWmClose() {
  return new Promise((resolve) => {
    const p = spawn(
      "powershell.exe",
      ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", wmCloseHelper, "-TargetPid", String(child.pid), "-OutFile", wmCloseOut],
      { stdio: "ignore", windowsHide: true }
    );
    p.on("exit", () => resolve());
  });
}

let result = "FAIL";
const watchdog = setTimeout(() => {
  console.error("E2E 全局超时 (150s)");
  try { spawn("taskkill", ["/PID", String(child.pid), "/T", "/F"], { windowsHide: true, stdio: "ignore" }); } catch { /* ignore */ }
  process.exit(2);
}, 150000);
try {
  // 1. 服务启动
  const bootLine = await waitFor(async () => {
    try {
      const t = readFileSync(logFile, "utf8");
      return t.split("\n").find((l) => l.includes("resolved URL:")) || null;
    } catch { return null; }
  }, 90000);
  console.log("1. 服务启动:", bootLine ? "✓" : "✗");
  if (!bootLine) throw new Error("服务未启动");

  // 2. 托盘创建
  const trayOk = await waitFor(async () => {
    try { return readFileSync(logFile, "utf8").includes("tray: 已创建"); } catch { return false; }
  }, 10000);
  console.log("2. 托盘已创建:", trayOk ? "✓" : "✗");
  if (!trayOk) throw new Error("托盘未创建");

  // 关闭前的页面目标（用于对比关闭后目标是否仍存在）
  const pageTargets = async () => {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/json`, { signal: AbortSignal.timeout(3000) });
      const list = await res.json();
      return list.filter((t) => t.type === "page" && (t.url || "").startsWith("http://127.0.0.1"));
    } catch { return []; }
  };
  const before = await waitFor(async () => ((await pageTargets()).length > 0 ? true : null), 15000);
  console.log("3. 关闭前页面目标存在:", before ? "✓" : "✗");
  if (!before) throw new Error("关闭前未找到页面目标");

  // 3b. 发送 WM_CLOSE（等同点击右上角 X）
  rmSync(wmCloseOut, { force: true });
  await sendWmClose();
  const wmResult = await waitFor(async () => {
    try { return existsSync(wmCloseOut) ? readFileSync(wmCloseOut, "utf8") : null; } catch { return null; }
  }, 10000);
  console.log(`4. WM_CLOSE 发送: ${wmResult && wmResult.startsWith("SENT") ? "✓ " + wmResult : "✗ " + wmResult}`);
  if (!wmResult || !wmResult.startsWith("SENT")) throw new Error("未找到应用窗口");

  await sleep(2500);

  // 5. 应用仍存活、服务未退出
  console.log(`5. 关闭后应用进程仍存活: ${child.exitCode === null ? "✓" : "✗ (exit=" + child.exitCode + ")"}`);
  const logAfter = readFileSync(logFile, "utf8");
  const serverAlive = !/server exited code=0/.test(logAfter);
  console.log(`6. DSH 服务仍在后台运行: ${serverAlive ? "✓" : "✗"}`);

  // 7. 窗口只是隐藏（页面目标仍在），未销毁
  const afterTargets = await pageTargets();
  console.log(`7. 关闭后窗口未销毁（页面目标仍在）: ${afterTargets.length > 0 ? "✓" : "✗"}`);
  if (afterTargets.length === 0) throw new Error("窗口被销毁而非隐藏");

  // 8. 隐藏后渲染进程仍响应
  let evalOk = false;
  try {
    const ws2 = new WebSocket(afterTargets[0].webSocketDebuggerUrl);
    await withTimeout(
      new Promise((res, rej) => { ws2.onopen = res; ws2.onerror = () => rej(new Error("ws2 连接失败")); }),
      10000,
      "ws2 连接"
    );
    const r = await withTimeout(
      new Promise((resolve, reject) => {
        const onMsg = (ev) => {
          const d = JSON.parse(ev.data);
          if (d.id === 999) {
            ws2.removeEventListener("message", onMsg);
            d.error ? reject(new Error(JSON.stringify(d.error))) : resolve(d.result);
          }
        };
        ws2.addEventListener("message", onMsg);
        ws2.send(JSON.stringify({ id: 999, method: "Runtime.evaluate", params: { expression: "1+1", returnByValue: true } }));
      }),
      10000,
      "evaluate"
    );
    evalOk = r && r.result && r.result.value === 2;
    try { ws2.close(); } catch { /* ignore */ }
  } catch { evalOk = false; }
  console.log(`8. 隐藏后渲染进程仍响应: ${evalOk ? "✓" : "✗"}`);

  // 9. 二次启动 → 单实例锁，应自动退出（并唤醒已有实例）
  const second = spawn(exe, [], {
    env: { ...process.env, DSH_HOME: dshHome, DEEPSEEK_API_KEY: "" },
    stdio: "ignore",
    windowsHide: true,
  });
  const secondExited = await waitFor(() => (second.exitCode !== null ? true : null), 12000);
  console.log(`9. 二次启动实例自动退出（单实例锁）: ${secondExited ? "✓" : "✗"}`);
  if (second.exitCode === null) {
    spawn("taskkill", ["/PID", String(second.pid), "/T", "/F"], { windowsHide: true, stdio: "ignore" });
  }

  result = child.exitCode === null && serverAlive && afterTargets.length > 0 && evalOk ? "PASS" : "FAIL";
} catch (err) {
  console.error("E2E FAIL:", err.message);
} finally {
  clearTimeout(watchdog);
  spawn("taskkill", ["/PID", String(child.pid), "/T", "/F"], { windowsHide: true, stdio: "ignore" });
  try { rmSync(wmCloseHelper, { force: true }); rmSync(wmCloseOut, { force: true }); } catch { /* ignore */ }
}
console.log("E2E RESULT:", result);
process.exitCode = result === "PASS" ? 0 : 1;
