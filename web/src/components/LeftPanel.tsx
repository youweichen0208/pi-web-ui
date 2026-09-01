import { memo, useEffect, useState } from "react";
import {
	FiCheck,
	FiEdit2,
	FiFolder,
	FiFolderPlus,
	FiMessageSquare,
	FiTrash2,
	FiX,
} from "react-icons/fi";
import type {
	ConversationSummary,
	DirBrowse,
	ProjectSummary,
	SessionSummary,
} from "../types";
import { FolderPickerModal } from "./FolderPickerModal";
import type { ConnStatus } from "../use-chat";
import { useT } from "../i18n";

/** Props are deliberately NARROW (no whole-ChatState object): every field is
 *  stable while tokens stream in, so the shallow-compared memo() below skips
 *  this entire panel during streaming instead of re-reconciling the file tree
 *  and conversation lists on every delta. Add a prop here when adding a chat
 *  field usage — TypeScript enforces it at the call site. */
interface LeftPanelProps {
	ready: boolean;
	status: ConnStatus;
	cwd: string;
	sessionFile: string | null;
	conversations: ConversationSummary[];
	sessions: SessionSummary[];
	projects: ProjectSummary[];
	/** Latest workspace-picker listing (drives FolderPickerModal). */
	dirBrowse: DirBrowse | null;
	activeConversationId: string;
	send: (
		msg:
			| { type: "new_chat" }
			| { type: "list_sessions" }
			| { type: "list_projects" }
			| { type: "switch_session"; path: string }
			| { type: "switch_conversation"; id: string }
			| { type: "set_cwd"; path: string }
			| { type: "remove_project"; path: string }
			| { type: "delete_session"; path: string }
			| { type: "rename_session"; path: string; name: string }
			| { type: "browse_dirs"; path?: string },
	) => boolean;
	/** True while the panel is actually on screen (desktop: always; mobile:
	 *  only while the drawer is open). Drives lazy loading of the session
	 *  list + recent projects — both scan session files on disk. */
	active: boolean;
}

function formatModified(ts: number): string {
	const d = new Date(ts);
	const now = new Date();
	const sameDay = d.toDateString() === now.toDateString();
	if (sameDay) {
		return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
	}
	return `${d.getMonth() + 1}/${d.getDate()}`;
}

export const LeftPanel = memo(function LeftPanel({ ready, status, cwd, sessionFile, conversations, sessions, projects, dirBrowse, activeConversationId, send, active }: LeftPanelProps) {
	const t = useT();
	const currentFile = sessionFile;
	const currentCwd = cwd;
	// Two-step delete confirm: which row ("proj:<path>" / "sess:<path>") is
	// awaiting its second click. Mirrors the settings-panel uninstall pattern.
	const [confirmDel, setConfirmDel] = useState<string | null>(null);

	// Inline session rename: which transcript path is being edited, and the
	// draft text. Empty draft clears the name (list falls back to first message).
	const [renaming, setRenaming] = useState<string | null>(null);
	const [renameDraft, setRenameDraft] = useState("");

	// "Open folder": the recent-project list only ever grew as a side effect
	// of the /cwd slash command — this is the panel's own entry point. Opens
	// a server-driven directory picker (see FolderPickerModal for why a
	// native OS dialog can't work here).
	const [picking, setPicking] = useState(false);

	// 乐观项目切换反馈：点击后立即高亮 + 转圈，等 cwd 真正变过来再清掉。
	// "warm" 切换很快，这段几乎一闪而过；"cold" 切换（需要真正恢复会话运行时）
	// 期间也能让用户立刻知道点击生效了，而不是干等服务端往返。
	const [pendingCwd, setPendingCwd] = useState<string | null>(null);
	useEffect(() => {
		if (pendingCwd && cwd === pendingCwd) setPendingCwd(null);
	}, [cwd, pendingCwd]);
	// 兜底：万一切换失败/服务端从未回包，别让转圈永远卡住。
	useEffect(() => {
		if (!pendingCwd) return;
		const timer = setTimeout(() => setPendingCwd(null), 15000);
		return () => clearTimeout(timer);
	}, [pendingCwd]);

	// Lazy load + stale-while-revalidate: (re)fetch whenever the panel is on
	// screen, the connection is ready, or the workspace changed. Old data
	// stays visible while the fresh listing is in flight.
	useEffect(() => {
		if (!active || !ready || status !== "open") return;
		if (!cwd) return;
		send({ type: "list_sessions" });
		send({ type: "list_projects" });
	}, [active, ready, status, cwd, send]);

	const displayName = (s: SessionSummary): string => {
		const title = s.name || s.firstMessage.trim();
		return title.length > 0 ? title : t("emptyChat");
	};

	// A running conversation's transcript is on disk too, and list_sessions
	// does not filter open ones out — so the same conversation was listed in
	// BOTH sections, keyed differently (runtime id vs. file path) and with no
	// way to tell they were one thing. Worse, the history row sent
	// switch_session, which resumes from disk and rebuilds the runtime — on a
	// conversation that already had a live one. The running section shows
	// these with richer state (streaming dot), so history drops them.
	const runningFiles = new Set(
		conversations
			.map((conv) => conv.sessionFile)
			.filter((f): f is string => typeof f === "string" && f.length > 0),
	);
	const historySessions = sessions.filter((s) => !runningFiles.has(s.path));

	const projectName = (path: string): string =>
		path.split(/[\\/]/).pop() || path;

	/** The directory the project SITS IN, for the row's second line.
	 *
	 *  Showing the full absolute path there repeated the project name (its
	 *  own last segment) on every row, spending the wider line on the least
	 *  distinguishing part of the path — two sibling checkouts looked
	 *  identical until the very end of a string that had already been
	 *  ellipsized. Empty for roots ("/" or "C:\\") and for top-level entries
	 *  like /Users, where the parent adds nothing and the row renders as a
	 *  single line instead of repeating itself. */
	const projectParent = (path: string): string => {
		const norm = path.replace(/[\\/]+$/, "");
		const idx = Math.max(norm.lastIndexOf("/"), norm.lastIndexOf("\\"));
		return idx <= 0 ? "" : norm.slice(0, idx);
	};

	/** Hover-revealed delete button with two-step confirm (the .lp-row wrapper
	 *  positions it; stopPropagation keeps the row click from firing). */
	const delButton = (
		key: string,
		hint: string,
		confirmHint: string,
		onConfirm: () => void,
	) => {
		const armed = confirmDel === key;
		return (
			<button
				type="button"
				className={`lp-del ${armed ? "confirm" : ""}`}
				title={armed ? confirmHint : hint}
				onClick={(e) => {
					e.stopPropagation();
					if (armed) {
						setConfirmDel(null);
						onConfirm();
					} else {
						setConfirmDel(key);
					}
				}}
			>
				{armed ? <FiCheck /> : <FiTrash2 />}
			</button>
		);
	};

	return (
		<aside className="panel panel-left">
			<div className="panel-projects">
				<div className="panel-section-title">{t("recentProjects")}</div>
				<button
					type="button"
					className="lp-add-project"
					onClick={() => setPicking(true)}
				>
					<FiFolderPlus className="project-icon" />
					<span>{t("openFolder")}</span>
				</button>
				<div className="projects-scroll">
					{projects.map((p) => {
						const active = currentCwd === p.path;
						const pending = !active && pendingCwd === p.path;
						return (
							<div
								className="lp-row"
								key={p.path}
								onMouseLeave={() =>
									setConfirmDel((k) => (k === `proj:${p.path}` ? null : k))
								}
							>
								<button
									type="button"
									className={`project-item ${active ? "active" : ""} ${pending ? "pending" : ""}`}
									title={p.path}
									onClick={() => {
										if (!active) {
											setPendingCwd(p.path);
											send({ type: "set_cwd", path: p.path });
										}
									}}
								>
									<FiFolder className="project-icon" />
									<span className="project-info">
										<span className="project-name">{projectName(p.path)}</span>
										{projectParent(p.path) && (
											<span className="project-path">
												{projectParent(p.path)}
											</span>
										)}
									</span>
									{pending ? (
										<span className="thinking-spinner project-spinner" aria-hidden="true" />
									) : (
										<span className="project-time">
											{formatModified(p.lastUsed)}
										</span>
									)}
								</button>
								{delButton(
									`proj:${p.path}`,
									t("deleteProject"),
									t("deleteProjectConfirm"),
									() => send({ type: "remove_project", path: p.path }),
								)}
							</div>
						);
					})}
				</div>
			</div>
			{conversations.length > 0 && (
				<div className="panel-convs">
					<div className="panel-section-title">{t("runningConversations")}</div>
					{conversations.map((c) => {
						const active = activeConversationId === c.id;
						return (
							<button
								type="button"
								key={c.id}
								className={`session-item ${active ? "active" : ""}`}
								title={c.title}
								onClick={() => {
									if (!active) send({ type: "switch_conversation", id: c.id });
								}}
							>
								<FiMessageSquare className="session-icon" />
								<span className="session-info">
									<span className="session-title">{c.title}</span>
									<span className="session-sub">
										{active
											? t("current")
											: t("messageCount", { n: c.messageCount })}
									</span>
								</span>
								{c.isStreaming && (
									<span className="conv-streaming" title={t("streaming")} />
								)}
							</button>
						);
					})}
					<div className="panel-section-divider" />
				</div>
			)}
			<div className="panel-sessions">
				<div className="panel-section-title">{t("historySessions")}</div>
				<div className="sessions-scroll">
					{historySessions.length === 0 && (
						<div className="panel-empty">{t("noHistory")}</div>
					)}
					{historySessions.map((s) => {
						const active = currentFile === s.path;
						if (renaming === s.path) {
							return (
								<form
									className="lp-inline-form"
									key={s.path}
									onSubmit={(e) => {
										e.preventDefault();
										send({
											type: "rename_session",
											path: s.path,
											name: renameDraft.trim(),
										});
										setRenaming(null);
									}}
								>
									{/* biome-ignore lint/a11y/noAutofocus: opened by an explicit click */}
									<input
										autoFocus
										className="lp-inline-input"
										placeholder={t("renameSessionPlaceholder")}
										value={renameDraft}
										onChange={(e) => setRenameDraft(e.target.value)}
										onKeyDown={(e) => {
											if (e.key === "Escape") setRenaming(null);
										}}
									/>
									<button type="submit" className="lp-inline-ok" title={t("confirm")}>
										<FiCheck />
									</button>
									<button
										type="button"
										className="lp-inline-cancel"
										title={t("cancel")}
										onClick={() => setRenaming(null)}
									>
										<FiX />
									</button>
								</form>
							);
						}
						return (
							<div
								className="lp-row"
								key={s.path}
								onMouseLeave={() =>
									setConfirmDel((k) => (k === `sess:${s.path}` ? null : k))
								}
							>
								<button
									type="button"
									className={`session-item ${active ? "active" : ""}`}
									title={s.path}
									onClick={() => {
										if (!active) send({ type: "switch_session", path: s.path });
									}}
								>
									<FiMessageSquare className="session-icon" />
									<span className="session-info">
										<span className="session-title">{displayName(s)}</span>
										<span className="session-sub">
											{active
												? t("current")
												: t("messageCount", { n: s.messageCount })}
											{s.source === "tui" && (
												<span className="session-src" title={t("tuiTip")}>
													TUI
												</span>
											)}
										</span>
									</span>
									<span className="session-time">
										{formatModified(s.modified)}
									</span>
								</button>
								<button
									type="button"
									className="lp-rename"
									title={t("renameSession")}
									onClick={(e) => {
										e.stopPropagation();
										setRenameDraft(s.name ?? "");
										setRenaming(s.path);
									}}
								>
									<FiEdit2 />
								</button>
								{delButton(
									`sess:${s.path}`,
									t("deleteSession"),
									t("deleteSessionConfirm"),
									() => send({ type: "delete_session", path: s.path }),
								)}
							</div>
						);
					})}
				</div>
			</div>
			{picking && (
				<FolderPickerModal
					dirBrowse={dirBrowse}
					onBrowse={(path) => send({ type: "browse_dirs", path })}
					onPick={(path) => {
						setPendingCwd(path);
						send({ type: "set_cwd", path });
						setPicking(false);
					}}
					onClose={() => setPicking(false)}
				/>
			)}
		</aside>
	);
});
