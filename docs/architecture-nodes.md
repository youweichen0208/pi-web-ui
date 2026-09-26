# 内置 SSH 节点工作台

顶栏「节点」打开内置三栏视图：左侧是节点分组，中间是每节点的 SSH PTY 标签与 SFTP 文件浏览，右侧是该节点的独立 Agent 对话。Windows/macOS 客户端都由本机 Node 服务通过 `ssh2` 连接 Linux/macOS SSH 服务；远端账号或容器决定实际权限。

## 数据与认证

- `<dataDir>/nodes.json` 存节点 ID、分组、地址、端口、用户名、认证方式、私钥路径、默认目录与已信任的 SHA-256 主机密钥指纹。密码和私钥口令使用 `PluginSecrets` 写入 `<dataDir>/node-workbench/secrets.bin`，共享 `<dataDir>/secrets.key` 加密密钥。
- 「导入 Remote-SSH 配置」仅读取旧插件的 `ssh-hosts.json` 元数据，不删除原配置，也不读取或导入旧插件的加密凭据。需要重新填写密码或私钥口令。导入/导出 JSON 只传非机密字段。
- 首次连接先给浏览器展示主机密钥指纹；信任后才允许认证。已保存的指纹变化时服务端阻止连接。指纹在每台客户端各自保存，不跨设备同步。

## 连接、终端与 Agent

- `NodeWorkbench` 按 `clientId:nodeId` 保存连接，终端按 `terminalId` 定位，所有可变请求要求与节点和会话身份匹配。断线时保留浏览器的已断开标签。重连恢复节点选择与 Agent 会话，终端需重新打开。
- 节点 Agent 用 `SessionManager.continueRecent` 将每个客户端/节点的历史存于 `<dataDir>/node-sessions/<clientId SHA-256>/<nodeId>/`。SDK 默认工具全部关闭，只启用 `remote_command`、`remote_read`、`remote_write`；节点会话禁用本地扩展、技能与项目上下文。终端功能不依赖 Agent 模型配置。
- Agent 的命令进入用户当前选中的手动 SSH shell。服务端先锁定输入并发送 Ctrl+C，再等 shell 执行随机哨兵；确认成功才发命令，结束哨兵收集结果。无法确认或超时则报错，不继续发命令。终端输出同时广播到可见终端，工具结果进入 Agent 会话。用户可中断终端或停止 Agent。
- SFTP 浏览、读取与 UTF-8 写入按远端账号权限执行；单次读写限制 512 KiB。工具结果与终端捕获输出限制 64 KiB。

## 协议与验证

`node_request`/`node_event` 承载 `requestId`、`nodeId`、`terminalId`、`conversationId`；`server/protocol.ts` 为唯一 wire 类型源，前端在 `use-chat.ts` 转发节点事件给按需加载的工作台组件。`tests/node-workbench-test.mjs` 使用本地 mock SSH 服务覆盖主机信任、指纹变化、认证失败、终端命令、SFTP 及节点隔离。
