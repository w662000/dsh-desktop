// E2E：驱动首次引导流程（通过 Chrome DevTools 协议操控页面）
// 用法: node scripts/e2e-wizard.mjs <electronExe> <appDir> <dshHome> [port]
// appDir 省略则按已打包应用处理（直接运行 exe，不传应用目录参数）。
import { spawn } from "node:child_process";
import { readFileSync, rmSync, existsSync } from "node:fs";
import path from "node:path";

const [, , electronExe, appDir, dshHome, port = "9333"] = process.argv;
if (!electronExe || !dshHome) {
  console.error("用法: node e2e-wizard.mjs <electronExe> <appDir|-> <dshHome> [port]");
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
  // 1. 等待引导页（URL 含"配置"的编码 %E9%85%8D%E7%BD%AE）
  const wizard = await waitFor(async () => {
    const res = await fetch(`http://127.0.0.1:${port}/json`);
    const list = await res.json();
    return list.find((t) => t.type === "page" && (t.url || "").includes("%E9%85%8D%E7%BD%AE"));
  }, 30000);
  if (!wizard) throw new Error("30s 内未出现引导页（可能检测到了 Key 直接启动了）");
  console.log("1. 引导页已显示 ✓");

  // 2. 连接 CDP，调用 preload 暴露的 saveApiKey（等价于点击"保存并开始使用"）
  const ws = new WebSocket(wizard.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = () => rej(new Error("ws connect failed")); });
  let msgId = 1;
  const send = (method, params) => new Promise((resolve, reject) => {
    const id = msgId++;
    const onMsg = (ev) => {
      const data = JSON.parse(ev.data);
      if (data.id === id) {
        ws.removeEventListener("message", onMsg);
        data.error ? reject(new Error(JSON.stringify(data.error))) : resolve(data.result);
      }
    };
    ws.addEventListener("message", onMsg);
    ws.send(JSON.stringify({ id, method, params }));
  });

  const evalRes = await send("Runtime.evaluate", {
    expression: `window.desktopApi.saveApiKey("sk-e2e-test-123456")`,
    awaitPromise: true,
    returnByValue: true,
  });
  const value = evalRes && evalRes.result && evalRes.result.value;
  console.log("2. saveApiKey 返回:", JSON.stringify(value));
  if (!value || !value.ok) throw new Error("saveApiKey 失败: " + JSON.stringify(value));

  // 3. 验证凭据文件写入
  const credFile = path.join(dshHome, ".credentials.yaml");
  const credOk = await waitFor(async () => {
    try { return readFileSync(credFile, "utf8").includes("sk-e2e-test-123456"); } catch { return false; }
  }, 10000);
  console.log(`3. 凭据写入 ${credFile}: ${credOk ? "✓" : "✗"}`);
  if (!credOk) throw new Error("凭据文件未写入");
  const credText = readFileSync(credFile, "utf8").trim();
  console.log("   内容:", credText.replace(/sk-e2e-test-123456/, "sk-***"));

  // 4. 验证 DSH 服务拉起
  const bootLine = await waitFor(async () => {
    try {
      const line = readFileSync(logFile, "utf8").split("\n").find((l) => l.includes("resolved URL:"));
      return line || null;
    } catch { return null; }
  }, 90000);
  console.log(`4. 服务启动: ${bootLine ? "✓ " + bootLine.trim() : "✗"}`);
  if (!bootLine) throw new Error("服务未启动");

  ws.close();
  result = "PASS";
} catch (err) {
  console.error("E2E FAIL:", err.message);
} finally {
  spawn("taskkill", ["/PID", String(child.pid), "/T", "/F"], { windowsHide: true, stdio: "ignore" });
}
console.log("E2E RESULT:", result);
process.exitCode = result === "PASS" ? 0 : 1;
