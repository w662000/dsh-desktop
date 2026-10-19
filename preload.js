"use strict";

/**
 * 预加载脚本：仅向渲染进程暴露最小化的首次引导 API。
 * sandbox + contextIsolation 下只有 contextBridge/ipcRenderer 可用，
 * 不会向页面暴露任何 Node 能力。
 */
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("desktopApi", {
  /** 保存 API Key 到 $DSH_HOME/.credentials.yaml（与网页「设置 → 模型」共用存储）。 */
  saveApiKey: (key) => ipcRenderer.invoke("wizard:saveApiKey", key),
  /** 跳过首次引导，直接进入应用（之后可在设置里再配置）。 */
  skipWizard: () => ipcRenderer.invoke("wizard:skip"),
});
