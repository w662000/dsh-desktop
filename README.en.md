# DeepSeek Harness Desktop (dsh 0.2.x adapted build)

[简体中文](./README.md) | **English**

> [!IMPORTANT]
> Unofficial community project, not affiliated with DeepSeek. Based on [DreamToRiver/deepseek-harness-desktop](https://github.com/DreamToRiver/deepseek-harness-desktop) — many thanks to the original author.
>
> **The core value of this build: it bundles [DeepSeek Harness (dsh)](https://github.com/deepseek-ai/deepseek-harness) `0.2.0-rc.2`**, fixing the fatal compatibility issues of the upstream wrapper under dsh 0.2.x.
>
> **🤖 Multi-agent teams out of the box**: this build additionally bundles the **Agent Teams multi-agent collaboration plugin** (`@nanmicoder/dsh-agent-teams`) — one lead agent orchestrating multiple member agents **working in parallel**, ready to use with zero configuration. See [below](#-multi-agent-team-agent-teams-bundled-in-this-build).

[![Release](https://img.shields.io/badge/Download-v0.2.0-blue)](../../releases/download/v0.2.0/DeepSeek-Harness-Setup-0.2.0.exe)
[![dsh](https://img.shields.io/badge/dsh-0.2.0--rc.2-green)](https://www.npmjs.com/package/@deepseek-ai/dsh)
[![Agent Teams](https://img.shields.io/badge/%F0%9F%A4%96_Agent--Teams-Multi--Agent_Bundled-8A2BE2)](#-multi-agent-team-agent-teams-bundled-in-this-build)
[![Electron](https://img.shields.io/badge/Electron-43.4.0-orange)](https://www.electronjs.org/)
[![Node](https://img.shields.io/badge/Node-24.19.0-brightgreen)](https://nodejs.org/)
![Platform](https://img.shields.io/badge/Windows-10%20%7C%2011%20x64-0078D4?logo=windows11)

## What is this

[DeepSeek Harness (dsh)](https://github.com/deepseek-ai/deepseek-harness) is DeepSeek's open-source, plugin-first AI agent runtime (*Everything is a Plugin*). The official `dsh web` command serves a local web UI on port 3080.

This project wraps it into a **double-click Windows desktop app**:

- Double-click the icon → the bundled dsh service starts automatically (`--port 0` dynamic port, no conflicts) → the window opens straight into the DSH UI
- **Multi-agent teams out of the box**: the Agent Teams plugin is bundled — multiple agents work as a team in parallel (see next section)
- Closing the window minimizes to the system tray (the background service keeps running); right-click the tray icon to quit fully
- **Zero prerequisites**: the installer bundles Electron 43.4.0 + Node 24.19.0 + the complete dsh runtime — no Node.js, no terminal needed
- **Shares `~/.dsh` with the CLI**: API keys, model settings, session history and installed plugins all carry over; both entry points can be mixed freely
- First-run wizard for the API key (skipped automatically if already configured); one-click service restart on crash; NSIS installer in Chinese

## 🤖 Multi-Agent Team (Agent Teams, bundled in this build)

This build ships with the [Agent Teams collaboration plugin](https://github.com/NanmiCoder/dsh-agent-teams) (`@nanmicoder/dsh-agent-teams@0.1.25`) **pre-installed in the web profile** — one of the most powerful collaboration plugins in the dsh ecosystem, ready to use with no extra download or configuration.

**What it does**: you state a task; the lead agent automatically breaks it into subtasks and dispatches multiple member agents that **work in parallel**, then consolidates the results into a single report. Great for:

- **Multi-perspective reviews**: one team reviews your code/design from the performance, security and product angles simultaneously, collected into one report
- **Parallel research**: agents split up to read docs, search and run verifications concurrently, cutting total wall time
- **Role-based collaboration**: product / dev / QA agents, one per role, driving the task through role-specific conversations

**How to use**: open the desktop app and issue instructions in natural language, e.g.:

```text
Use AgentTeams to review this project from performance, security, and product
perspectives. Return one consolidated report.
```

(Chinese works too — the lead understands teaming intent automatically.)

**Where to watch progress**: the **activity panel in the top-right corner** of the web UI shows each member agent's live status and output; team state is persisted under `/.agent-teams/` in the workspace for traceability.

> Tip: a lead runs one active team at a time; member sessions are persisted when agents go idle. More details and usage ideas at the plugin repo [NanmiCoder/dsh-agent-teams](https://github.com/NanmiCoder/dsh-agent-teams).

## Why this fork exists

dsh **0.2.x introduced two breaking changes** that break every 0.1.x-based desktop wrapper (including upstream DreamToRiver, huanshi2/dsh-desktop, WeiLiu03):

1. **Token authentication gate on the web UI**: bare URLs return 401; the full `?token=` address printed at startup is required
2. **Client module protocol rewrite**: the `window.__ModuleLoader__` bootstrap mechanism changed; legacy client bundles fail to load

The upstream wrappers (one-shot projects from Aug 2026) were last updated before Sept 2026 and never caught up with 0.2.x.

## Differences from upstream

| Item | Upstream DreamToRiver v0.1.1 | This build v0.2.0 |
|---|---|---|
| Bundled dsh kernel | 0.1.0-rc.6 | **0.2.0-rc.2** (2026-09-29, latest) |
| **Multi-agent team** | none | ✅ **Agent Teams plugin bundled** (`@nanmicoder/dsh-agent-teams@0.1.25`), multi-agent collaboration out of the box |
| Token auth adaptation | ❌ fixed URL, white screen on 0.2.x | ✅ `main.js` URL regex captures the full `?token=` address (unit-verified against both 0.1.x and 0.2.x output) |
| Browser double-open | dsh opens the system browser | ✅ spawn adds `--no-open`, no double-open in a desktop shell |
| Bundled Node | 24 (older minor) | 24.19.0 |
| Runtime distribution | runtime committed to the repo | **not committed** (see "Build from source"; `scripts/assemble-runtime.cmd` assembles it from your global dsh — pick whichever version you like) |

Everything else (tray, process-tree cleanup, crash recovery, Chinese installer, data directory conventions) matches upstream.

## Download & install

Grab the **single file** `DeepSeek-Harness-Setup-0.2.0.exe` (~226MB) from [Releases](../../releases).

> Full-file SHA256: `c23182dce402f9c88f7ee0395273c75fc87a04787d6087970d146272bef5b603` (optional check: `certutil -hashfile DeepSeek-Harness-Setup-0.2.0.exe SHA256`)
>
> **Fallback**: the Release also ships 5 volumes (`DSH-Setup-0.2.0.exe.part.00.part` ~ `part.04.part`) plus the `merge-parts.cmd` merger — if the single-file link is flaky for you, drop all 6 files into the **same folder** and double-click `merge-parts.cmd` to rebuild the identical installer (the volumes are merged and uploaded automatically by the repo's GitHub Action; see the release notes for the `copy /b` command-line variant).

1. Run the installer (Simplified Chinese wizard, per-user install **without admin rights**, custom directory allowed)
2. If Windows SmartScreen says "Windows protected your PC" — expected for unsigned builds, click **More info → Run anyway**
3. A **DeepSeek Harness** shortcut appears on the desktop; launch it and you're in the DSH UI within 10–20 seconds
4. **Already using the dsh CLI? Just use it** — the desktop app reads the same `~/.dsh`; your API keys, plugins and sessions are all there, nothing to reconfigure

### System requirements

- Windows 10 / 11, 64-bit
- No Node.js, no runtime libraries needed (everything is bundled)
- ~1GB of disk (after install, including the full dsh runtime)

### Notes

- **Auth mechanism**: dsh 0.2.x generates a random token on every launch (handled automatically and invisibly by this app). The token is for local loopback access only, combined with Host/Origin checks defending against DNS rebinding and cross-site requests — a security feature, not a bug
- **Uninstall keeps your data**: sessions, settings and API keys live in `%USERPROFILE%\.dsh`; uninstalling the app doesn't touch them
- **dsh 0.2.x plugin ecosystem**: some 0.1.x-era third-party plugins (e.g. the linxin666 UI extension series) are incompatible with the 0.2.x client protocol and get skipped at startup (core features unaffected). Plugin adaptation progress is up to each plugin's author

## Build from source

### 1. Assemble the runtime

This repo does **not** commit dsh runtime binaries (saves 500MB+, and lets you pick the kernel version). Before building, run:

```cmd
scripts\assemble-runtime.cmd
```

The script does two things: copies `node.exe` from PATH (Node ≥ 22.19, 24.x recommended) to `server/runtime/node.exe`, and copies the globally installed dsh (`%APPDATA%\npm\node_modules\@deepseek-ai\dsh`) wholesale to `server/runtime/node_modules/@deepseek-ai/dsh` (the dsh package is self-contained with all dependencies, ~511MB measured).

Want a specific dsh version? Run `npm install -g @deepseek-ai/dsh@<version>` first, then the script.

### 2. Build

```bash
npm ci
npm run dist        # output: dist/DeepSeek-Harness-Setup-<version>.exe
```

- Node.js 22+ and npm required; on Chinese networks set `ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/` and `ELECTRON_BUILDER_BINARIES_MIRROR=https://npmmirror.com/mirrors/electron-builder-binaries/` (package-lock already points at the npmmirror registry)
- Build takes ~6 minutes; electron-builder signs every native exe inside the runtime (node-pty/OpenConsole, ripgrep, etc.)

### 3. Verify

`dist/win-unpacked/DeepSeekHarness.exe` runs without installation (note: when testing from the built-in terminal of Electron-based IDEs like WorkBuddy, clear the `ELECTRON_RUN_AS_NODE` variable first, otherwise electron runs as plain Node). Check `%APPDATA%\deepseek-harness-desktop\logs\server.log` for `resolved URL: http://127.0.0.1:<port>/?token=...` — that's the token pipeline working end to end.

## Directory structure

```
├── main.js                # Electron main process (0.2.x token URL parsing patch + --no-open)
├── preload.js             # Secure renderer bridge
├── build/                 # Icons and NSIS installer assets
├── scripts/
│   ├── assemble-runtime.cmd   # Assemble server/runtime from your global dsh + node.exe (required before build)
│   └── ...                # Icon generation / e2e / wizard verification scripts (from upstream)
└── server/runtime/        # Runtime (not committed; assembled pre-build): node.exe + node_modules/@deepseek-ai/dsh
```

## Acknowledgements

- [DreamToRiver/deepseek-harness-desktop](https://github.com/DreamToRiver/deepseek-harness-desktop) — this project is a modification of its architecture and code; the core contributions (stdout URL parsing, tray, lifecycle management, NSIS wizard) are the original author's
- [deepseek-ai/deepseek-harness](https://github.com/deepseek-ai/deepseek-harness) — the upstream agent runtime (MIT)
- [NanmiCoder/dsh-agent-teams](https://github.com/NanmiCoder/dsh-agent-teams) — the multi-agent team plugin (bundled in this build)
- [huanshi2/dsh-desktop](https://github.com/huanshi2/dsh-desktop), [huangj17/deepseek-harness-desktop](https://github.com/huangj17/deepseek-harness-desktop) — sibling community projects, referenced during evaluation

## Licensing

- Upstream dsh, Electron and Node.js are MIT-licensed
- The upstream DreamToRiver repo declares **no open-source license**; modifications from this project are published for community sharing with full attribution and change notes, and will be adjusted if the original author requests
- This project's own changes (token URL parsing and --no-open in main.js) and the build documentation may be freely used in the spirit of MIT, at your own risk
- For learning purposes only; please comply with DeepSeek's terms of service. API keys and data stay local — nothing passes through third parties
