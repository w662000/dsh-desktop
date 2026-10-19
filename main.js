"use strict";

/**
 * DeepSeek Harness — 桌面外壳
 *
 * 架构：Electron 只负责「窗口 + 生命周期 + 首次引导」。DSH 本体作为子进程，
 * 用内置的 node.exe 运行（`node dsh/lib/bin.js web`），Electron 主进程从
 * stdout 解析 `dsh web: http://127.0.0.1:<port>` 后把窗口指向该地址。
 *
 * 这样 DSH 运行在真正的 Node 上，其原生模块（node-pty / sharp / koffi 等）
 * 的 ABI 完全匹配，避免 Electron ABI 不一致的问题。
 *
 * 首次引导：启动时检测 API Key（环境变量 > $DSH_HOME/.credentials.yaml >
 * 项目 .env > $DSH_HOME/.env）。没有 Key 时展示引导页，保存后写入
 * `$DSH_HOME/.credentials.yaml` —— 与网页版「设置 → 模型」是同一个凭据存储，
 * 后续启动检测到 Key 后自动跳过引导，应用内设置与网站完全一致。
 */

const { app, BrowserWindow, Menu, shell, dialog, ipcMain, Tray, nativeImage } = require("electron");
const { spawn } = require("node:child_process");
const path = require("node:path");
const fs = require("node:fs");
const os = require("node:os");

const APP_TITLE = "DeepSeek Harness";
const URL_RE = /dsh web:\s*(https?:\/\/127\.0\.0\.1:\d+\S*)/;
const API_KEY_REF = "DEEPSEEK_API_KEY";

// 与 DSH 网页主题一致的颜色（dsh-client-ui-theme design-platform.css 深色令牌）。
const THEME = {
  canvas: "#0f1115",
  module: "#232428",
  brand: "#5686fe",
  label: "#f9fafb",
  dimmed: "#a7abb2",
  danger: "#f25a5a",
  border: "rgba(255,255,255,0.08)",
};

/** 单实例锁：二次启动时聚焦已存在的窗口，避免重复拉起服务。 */
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  let dshProcess = null;
  let mainWindow = null;
  let tray = null;
  let webUrl = null;
  let shuttingDown = false;
  let booting = false;
  let wizardActive = false;
  let isQuitting = false;
  let hideHintShown = false;
  let handlingServerDeath = false;

  /** 内置 DSH 运行时目录：打包后在 resources/server，开发时在项目根 server/。 */
  function serverRoot() {
    return app.isPackaged
      ? path.join(process.resourcesPath, "server")
      : path.join(__dirname, "server");
  }

  // node_modules 嵌套在 runtime/ 下：electron-builder 会硬性排除根级 node_modules
  // 目录，嵌套一层后才会被完整打包。
  function runtimeRoot() {
    return path.join(serverRoot(), "runtime");
  }

  function nodeExe() {
    return path.join(runtimeRoot(), "node.exe");
  }

  function dshBin() {
    return path.join(
      runtimeRoot(),
      "node_modules",
      "@deepseek-ai",
      "dsh",
      "lib",
      "bin.js"
    );
  }

  function logFile() {
    const dir = path.join(app.getPath("userData"), "logs");
    fs.mkdirSync(dir, { recursive: true });
    return path.join(dir, "server.log");
  }

  function appLog(message) {
    try {
      const stream = fs.createWriteStream(logFile(), { flags: "a" });
      stream.write(`[shell] ${new Date().toISOString()} ${message}\n`);
      stream.end();
    } catch (_) {
      /* 日志失败不影响主流程 */
    }
  }

  /** 中文错误对话框（Electron 的 showErrorBox 在 Windows 上标题固定为英文 Error）。 */
  function showErrorDialog(title, message, detail, buttons = ["确定"]) {
    return dialog.showMessageBox({
      type: "error",
      title,
      message,
      detail: detail || "",
      buttons,
      defaultId: 0,
      cancelId: buttons.length - 1,
      noLink: true,
    });
  }

  /** 与 DSH 一致的 home 解析：$DSH_HOME（非空）优先，否则 ~/.dsh。 */
  function resolveDshHome() {
    const env = process.env.DSH_HOME;
    if (env !== undefined && env.trim().length > 0) return path.resolve(env);
    return path.join(os.homedir(), ".dsh");
  }

  function credentialsFile() {
    return path.join(resolveDshHome(), ".credentials.yaml");
  }

  // ── API Key 检测与写入（与网页「设置 → 模型」共用 $DSH_HOME/.credentials.yaml）──

  /** 读取凭据存储里 DEEPSEEK_API_KEY 条目（支持双引号/单引号/裸标量）。 */
  function readCredentialsEntry() {
    let text;
    try {
      text = fs.readFileSync(credentialsFile(), "utf8");
    } catch (_) {
      return null;
    }
    const m = text.match(
      new RegExp(
        `^${API_KEY_REF}\\s*:\\s*(?:"((?:[^"\\\\]|\\\\.)*)"|'([^']*)'|(.+?))\\s*$`,
        "m"
      )
    );
    if (!m) return null;
    const value = (m[1] !== undefined ? m[1] : m[2] !== undefined ? m[2] : m[3]).trim();
    return value.length > 0 ? value : null;
  }

  /** 读取 .env 文件里的 DEEPSEEK_API_KEY（DSH 的 dotenv 回退层）。 */
  function readEnvFileKey(file) {
    let text;
    try {
      text = fs.readFileSync(file, "utf8");
    } catch (_) {
      return null;
    }
    const m = text.match(
      new RegExp(`^${API_KEY_REF}\\s*=\\s*["']?([^"'\\r\\n]+)["']?\\s*$`, "m")
    );
    return m ? m[1].trim() : null;
  }

  /** 已配置（非空 Key）则返回该 Key，否则返回 null。检测顺序与 DSH 凭据优先级一致。 */
  function readConfiguredApiKey() {
    const env = process.env[API_KEY_REF];
    if (env !== undefined && env.trim().length > 0) return env.trim();
    const stored = readCredentialsEntry();
    if (stored) return stored;
    const projectEnv = readEnvFileKey(path.join(os.homedir(), ".env"));
    if (projectEnv) return projectEnv;
    const userEnv = readEnvFileKey(path.join(resolveDshHome(), ".env"));
    if (userEnv) return userEnv;
    return null;
  }

  /** 写入/更新 $DSH_HOME/.credentials.yaml 的 DEEPSEEK_API_KEY，保留文件其它内容。 */
  function writeApiKey(value) {
    const key = String(value).trim();
    if (key.length === 0) throw new Error("API Key 不能为空");
    const file = credentialsFile();
    fs.mkdirSync(path.dirname(file), { recursive: true });
    let text = "";
    try {
      text = fs.readFileSync(file, "utf8");
    } catch (_) {
      /* 文件不存在则新建 */
    }
    const quoted = `"${key.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
    const line = `${API_KEY_REF}: ${quoted}`;
    const lines = text.split(/\r?\n/);
    let replaced = false;
    const out = lines.map((l) => {
      if (new RegExp(`^${API_KEY_REF}\\s*:`).test(l)) {
        replaced = true;
        return line;
      }
      return l;
    });
    if (!replaced) {
      while (out.length > 0 && out[out.length - 1].trim() === "") out.pop();
      out.push(line);
    }
    let result = out.join("\n");
    if (!result.endsWith("\n")) result += "\n";
    fs.writeFileSync(file, result, "utf8");
  }

  /** 拉起 DSH web 服务，解析到实际 URL 后 resolve。 */
  function startServer() {
    return new Promise((resolve, reject) => {
      const node = nodeExe();
      const bin = dshBin();
      if (!fs.existsSync(node)) {
        return reject(new Error(`缺少 Node 运行时：${node}`));
      }
      if (!fs.existsSync(bin)) {
        return reject(new Error(`缺少 DSH 入口：${bin}`));
      }

      const log = fs.createWriteStream(logFile(), { flags: "a" });
      const stamp = new Date().toISOString();
      log.write(`\n=== ${stamp} boot ===\n`);

      // --port 0：让 OS 分配空闲端口，从 stdout 解析实际地址，彻底避免端口冲突。
      // --no-open：0.2.x 的 dsh 默认会拉起系统浏览器，桌面壳场景下禁止（窗口即 UI）。
      const child = spawn(node, [bin, "web", "--port", "0", "--no-open"], {
        cwd: os.homedir(),
        env: { ...process.env },
        stdio: ["ignore", "pipe", "pipe"],
        windowsHide: true,
      });

      let stdout = "";
      let settled = false;

      child.stdout.on("data", (chunk) => {
        const text = chunk.toString("utf8");
        stdout += text;
        log.write(text);
        const m = stdout.match(URL_RE);
        if (m && !settled) {
          settled = true;
          webUrl = m[1];
          log.write(`[shell] resolved URL: ${webUrl}\n`);
          resolve(webUrl);
        }
      });

      child.stderr.on("data", (chunk) => {
        const text = chunk.toString("utf8");
        log.write(`[stderr] ${text}`);
      });

      child.on("error", (err) => {
        log.write(`[shell] spawn error: ${err && err.message}\n`);
        if (!settled) {
          settled = true;
          reject(err);
        }
      });

      child.on("exit", (code, signal) => {
        log.write(
          `[shell] server exited code=${code} signal=${signal} shuttingDown=${shuttingDown}\n`
        );
        log.end();
        dshProcess = null;
        if (!settled) {
          settled = true;
          reject(new Error(`DSH 服务启动失败（退出码 ${code}），日志：${logFile()}`));
        } else if (!shuttingDown && !handlingServerDeath) {
          // 服务意外退出：提供「重新启动 / 退出」两个选择。
          handlingServerDeath = true;
          showErrorDialog(
            "服务已停止",
            "DSH 后台服务已停止",
            `DSH 后端意外退出（退出码 ${code}）。\n可立即重新启动服务，或退出应用。\n日志：${logFile()}`,
            ["重新启动", "退出"]
          ).then(({ response }) => {
            handlingServerDeath = false;
            if (shuttingDown) return;
            if (response === 0) {
              appLog("服务中断：用户选择重新启动");
              restartServer();
            } else {
              appLog("服务中断：用户选择退出");
              quitApp();
            }
          });
        }
      });

      dshProcess = child;
    });
  }

  /** 启动画面：DSH 冷启动约 10–20 秒，先给用户一个可见的加载状态。 */
  function loadingHtml() {
    const html = `<!doctype html><html><head><meta charset="utf-8"><style>
html,body{margin:0;height:100%;background:${THEME.canvas};color:${THEME.label};
  font-family:"Segoe UI",system-ui,sans-serif;display:flex;align-items:center;justify-content:center}
.box{text-align:center}
.ring{width:52px;height:52px;margin:0 auto 20px;border-radius:50%;
  border:4px solid ${THEME.module};border-top-color:${THEME.brand};animation:spin 1s linear infinite}
@keyframes spin{to{transform:rotate(360deg)}}
.t{font-size:16px}
.s{font-size:12px;color:${THEME.dimmed};margin-top:8px}
</style></head><body><div class="box"><div class="ring"></div>
<div class="t">正在启动 DeepSeek Harness…</div>
<div class="s">首次启动需要约 10–20 秒</div></div></body></html>`;
    return "data:text/html;charset=utf-8," + encodeURIComponent(html);
  }

  /** 首次引导页：收集 API Key，样式与 DSH 网页深色主题一致。 */
  function wizardHtml() {
    const html = `<!doctype html><html><head><meta charset="utf-8"><style>
html,body{margin:0;height:100%;background:${THEME.canvas};color:${THEME.label};
  font-family:"Segoe UI",system-ui,sans-serif;display:flex;align-items:center;justify-content:center}
.wrap{width:100%;max-width:460px;padding:0 24px;box-sizing:border-box}
.brand{display:flex;align-items:center;gap:10px;margin-bottom:28px}
.mark{width:36px;height:36px;border-radius:10px;background:${THEME.brand};
  display:flex;align-items:center;justify-content:center;font-weight:700;font-size:16px;color:#fff}
.brand .t{font-size:17px;font-weight:600}
h1{font-size:22px;font-weight:600;margin:0 0 8px}
.sub{color:${THEME.dimmed};font-size:13px;line-height:1.7;margin:0 0 28px}
label{display:block;font-size:13px;margin-bottom:8px}
.row{display:flex;gap:8px}
input{flex:1;background:${THEME.module};border:1px solid ${THEME.border};
  border-radius:10px;padding:11px 14px;color:${THEME.label};font-size:14px;outline:none;min-width:0}
input:focus{border-color:${THEME.brand}}
#toggle{background:transparent;border:1px solid ${THEME.border};color:${THEME.dimmed};
  border-radius:10px;padding:0 14px;cursor:pointer;font-size:13px}
.hint{color:${THEME.dimmed};font-size:12px;margin:10px 0 0;line-height:1.7}
.hint a{color:${THEME.brand};text-decoration:none}
.actions{display:flex;gap:10px;margin-top:28px}
button{border-radius:10px;font-size:14px;cursor:pointer;padding:11px 18px;border:none;font-family:inherit}
.primary{flex:1;background:${THEME.brand};color:#fff;font-weight:600}
.primary:disabled{opacity:.6;cursor:default}
.ghost{background:transparent;border:1px solid ${THEME.border};color:${THEME.dimmed}}
.err{color:${THEME.danger};font-size:12px;margin:12px 0 0;min-height:16px}
</style></head><body><div class="wrap">
  <div class="brand"><div class="mark">D</div><div class="t">DeepSeek Harness</div></div>
  <h1>配置 API Key</h1>
  <p class="sub">首次使用需要填写 DeepSeek API Key，保存后以后打开将自动跳过本步骤。之后可随时在应用内「设置 → 模型」中修改。</p>
  <label for="key">DeepSeek API Key</label>
  <div class="row">
    <input id="key" type="password" placeholder="sk-..." autocomplete="off" spellcheck="false">
    <button id="toggle" type="button">显示</button>
  </div>
  <p class="hint">还没有 Key？前往 <a href="https://platform.deepseek.com/api_keys" target="_blank" rel="noopener">platform.deepseek.com/api_keys</a> 创建。</p>
  <div class="actions">
    <button id="skip" class="ghost" type="button">暂时跳过</button>
    <button id="save" class="primary" type="button">保存并开始使用</button>
  </div>
  <p id="err" class="err"></p>
</div>
<script>
const $ = (id) => document.getElementById(id);
$("toggle").onclick = () => { const i = $("key"); i.type = i.type === "password" ? "text" : "password"; };
$("save").onclick = async () => {
  const key = $("key").value.trim();
  if (!key) { $("err").textContent = "请输入 API Key"; return; }
  $("save").disabled = true; $("save").textContent = "保存中…";
  const r = await window.desktopApi.saveApiKey(key);
  if (r && r.ok) { $("save").textContent = "启动中，请稍候…"; return; }
  $("err").textContent = (r && r.error) || "保存失败，请重试";
  $("save").disabled = false; $("save").textContent = "保存并开始使用";
};
$("skip").onclick = async () => {
  const r = await window.desktopApi.skipWizard();
  if (r && r.ok) { $("skip").textContent = "启动中…"; }
};
$("key").addEventListener("keydown", (e) => { if (e.key === "Enter") $("save").click(); });
</script></body></html>`;
    return "data:text/html;charset=utf-8," + encodeURIComponent(html);
  }

  function createWindow() {
    mainWindow = new BrowserWindow({
      width: 1440,
      height: 900,
      minWidth: 960,
      minHeight: 600,
      title: APP_TITLE,
      autoHideMenuBar: true,
      backgroundColor: THEME.canvas,
      show: false,
      icon: app.isPackaged
        ? undefined
        : path.join(__dirname, "build", "icon.ico"),
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        spellcheck: false,
        preload: path.join(__dirname, "preload.js"),
      },
    });

    mainWindow.once("ready-to-show", () => {
      mainWindow && mainWindow.show();
    });

    mainWindow.on("closed", () => {
      mainWindow = null;
    });

    // 点击右上角关闭 → 最小化到系统托盘（保留后台服务），不退出应用。
    mainWindow.on("close", (event) => {
      if (isQuitting) return; // 真正退出时放行
      event.preventDefault();
      mainWindow.hide();
      if (!hideHintShown && tray) {
        hideHintShown = true;
        try {
          tray.displayBalloon({
            iconType: "info",
            title: "DeepSeek Harness 仍在运行",
            content: "已最小化到系统托盘，点击托盘图标可重新打开；右键可退出。",
          });
        } catch (_) {
          /* 气泡失败不影响 */
        }
      }
    });

    // 外部链接交给系统浏览器，避免在应用窗口内跳走。
    mainWindow.webContents.setWindowOpenHandler(({ url: target }) => {
      if (webUrl && target.startsWith(webUrl)) return { action: "allow" };
      if (/^https?:\/\//.test(target)) shell.openExternal(target);
      return { action: "deny" };
    });
    mainWindow.webContents.on("will-navigate", (event, target) => {
      if (webUrl && !target.startsWith(webUrl)) {
        event.preventDefault();
        if (/^https?:\/\//.test(target)) shell.openExternal(target);
      }
    });

    mainWindow.loadURL(loadingHtml());
  }

  function navigate(url) {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    mainWindow.loadURL(url).catch((err) => {
      showErrorDialog(
        "界面加载失败",
        "无法加载界面",
        `无法加载 ${url}\n${err && err.message ? err.message : err}`
      );
    });
  }

  function loadWizard() {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    mainWindow.loadURL(wizardHtml()).catch((err) => {
      showErrorDialog(
        "引导页加载失败",
        "无法加载引导页",
        String(err && err.message ? err.message : err)
      );
    });
  }

  async function bootServerAndNavigate() {
    try {
      const url = await startServer();
      if (shuttingDown) return;
      navigate(url);
    } catch (err) {
      if (shuttingDown) return;
      showErrorDialog(
        "启动失败",
        "DSH 启动失败",
        String(err && err.message ? err.message : err)
      ).then(() => {
        if (!shuttingDown) quitApp();
      });
    }
  }

  /** 服务中断后原地重启：先显示加载页，再拉起新服务并导航到新地址。 */
  async function restartServer() {
    webUrl = null;
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.loadURL(loadingHtml()).catch(() => {});
    }
    await bootServerAndNavigate();
  }

  async function continueAfterWizard() {
    wizardActive = false;
    await bootServerAndNavigate();
  }

  async function boot() {
    if (booting) return;
    booting = true;
    createWindow();
    if (readConfiguredApiKey()) {
      appLog("检测到 API Key，直接启动");
      await bootServerAndNavigate();
    } else {
      wizardActive = true;
      appLog("未检测到 API Key，显示首次配置引导");
      loadWizard();
    }
  }

  // ── 首次引导 IPC ──
  ipcMain.handle("wizard:saveApiKey", async (_event, key) => {
    if (!wizardActive) return { ok: false, error: "配置引导未激活" };
    try {
      writeApiKey(key);
      appLog("wizard: API Key 已写入凭据存储");
      continueAfterWizard();
      return { ok: true };
    } catch (err) {
      return { ok: false, error: String(err && err.message ? err.message : err) };
    }
  });

  ipcMain.handle("wizard:skip", () => {
    if (!wizardActive) return { ok: false, error: "配置引导未激活" };
    appLog("wizard: 用户选择跳过");
    continueAfterWizard();
    return { ok: true };
  });

  function shutdown() {
    if (shuttingDown) return;
    shuttingDown = true;
    const proc = dshProcess;
    dshProcess = null;
    if (proc && proc.pid) {
      // 结束整个进程树（node.exe 及其 node-pty/子进程），避免残留后台进程。
      // Windows 上子进程信号无法优雅投递，DSH 会话持久化本身是逐批 fsync 的，
      // 强杀最多丢失最后一批事件，属可接受范围。
      try {
        spawn("taskkill", ["/PID", String(proc.pid), "/T", "/F"], {
          windowsHide: true,
          stdio: "ignore",
        });
      } catch (_) {
        /* ignore */
      }
    }
  }

  // ── 系统托盘：关闭窗口后驻留后台，托盘可重新打开/退出 ──
  function trayIconPath() {
    return app.isPackaged
      ? path.join(process.resourcesPath, "icon.ico")
      : path.join(__dirname, "build", "icon.ico");
  }

  function createTray() {
    try {
      const image = nativeImage.createFromPath(trayIconPath());
      if (image.isEmpty()) throw new Error("托盘图标为空");
      tray = new Tray(image);
      tray.setToolTip(APP_TITLE);
      tray.setContextMenu(
        Menu.buildFromTemplate([
          { label: "打开 DeepSeek Harness", click: () => showMainWindow() },
          { type: "separator" },
          {
            label: "退出",
            click: () => {
              appLog("tray: 退出");
              quitApp();
            },
          },
        ])
      );
      tray.on("click", () => showMainWindow());
      appLog("tray: 已创建");
    } catch (err) {
      appLog(`tray: 创建失败 ${err && err.message}`);
    }
  }

  function showMainWindow() {
    if (isQuitting) return;
    if (!mainWindow || mainWindow.isDestroyed()) {
      createWindow();
      if (webUrl) navigate(webUrl);
      else if (!wizardActive && !booting) boot();
    } else {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
    }
    mainWindow && mainWindow.focus();
  }

  function quitApp() {
    isQuitting = true;
    app.quit(); // before-quit → shutdown() → 结束 DSH 进程树
  }

  app.on("second-instance", () => {
    showMainWindow();
  });

  app.whenReady().then(() => {
    Menu.setApplicationMenu(null);
    createTray();
    boot();
  });

  app.on("before-quit", () => {
    isQuitting = true;
    shutdown();
  });
  // 窗口关闭只隐藏到托盘，不退出；真正的退出由托盘菜单「退出」触发。
  app.on("window-all-closed", () => {
    /* 保留后台驻留；不再自动退出 */
  });
}
