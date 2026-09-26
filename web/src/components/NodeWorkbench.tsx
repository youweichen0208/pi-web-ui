import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import "@xterm/xterm/css/xterm.css";
import { buildTermTheme } from "../theme";
import { randomUuid } from "../uuid";
import { useT } from "../i18n";
import type { ClientMessage, ServerMessage } from "../types";

type Event = Extract<ServerMessage, { type: "node_event" }>;
type Node = { id: string; group: string; name: string; host: string; port: number; username: string; auth: "password" | "key" | "agent"; keyPath?: string; defaultDir: string; fingerprint?: string; hasSecret?: boolean };
type Tab = { id: string; conversationId: string; busy: boolean; closed?: boolean; output?: string };
type Chat = { conversationId: string; messages: { role: string; text: string }[]; busy: boolean };
const emptyChat: Chat = { conversationId: "", messages: [], busy: false };
const draftNode = (): Partial<Node> => ({ name: "", group: "默认", host: "", port: 22, username: "root", auth: "password", defaultDir: "/" });

function RemoteTerminal({ nodeId, tab, active, send, initialOutput }: { nodeId: string; tab: Tab; active: boolean; send: (msg: ClientMessage) => boolean; initialOutput?: string }) {
	const ref = useRef<HTMLDivElement>(null);
	const closedRef = useRef(tab.closed);
	closedRef.current = tab.closed;
	useEffect(() => {
		if (!ref.current) return;
		const term = new Terminal({ theme: buildTermTheme(), fontFamily: '"SF Mono", "JetBrains Mono", ui-monospace, Consolas, monospace', fontSize: 13, scrollback: 8000 });
		const fit = new FitAddon(); term.loadAddon(fit); term.open(ref.current);
		if (initialOutput) term.write(initialOutput);
		const request = (action: string, payload: Record<string, unknown> = {}) => send({ type: "node_request", action, requestId: randomUuid(), nodeId, terminalId: tab.id, conversationId: tab.conversationId, payload });
		const input = term.onData((data) => { if (!closedRef.current) request("terminal_input", { data }); });
		const listener = (e: globalThis.Event) => { const msg = (e as CustomEvent<Event>).detail; if (msg.nodeId !== nodeId || msg.terminalId !== tab.id || msg.conversationId !== tab.conversationId) return; if (msg.event === "terminal_output") term.write(String(msg.data?.text ?? "")); if (msg.event === "terminal_exit") term.write("\r\n[SSH 已断开]\r\n"); };
		window.addEventListener("pi-node-event", listener);
		const ro = new ResizeObserver(() => { if (!ref.current?.clientWidth || !ref.current.clientHeight) return; try { fit.fit(); request("terminal_resize", { cols: term.cols, rows: term.rows }); } catch {} });
		ro.observe(ref.current);
		requestAnimationFrame(() => { try { fit.fit(); } catch {} });
		return () => { ro.disconnect(); input.dispose(); window.removeEventListener("pi-node-event", listener); term.dispose(); };
	}, [nodeId, tab.id, tab.conversationId, send]);
	return <div ref={ref} className="node-xterm" style={{ display: active ? "block" : "none" }} />;
}

export function NodeWorkbench({ send, active }: { send: (msg: ClientMessage) => boolean; active: boolean }) {
	const t = useT();
	const [nodes, setNodes] = useState<Node[]>([]);
	const [connections, setConnections] = useState<Record<string, string>>({});
	const [tabs, setTabs] = useState<Record<string, Tab[]>>({});
	const [selected, setSelected] = useState<string>(localStorage.getItem("pi-node-selected") ?? "");
	const [activeTabs, setActiveTabs] = useState<Record<string, string>>({});
	const [chats, setChats] = useState<Record<string, Chat>>({});
	const [draft, setDraft] = useState<Partial<Node> | null>(null);
	const [secret, setSecret] = useState("");
	const [error, setError] = useState("");
	const [message, setMessage] = useState("");
	const [path, setPath] = useState("/");
	const [listings, setListings] = useState<Record<string, { path: string; entries: { name: string; type: string }[] }>>({});
	const [file, setFile] = useState<{ nodeId: string; path: string; text: string } | null>(null);
	const terminalHistory = useRef(new Map<string, string>());
	const latestList = useRef(new Map<string, string>());
	const latestRead = useRef(new Map<string, string>());
	const pendingWrite = useRef<string | null>(null);
	const request = useCallback((action: string, nodeId?: string, payload?: Record<string, unknown>, terminalId?: string, conversationId?: string) => {
		const requestId = randomUuid();
		return send({ type: "node_request", requestId, action, nodeId, terminalId, conversationId, payload }) ? requestId : null;
	}, [send]);
	const node = nodes.find((n) => n.id === selected);
	const currentTabs = tabs[selected] ?? [];
	const activeTab = currentTabs.find((t) => t.id === activeTabs[selected]) ?? currentTabs.at(-1);
	const chat = chats[selected] ?? emptyChat;
	const entries = listings[selected]?.path === path ? listings[selected].entries : [];
	useEffect(() => { if (selected && activeTab && !activeTab.closed) request("terminal_select", selected, {}, activeTab.id, activeTab.conversationId); }, [selected, activeTab?.id, activeTab?.closed, request]);
	useEffect(() => { if (active) request("state"); }, [active, request]);
	useEffect(() => { if (selected) { localStorage.setItem("pi-node-selected", selected); request("chat_state", selected); } }, [selected, request]);
	useEffect(() => { if (node) setPath(node.defaultDir); }, [selected, node?.defaultDir]);
	useEffect(() => {
		const listener = (e: globalThis.Event) => {
			const msg = (e as CustomEvent<Event>).detail;
			const id = msg.nodeId ?? "";
			if (msg.event === "state") {
				const list = (msg.data?.nodes ?? []) as Node[];
				setNodes(list);
				setConnections(Object.fromEntries(((msg.data?.connections ?? []) as { nodeId: string; status: string }[]).map((c) => [c.nodeId, c.status])));
				for (const c of (msg.data?.connections ?? []) as { nodeId: string; terminals: Tab[] }[]) for (const tab of c.terminals) terminalHistory.current.set(`${c.nodeId}:${tab.id}`, tab.output ?? "");
				setTabs((before) => {
					const next = { ...before };
					for (const c of (msg.data?.connections ?? []) as { nodeId: string; terminals: Tab[] }[]) {
						const previous = (before[c.nodeId] ?? []).filter((tab) => !c.terminals.some((current) => current.id === tab.id)).map((tab) => ({ ...tab, closed: true }));
						next[c.nodeId] = [...previous, ...c.terminals];
					}
					for (const key of Object.keys(next)) if (!((msg.data?.connections ?? []) as { nodeId: string }[]).some((c) => c.nodeId === key)) next[key] = next[key].map((t) => ({ ...t, closed: true }));
					for (const key of Object.keys(next)) if (!list.some((n) => n.id === key)) delete next[key];
					return next;
				});
				return;
			}
			if (msg.event === "terminal_output") {
				const key = `${id}:${msg.terminalId}`;
				terminalHistory.current.set(key, ((terminalHistory.current.get(key) ?? "") + String(msg.data?.text ?? "")).slice(-65536));
				return;
			}
			if (msg.event === "trust_required") { if (window.confirm(t("nodeTrust", { name: String(msg.data?.name ?? ""), host: String(msg.data?.host ?? ""), fingerprint: String(msg.data?.fingerprint ?? "") }))) request("trust", id, { fingerprint: msg.data?.fingerprint }); return; }
			if (msg.event === "failure") { if (msg.requestId === pendingWrite.current) pendingWrite.current = null; setError(String(msg.data?.message ?? "操作失败")); return; }
			if (msg.event === "chat") { setChats((c) => ({ ...c, [id]: { conversationId: msg.conversationId ?? "", messages: (msg.data?.messages ?? []) as Chat["messages"], busy: Boolean(msg.data?.busy) } })); return; }
			if (msg.event === "chat_error") { setError(String(msg.data?.message ?? "Agent 出错")); return; }
			if (msg.event === "terminal_busy") { setTabs((all) => ({ ...all, [id]: (all[id] ?? []).map((t) => t.id === msg.terminalId ? { ...t, busy: Boolean(msg.data?.busy) } : t) })); return; }
			if (msg.event === "terminal_exit") { const key = `${id}:${msg.terminalId}`; terminalHistory.current.set(key, (terminalHistory.current.get(key) ?? "") + "\r\n[SSH 已断开]\r\n"); setTabs((all) => ({ ...all, [id]: (all[id] ?? []).map((t) => t.id === msg.terminalId ? { ...t, closed: true } : t) })); return; }
			if (msg.event !== "result") return;
			const action = msg.data?.action;
			if (action === "terminal_open") { const t: Tab = { id: String(msg.data?.terminalId), conversationId: String(msg.data?.conversationId), busy: false }; setTabs((all) => ({ ...all, [id]: (all[id] ?? []).some((x) => x.id === t.id) ? all[id] : [...(all[id] ?? []), t] })); setActiveTabs((all) => ({ ...all, [id]: t.id })); }
			if (action === "list" && msg.requestId === latestList.current.get(id)) setListings((all) => ({ ...all, [id]: { path: String(msg.data?.path ?? ""), entries: (msg.data?.entries ?? []) as { name: string; type: string }[] } }));
			if (action === "read" && msg.requestId === latestRead.current.get(id)) setFile({ nodeId: id, path: String(msg.data?.path ?? ""), text: String(msg.data?.text ?? "") });
			if (action === "write" && msg.requestId === pendingWrite.current) { pendingWrite.current = null; setFile((current) => current?.nodeId === id && current.path === msg.data?.path ? null : current); }
			if (action === "chat_state") setChats((all) => ({ ...all, [id]: { ...all[id] ?? emptyChat, conversationId: String(msg.data?.conversationId ?? "") } }));
			if (action === "save") { setDraft(null); setSecret(""); }
			if (action === "import_legacy" || action === "import") setError(t("nodeImported", { n: Number(msg.data?.count ?? 0) }));
		};
		window.addEventListener("pi-node-event", listener);
		return () => window.removeEventListener("pi-node-event", listener);
	}, [request, t]);
	const groups = useMemo(() => [...new Set(nodes.map((n) => n.group || "默认"))], [nodes]);
	const listFiles = (target: string) => { const id = request("list", selected, { path: target }, activeTab?.id, activeTab?.conversationId); if (id) latestList.current.set(selected, id); };
	const openFile = (target: string) => { const id = request("read", selected, { path: target }, activeTab?.id, activeTab?.conversationId); if (id) latestRead.current.set(selected, id); };
	const saveFile = () => { if (!file || file.nodeId !== selected) return; pendingWrite.current = request("write", file.nodeId, { path: file.path, text: file.text }, activeTab?.id, activeTab?.conversationId); };
	const submit = () => { if (!message.trim() || !activeTab || !chat.conversationId || activeTab.closed) return; if (request("chat_prompt", selected, { text: message }, activeTab.id, chat.conversationId)) setMessage(""); };
	return <div className="node-workbench">
		<aside className="node-sidebar"><header><strong>{t("nodeWorkbench")}</strong><button onClick={() => { setDraft(draftNode()); setSecret(""); }}>＋</button></header>
			{groups.map((group) => <section key={group}><h3>{group}</h3>{nodes.filter((n) => (n.group || "默认") === group).map((n) => <div className={`node-item ${selected === n.id ? "selected" : ""}`} key={n.id}><button onClick={() => setSelected(n.id)}><span className={`node-dot ${connections[n.id] ?? "offline"}`} />{n.name}<small>{n.username}@{n.host}</small></button><button title={t("nodeEdit")} onClick={() => { setDraft(n); setSecret(""); }}>⋯</button></div>)}</section>)}
			{!nodes.length && <p className="node-muted">{t("nodeAddHint")}</p>}
			<button className="node-secondary" onClick={() => request("import_legacy")}>{t("nodeImportLegacy")}</button>
			<label className="node-secondary">{t("nodeImportJson")}<input type="file" accept="application/json,.json" style={{ display: "none" }} onChange={async (e) => { const f = e.target.files?.[0]; if (!f) return; try { const data = JSON.parse(await f.text()); request("import", undefined, { nodes: data.nodes }); } catch { setError(t("nodeInvalidJson")); } e.target.value = ""; }} /></label>
			<button className="node-secondary" onClick={() => { const clean = nodes.map(({ hasSecret, fingerprint, ...rest }) => rest); const blob = new Blob([JSON.stringify({ nodes: clean }, null, 2)], { type: "application/json" }); const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "pi-nodes.json"; a.click(); URL.revokeObjectURL(a.href); }}>{t("nodeExport")}</button>
		</aside>
		{node ? <><section className="node-main"><header className="node-main-head"><strong>{node.name}</strong><span>{node.username}@{node.host}:{node.port}</span><em>{connections[selected] === "connected" ? t("nodeConnected") : t("nodeDisconnected")}</em><button onClick={() => request(connections[selected] === "connected" ? "disconnect" : "connect", selected)}>{connections[selected] === "connected" ? t("nodeDisconnect") : t("nodeConnect")}</button></header>
			<div className="node-tabs">{currentTabs.map((tab, i) => <button key={tab.id} className={activeTab?.id === tab.id ? "active" : ""} onClick={() => setActiveTabs((a) => ({ ...a, [selected]: tab.id }))}>{t("nodeTab", { n: i + 1 })}{tab.closed ? ` · ${t("nodeTabClosed")}` : tab.busy ? ` · ${t("nodeTabBusy")}` : ""}<span onClick={(e) => { e.stopPropagation(); if (!tab.closed) request("terminal_close", selected, {}, tab.id, tab.conversationId); terminalHistory.current.delete(`${selected}:${tab.id}`); setTabs((all) => ({ ...all, [selected]: (all[selected] ?? []).filter((x) => x.id !== tab.id) })); }}> ×</span></button>)}<button disabled={connections[selected] !== "connected"} onClick={() => request("terminal_open", selected, { cols: 80, rows: 24 }, randomUuid(), chat.conversationId || randomUuid())}>＋</button></div>
			<div className="node-terminals">{currentTabs.map((tab) => <RemoteTerminal key={tab.id} nodeId={selected} tab={tab} active={active && activeTab?.id === tab.id} send={send} initialOutput={terminalHistory.current.get(`${selected}:${tab.id}`) ?? tab.output} />)}{!currentTabs.length && <div className="node-empty">{t("nodeOpenHint")}</div>}</div>
			<div className="node-filebar"><input value={path} onChange={(e) => setPath(e.target.value)} aria-label={t("nodeDefaultDir")} /><button disabled={connections[selected] !== "connected"} onClick={() => listFiles(path)}>{t("nodeBrowse")}</button></div>
			{entries.length > 0 && <div className="node-files">{entries.map((entry) => { const target = `${path.replace(/\/$/, "")}/${entry.name}`; return <button key={entry.name} onClick={() => entry.type === "dir" ? (setPath(target), listFiles(target)) : openFile(target)}>{entry.type === "dir" ? "📁" : "📄"} {entry.name}</button>; })}</div>}
			{file?.nodeId === selected && <div className="node-file-editor"><span>{file.path}</span><button onClick={saveFile}>{t("save")}</button><button onClick={() => setFile(null)}>{t("close")}</button><textarea value={file.text} onChange={(e) => setFile({ ...file, text: e.target.value })} /></div>}
		</section><aside className="node-agent"><header><strong>{t("nodeChat")}</strong><span>{node.name}</span></header><div className="node-agent-messages">{chat.messages.map((m, i) => <div className={`node-agent-message ${m.role}`} key={i}><small>{m.role}</small><pre>{m.text}</pre></div>)}</div>{error && <div className="node-error" role="alert" onClick={() => setError("")}>{error} ×</div>}<div className="node-agent-input"><textarea value={message} onChange={(e) => setMessage(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submit(); } }} placeholder={t("nodeChatPlaceholder")} /><div><span>{activeTab ? `${t("nodeTab", { n: currentTabs.indexOf(activeTab) + 1 })}${activeTab.closed ? ` ${t("nodeTabClosed")}` : ""}` : t("nodeSelectTerminal")}</span>{activeTab && <button onClick={() => request("interrupt", selected, {}, activeTab.id, activeTab.conversationId)}>{t("nodeInterrupt")}</button>}{chat.busy && <button onClick={() => request("chat_abort", selected)}>{t("nodeStopAgent")}</button>}<button disabled={!activeTab || activeTab.closed || !chat.conversationId || chat.busy} onClick={submit}>{t("nodeSend")}</button></div></div></aside></> : <div className="node-empty">{t("nodeEmpty")}</div>}
		{draft && <div className="node-modal-backdrop"><form className="node-modal" onSubmit={(e) => { e.preventDefault(); request("save", draft.id, { ...draft, secret: secret || undefined }); }}><h2>{draft.id ? t("nodeEdit") : t("nodeAdd")}</h2>{([ ["group", t("nodeGroup")], ["name", t("nodeName")], ["host", t("nodeAddress")], ["port", t("nodePort")], ["username", t("nodeUsername")], ["defaultDir", t("nodeDefaultDir")] ] as const).map(([key, label]) => <label key={key}>{label}<input required={key !== "group"} value={String(draft[key] ?? "")} onChange={(e) => setDraft({ ...draft, [key]: key === "port" ? Number(e.target.value) : e.target.value })} /></label>)}<label>{t("nodeAuth")}<select value={draft.auth} onChange={(e) => setDraft({ ...draft, auth: e.target.value as Node["auth"] })}><option value="password">{t("nodePassword")}</option><option value="key">{t("nodeKey")}</option><option value="agent">{t("nodeAgentAuth")}</option></select></label>{draft.auth === "key" && <label>{t("nodeKeyPath")}<input value={draft.keyPath ?? ""} onChange={(e) => setDraft({ ...draft, keyPath: e.target.value })} /></label>}{draft.auth !== "agent" && <label>{draft.auth === "key" ? t("nodePassphrase") : t("nodePassword")}<input type="password" value={secret} onChange={(e) => setSecret(e.target.value)} placeholder={draft.hasSecret ? t("nodeKeepSecret") : ""} /></label>}<div className="node-modal-actions">{draft.id && draft.fingerprint && <button type="button" onClick={() => { if (window.confirm(t("nodeForgetHostKeyConfirm", { name: draft.name ?? "" }))) request("forget_host_key", draft.id); }}>{t("nodeForgetHostKey")}</button>}{draft.id && <button type="button" onClick={() => { if (window.confirm(t("nodeDeleteConfirm", { name: draft.name ?? "" }))) { request("delete", draft.id); setDraft(null); } }}>{t("nodeDelete")}</button>}<button type="button" onClick={() => setDraft(null)}>{t("cancel")}</button><button type="submit">{t("save")}</button></div></form></div>}
	</div>;
}
