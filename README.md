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

## Autostart on boot

```bash
pi-web-ui server install    # macOS → launchd, Linux → systemd, Windows → Task Scheduler
pi-web-ui server status     # start | stop | restart | uninstall also available
```

## Notes

- Binds to loopback (`127.0.0.1`) by default; set `PI_WEB_HOST` to expose on LAN.
- Optional shared-password auth: `PI_WEB_TOKEN=secret pi-web-ui`.
- `node-pty` is a native module — on Windows you may need Visual Studio Build Tools if no prebuilt binary matches.

## 中文简介

pi 编码智能体的 Web 聊天界面：浏览器对话、文件树、附件、内置终端、模型管理、声音提醒、中英文切换。全局安装后一条命令启动，支持开机自启（launchd / systemd / Windows 计划任务）。

## License

MIT
