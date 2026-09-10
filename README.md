# pi-web-ui

Web chat interface for the [pi coding agent](https://www.npmjs.com/package/@earendil-works/pi-coding-agent) SDK — chat in the browser, browse the file tree, attach files, built-in terminal (xterm.js + node-pty), model management, sound notifications, Chinese/English UI.

> Fork of [xing-shuyin/pi-web-ui](https://github.com/xing-shuyin/pi-web-ui) with personal fixes (e.g. Kimi-style `</antThinking>` leaked-reasoning tags).

## Requirements

- Node.js **>= 22.19.0**
- A configured pi agent (`~/.pi/agent`, e.g. via `pi` CLI) with at least one model provider

## Install & run

```bash
npm i -g @youweichen/pi-web-ui
pi-web-ui                 # http://127.0.0.1:8787
pi-web-ui --port 9000 --cwd /path/to/project
```

or without installing:

```bash
npx @youweichen/pi-web-ui
```

## Upgrade

```bash
npm i -g @youweichen/pi-web-ui@latest
pi-web-ui server restart   # if you installed the autostart service
```

## Autostart on boot

```bash
pi-web-ui server install    # macOS → launchd, Linux → systemd, Windows → Task Scheduler
pi-web-ui server status     # start | stop | restart | uninstall also available
```

## Desktop app (Electron)

There's also an Electron shell around the same server/UI — a native window
with a tray icon instead of a browser tab. It's built locally from source
(not published as an npm package or a GitHub release yet):

```bash
npm install
npm run build              # build:web + build:server first
npm run dev:electron       # run the shell against the local build
npm run build:electron:mac # or :win / :linux — produces an installer under release/
```

The Electron window loads the same server as the CLI (`server/index.ts`),
just spawned as a hidden child process instead of opening a browser tab.
Desktop-app data lives in `~/.pi-web-desktop` (separate from the CLI's
`~/.pi-web`, so the two don't fight over `client-state.json` if you run both
— chat history itself is shared, it lives in `~/.pi/agent`).

See `docs/deployment.md` for details.

## Notes

- Binds to loopback (`127.0.0.1`) by default; set `PI_WEB_HOST` to expose on LAN.
- Optional shared-password auth: `PI_WEB_TOKEN=secret pi-web-ui`.
- `node-pty` is a native module — on Windows you may need Visual Studio Build Tools if no prebuilt binary matches.

## 中文简介

pi 编码智能体的 Web 聊天界面：浏览器对话、文件树、附件、内置终端、模型管理、声音提醒、中英文切换。全局安装后一条命令启动，支持开机自启（launchd / systemd / Windows 计划任务）。

也有一个 Electron 桌面版壳子（原生窗口 + 托盘，不用开浏览器标签页），目前需要本地源码构建（`npm run build:electron:mac/:win/:linux`），还没发到 npm / GitHub Releases，见 `docs/deployment.md`。

## License

MIT
