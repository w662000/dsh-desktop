// E2E：验证已配置 API Key 时跳过引导直接启动
// 用法: node scripts/e2e-skip.mjs <electronExe> <appDir|-> <dshHome> [port]
import { spawn } from "node:child_process";
import { readFileSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";

const [, , electronExe, appDir, dshHome, port = "9334"] = process.argv;
if (!electronExe || !dshHome) {
  console.error("用法: node e2e-skip.mjs <electronExe> <appDir|-> <dshHome> [port]");
  process.exit(2);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
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

// 预置凭据文件
mkdirSync(dshHome, { recursive: true });
const credFile = path.join(dshHome, ".credentials.yaml");
writeFileSync(credFile, '# 预先配置\nDEEPSEEK_API_KEY: "sk-preset-abcdef"\n', "utf8");

const logFile = path.join(process.env.APPDATA, "deepseek-harness-desktop", "logs", "server.log");
rmSync(logFile, { force: true });

const args = appDir && appDir !== "-" ? [appDir, `--remote-debugging-port=${port}`] : [`--remote-debugging-port=${port}`];
const child = spawn(electronExe, args, {
  cwd: appDir && appDir !== "-" ? appDir : undefined,
  env: { ...process.env, DSH_HOME: dshHome, DEEPSEEK_API_KEY: "" },
  stdio: "ignore",
  windowsHide: true,
});

let result = "FAIL";
try {
  // 1. 日志应出现"检测到 API Key，直接启动"
  const directLine = await waitFor(async () => {
    try {
      const line = readFileSync(logFile, "utf8").split("\n").find((l) => l.includes("检测到 API Key"));
      return line || null;
    } catch { return null; }
  }, 20000);
  console.log(`1. 跳过引导: ${directLine ? "✓ " + directLine.trim() : "✗"}`);
  if (!directLine) throw new Error("未检测到 Key / 未直接启动");

  // 2. 服务启动
  const bootLine = await waitFor(async () => {
    try {
      const line = readFileSync(logFile, "utf8").split("\n").find((l) => l.includes("resolved URL:"));
      return line || null;
    } catch { return null; }
  }, 90000);
  console.log(`2. 服务启动: ${bootLine ? "✓ " + bootLine.trim() : "✗"}`);
  if (!bootLine) throw new Error("服务未启动");

  // 3. 引导页不应出现
  let wizardSeen = false;
  try {
    const res = await fetch(`http://127.0.0.1:${port}/json`);
    const list = await res.json();
    wizardSeen = list.some((t) => t.type === "page" && (t.url || "").includes("%E9%85%8D%E7%BD%AE"));
  } catch { /* 端口可能未开调试 */ }
  console.log(`3. 未出现引导页: ${wizardSeen ? "✗" : "✓"}`);
  if (wizardSeen) throw new Error("已配置 Key 却显示了引导页");

  result = "PASS";
} catch (err) {
  console.error("E2E FAIL:", err.message);
} finally {
  spawn("taskkill", ["/PID", String(child.pid), "/T", "/F"], { windowsHide: true, stdio: "ignore" });
}
console.log("E2E RESULT:", result);
process.exitCode = result === "PASS" ? 0 : 1;
