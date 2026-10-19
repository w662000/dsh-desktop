# DeepSeek Harness Desktop（dsh 0.2.x 适配版）

> [!IMPORTANT]
> 非官方社区项目，与 DeepSeek 无隶属关系。基于 [DreamToRiver/deepseek-harness-desktop](https://github.com/DreamToRiver/deepseek-harness-desktop) 修改，感谢原作者的出色工作。
>
> **本版本的核心价值：内置 [DeepSeek Harness (dsh)](https://github.com/deepseek-ai/deepseek-harness) `0.2.0-rc.2` 内核**，修复了上游在 dsh 0.2.x 下的致命兼容问题。

[![Release](https://img.shields.io/badge/Download-v0.2.0-blue)](../../releases/download/v0.2.0/DeepSeek-Harness-Setup-0.2.0.exe)
[![dsh](https://img.shields.io/badge/dsh-0.2.0--rc.2-green)](https://www.npmjs.com/package/@deepseek-ai/dsh)
[![Electron](https://img.shields.io/badge/Electron-43.4.0-orange)](https://www.electronjs.org/)
[![Node](https://img.shields.io/badge/Node-24.19.0-brightgreen)](https://nodejs.org/)
![Platform](https://img.shields.io/badge/Windows-10%20%7C%2011%20x64-0078D4?logo=windows11)

## 这是什么

[DeepSeek Harness（dsh）](https://github.com/deepseek-ai/deepseek-harness)是 DeepSeek 开源的插件化 AI Agent 运行时（*Everything is a Plugin*），官方通过 `dsh web` 在本地 3080 端口提供 Web 界面。

本项目把它封装成**双击即用的 Windows 桌面应用**：

- 双击图标 → 自动拉起内置 dsh 服务（`--port 0` 动态端口，永不冲突）→ 窗口直接进入 DSH 界面
- 关闭窗口最小化到系统托盘（后台服务继续运行），托盘右键完全退出
- **零预装环境**：安装包内置 Electron 43.4.0 + Node 24.19.0 + dsh 完整运行时，不需要装 Node.js，不需要终端
- **与命令行版共享 `~/.dsh`**：API Key、模型配置、会话历史、已装插件全部沿用，两个入口可混用
- 首次启动引导配置 API Key（已配置过则自动跳过）；服务异常退出可一键"重新启动"；NSIS 中文安装向导

## 为什么需要这个 fork

dsh **0.2.x 引入了两个破坏性变更**，导致所有基于 0.1.x 的桌面封装（包括上游 DreamToRiver 版、huanshi2/dsh-desktop、WeiLiu03 版）都无法直接使用：

1. **Web UI 新增 token 认证门禁**：裸 URL 返回 401，必须携带启动时打印的 `?token=` 完整地址
2. **客户端模块协议重写**：`window.__ModuleLoader__` bootstrap 机制变化，旧客户端 bundle 无法加载

上游项目（2026-08 一波流作品）最后更新均在 2026-09 之前，未跟进 0.2.x。

## 与上游的差异

| 项目 | 上游 DreamToRiver v0.1.1 | 本版 v0.2.0 |
|---|---|---|
| 内置 dsh 内核 | 0.1.0-rc.6 | **0.2.0-rc.2**（2026-09-29 latest） |
| token 认证适配 | ❌ 固定 URL，0.2.x 下白屏 | ✅ `main.js` URL 正则捕获完整 `?token=` 地址（含单测验证 0.1.x/0.2.x 双兼容） |
| 浏览器双开 | dsh 默认拉起系统浏览器 | ✅ spawn 增加 `--no-open`，桌面壳场景禁止双开 |
| 内置 Node | 24（旧 minor） | 24.19.0 |
| 运行时分发 | 仓库提交完整 runtime | **不含**（见下方"自行构建"，用 `scripts/assemble-runtime.cmd` 从本机全局 dsh 组装，想用哪个版本随你） |

其余功能（托盘、进程树清理、崩溃自愈、中文安装向导、数据目录约定）与上游一致。

## 下载安装

前往 [Releases](../../releases) 下载 `DeepSeek-Harness-Setup-0.2.0.exe`（约 226MB）。

> **当前 Release 采用分卷上传**（单文件 226MB 在慢速上行下会被 GitHub 服务端超时掐断，见 Release notes）。下载 **5 个分卷**（`DSH-Setup-0.2.0.exe.part.00.part` ~ `part.04.part`）+ `merge-parts.cmd` 合并脚本，放在**同一目录**双击 `merge-parts.cmd` 即自动合并并校验。命令行方式：
>
> ```cmd
> copy /b "DSH-Setup-0.2.0.exe.part.00.part"+"DSH-Setup-0.2.0.exe.part.01.part"+"DSH-Setup-0.2.0.exe.part.02.part"+"DSH-Setup-0.2.0.exe.part.03.part"+"DSH-Setup-0.2.0.exe.part.04.part" "DeepSeek-Harness-Setup-0.2.0.exe"
> ```
>
> 完整包 SHA256：`c23182dce402f9c88f7ee0395273c75fc87a04787d6087970d146272bef5b603`（合并后用 `certutil -hashfile DeepSeek-Harness-Setup-0.2.0.exe SHA256` 校验）

1. 双击运行安装向导（简体中文，per-user 安装**无需管理员权限**，可选安装目录）
2. 若 Windows SmartScreen 弹出"已保护你的电脑"——因未购买代码签名证书，属正常现象，点 **更多信息 → 仍要运行**
3. 安装完成后桌面出现 **DeepSeek Harness** 快捷方式，双击启动，约 10–20 秒进入界面
4. **已装过 dsh 命令行版？直接用**——桌面版读取同一个 `~/.dsh`，你的 API Key、插件、会话全都在，无需重新配置

### 系统要求

- Windows 10 / 11，64 位
- 无需 Node.js、无需任何运行库（全部内置）
- 磁盘约 1GB（安装后，含完整 dsh 运行时）

### 注意事项

- **认证机制**：dsh 0.2.x 的 Web 服务每次启动生成随机 token（本应用自动解析携带，用户无感）。token 仅用于本机 loopback 回环访问，配合 Host/Origin 校验防 DNS rebinding 与跨站攻击——这是安全特性，不是 bug
- **卸载不删数据**：会话、配置、API Key 都在 `%USERPROFILE%\.dsh`，卸载应用不影响
- **dsh 0.2.x 插件生态**：部分 0.1.x 时代的第三方插件（如 linxin666 系列 UI 扩展）与 0.2.x 客户端协议不兼容，装了会被启动跳过（不影响核心功能）。插件适配进度以各插件作者为准

## 自行构建

### 1. 组装运行时

本仓库**不提交** dsh 运行时二进制（省 500MB+，且方便你选择内核版本）。构建前先运行：

```cmd
scripts\assemble-runtime.cmd
```

脚本做两件事：从 PATH 找到 `node.exe`（需 Node ≥ 22.19，推荐 24.x）复制为 `server/runtime/node.exe`；从全局 npm 前缀（`%APPDATA%\npm\node_modules\@deepseek-ai\dsh`）整包复制 dsh 到 `server/runtime/node_modules/@deepseek-ai/dsh`（dsh 包自包含全部依赖，实测 511MB）。

想用特定 dsh 版本？先 `npm install -g @deepseek-ai/dsh@<version>` 再跑脚本。

### 2. 构建

```bash
npm ci
npm run dist        # 产物: dist/DeepSeek-Harness-Setup-<version>.exe
```

- Node.js 22+ 与 npm 必须；国内网络建议设置 `ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/` 与 `ELECTRON_BUILDER_BINARIES_MIRROR=https://npmmirror.com/mirrors/electron-builder-binaries/`（package-lock 已指向 npmmirror registry）
- 构建约 6 分钟；electron-builder 会自动对 runtime 内全部原生 exe（node-pty/OpenConsole、ripgrep 等）逐个签名

### 3. 验证

`dist/win-unpacked/DeepSeekHarness.exe` 可免安装直接跑（注意：在 WorkBuddy 等 Electron 系 IDE 的内置终端里测试需 `set ELECTRON_RUN_AS_NODE=` 清掉该变量，否则 electron 会被当纯 Node 启动）。冒烟验证看日志 `%APPDATA%\deepseek-harness-desktop\logs\server.log`，出现 `resolved URL: http://127.0.0.1:<port>/?token=...` 即 token 解析链路正常。

## 目录结构

```
├── main.js                # Electron 主进程（含 0.2.x token URL 解析补丁与 --no-open）
├── preload.js             # 渲染进程安全桥接
├── build/                 # 图标与 NSIS 安装向导资源
├── scripts/
│   ├── assemble-runtime.cmd   # 从本机全局 dsh + node.exe 组装 server/runtime（构建前必跑）
│   └── ...                # 图标生成 / e2e / 向导验证脚本（上游原有）
└── server/runtime/        # 运行时（不提交，构建前组装）：node.exe + node_modules/@deepseek-ai/dsh
```

## 致谢

- [DreamToRiver/deepseek-harness-desktop](https://github.com/DreamToRiver/deepseek-harness-desktop) —— 本项目基于其架构与代码修改，核心贡献（stdout URL 解析、托盘、生命周期管理、NSIS 向导）均来自原作者
- [deepseek-ai/deepseek-harness](https://github.com/deepseek-ai/deepseek-harness) —— 上游 Agent 运行时（MIT）
- [huanshi2/dsh-desktop](https://github.com/huanshi2/dsh-desktop)、[huangj17/deepseek-harness-desktop](https://github.com/huangj17/deepseek-harness-desktop) —— 社区同类项目，选型调研参考

## 许可说明

- 上游 dsh、Electron、Node.js 均为 MIT 协议
- 上游 DreamToRiver 仓库**未声明开源许可证**，本项目对其代码的修改部分以社区分享目的发布，并保留完整署名与差异说明；如原作者提出要求即配合调整
- 本项目对 main.js 的修改（token URL 解析、--no-open）与构建文档部分，可按 MIT 精神自由使用，风险自担
- 本应用仅供学习交流，请遵守 DeepSeek 服务条款；API Key 与数据均在本地，不经过任何第三方
