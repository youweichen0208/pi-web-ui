import { memo, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, MutableRefObject } from "react";
import {
	FiCheck,
	FiCode,
	FiCornerDownLeft,
	FiEdit3,
	FiEye,
	FiLink,
	FiPlus,
	FiSave,
	FiZoomIn,
	FiZoomOut,
} from "react-icons/fi";
import type { ClientMessage, FileContent, ServerMessage } from "../types";
import { SqlitePreview } from "./SqlitePreview";
import { CodeFileEditor } from "./CodeFileEditor";
import { RichMarkdownEditor } from "./RichMarkdownEditor";
import { Markdown } from "./Markdown";
import { highlightLines, langFromPath } from "../hljs-lite";
import { useT } from "../i18n";
import { getClientId } from "../use-chat";
import { randomUuid } from "../uuid";
import { markdownImageUrl } from "../markdown-image";
import { downloadFile } from "../download";
import { withToken } from "../auth-token";

/** Cap rendered lines so a pathological file can't freeze the panel. */
const MAX_PREVIEW_LINES = 5000;

export interface PreviewFile {
	path: string;
	name: string;
	cwd: string;
}

export type FileNavigationGuard = (action: () => void) => void;

interface FilePreviewProps {
	result: Extract<ServerMessage, { type: "file_result" }> | null;
	guard: MutableRefObject<FileNavigationGuard | null>;
	disabled: boolean;
	connected: boolean;
	file: PreviewFile;
	/** Latest server content, matched by workspace, path and request id. */
	content: FileContent | null;
	send: (msg: ClientMessage) => boolean;
	/** Add the selected line range as a "lines" attachment to the chat input. */
	onAddLines: (path: string, name: string, start: number, end: number) => void;
	/** Attach the whole file (inline content / path reference) like the row buttons. */
	onAttach: (path: string, name: string, mode: "inline" | "reference") => void;
	onClose: () => void;
}

/** 1-based inclusive line range. */
interface Range {
	start: number;
	end: number;
}

export const FilePreviewContent = memo(function FilePreviewContent({
	result, guard, disabled, connected,
	file,
	content,
	send,
	onAddLines,
	onAttach,
	onClose,
}: FilePreviewProps) {
	const t = useT();
	const [loaded, setLoaded] = useState<FileContent | null>(null);
	const [loading, setLoading] = useState(false);
	const [sel, setSel] = useState<Range | null>(null);
	const [dragging, setDragging] = useState(false);
	const [added, setAdded] = useState(false);
	// Editable files retain their visual formatting while accepting input.
	const [editing, setEditing] = useState(true);
	const [draft, setDraft] = useState("");
	// Markdown preview renders the current draft.
	const [markdownPreview, setMarkdownPreview] = useState(true);
	// Word wrap for the text preview (default on).
	const [wrap, setWrap] = useState(true);
	// Zoom scales code/editor/hex and the rendered Markdown.
	const [zoom, setZoom] = useState(100);
	const anchorRef = useRef(0);
	const draggingRef = useRef(false);
	const addedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

	const readId = useRef("");
	const pending = useRef<{ id: string; text: string; next?: () => void } | null>(null);
	const [status, setStatus] = useState<"saved" | "saving" | "failed">("saved");
	const [error, setError] = useState("");
	const [conflict, setConflict] = useState(false);
	const [leave, setLeave] = useState<{ action: () => void } | null>(null);
	const dirty = loaded !== null && draft !== loaded.text;

	const requestContent = () => {
		if (disabled) return;
		readId.current = randomUuid();
		setLoading(true);
		setError("");
		if (!send({ type: "read_file", path: file.path, cwd: file.cwd, requestId: readId.current })) {
			setLoading(false);
			setError(t("fileOffline"));
		}
	};
	useEffect(() => { requestContent(); }, [file.path, file.cwd]);

	useEffect(() => {
		if (content?.requestId !== readId.current || content?.cwd !== file.cwd || content?.path !== file.path) return;
		readId.current = "";
		setLoaded(content);
		setSel(null);
		setDraft(content.text);
		setEditing(content.kind === "text" && !content.binary && !content.truncated);
		setMarkdownPreview(true);
		setLoading(false);
		setConflict(false);
		setStatus("saved");
	}, [content, file.path, file.cwd]);

	useEffect(() => {
		if (!result || result.cwd !== file.cwd || result.path !== file.path) return;
		if (result.operation === "read" && result.requestId === readId.current) {
			readId.current = "";
			setLoading(false);
			setError(result.error ?? t("fileSaveFailed"));
		}
		if (result.operation !== "write" || result.requestId !== pending.current?.id) return;
		const saved = pending.current;
		if (!saved) return;
		pending.current = null;
		if (result.ok) {
			setLoaded((previous) => previous && ({
				...previous,
				text: saved.text,
				version: result.version,
				size: new TextEncoder().encode(saved.text).length,
				lines: saved.text ? saved.text.split("\n").length - (saved.text.endsWith("\n") ? 1 : 0) : 0,
			}));
			setStatus("saved");
			setSel(null);
			setConflict(false);
			setError("");
			saved.next?.();
		} else {
			setStatus("failed");
			setConflict(!!result.conflict);
			setError(result.error ?? t("fileSaveFailed"));
		}
	}, [result, file.cwd, file.path, t]);

	useEffect(() => {
		if (!loading) return;
		const fail = () => { readId.current = ""; setLoading(false); setError(t("fileOffline")); };
		if (!connected) { fail(); return; }
		const timer = setTimeout(fail, 15000);
		return () => clearTimeout(timer);
	}, [loading, connected, t]);

	useEffect(() => {
		if (status !== "saving") return;
		const fail = () => {
			pending.current = null;
			setStatus("failed");
			setError(t("fileOffline"));
		};
		if (!connected) { fail(); return; }
		const timer = setTimeout(fail, 15000);
		return () => clearTimeout(timer);
	}, [status, connected, t]);

	useLayoutEffect(() => {
		guard.current = (action) => {
			if (pending.current) return;
			if (dirty) setLeave({ action });
			else action();
		};
		return () => { guard.current = null; };
	}, [dirty, guard]);
	useEffect(() => {
		if (!dirty) return;
		const prevent = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
		window.addEventListener("beforeunload", prevent);
		return () => window.removeEventListener("beforeunload", prevent);
	}, [dirty]);

	// End drag selection on mouseup anywhere.
	useEffect(() => {
		const up = () => {
			draggingRef.current = false;
			setDragging(false);
		};
		window.addEventListener("mouseup", up);
		return () => {
			window.removeEventListener("mouseup", up);
			if (addedTimer.current) clearTimeout(addedTimer.current);
		};
	}, []);

	const lines = useMemo(() => {
		if (!loaded) return [];
		const parts = loaded.text.split("\n");
		// Trailing newline → empty phantom line; drop it so line numbers match
		// what the server counts.
		if (parts.length > 0 && parts[parts.length - 1] === "") parts.pop();
		return parts.slice(0, MAX_PREVIEW_LINES);
	}, [loaded]);

	// Syntax colors for the plain-text view. Highlighting the file in one
	// pass (rather than per line) keeps block comments and multi-line strings
	// colored across every line they span — see highlightLines(). Memoized
	// because this runs over up to MAX_PREVIEW_LINES lines and the panel
	// re-renders on every line-selection drag.
	const codeHtml = useMemo(() => {
		const lang = langFromPath(file.name);
		if (!lang || lines.length === 0) return null;
		return highlightLines(lines.join("\n"), lang);
	}, [lines, file.name]);

	const lineCount = loaded?.lines ?? 0;
	const truncatedLines = lineCount > MAX_PREVIEW_LINES;

	const selectLine = (line: number, extend: boolean) => {
		if (extend) {
			const anchor = anchorRef.current > 0 ? anchorRef.current : line;
			setSel({
				start: Math.min(anchor, line),
				end: Math.max(anchor, line),
			});
		} else {
			anchorRef.current = line;
			setSel({ start: line, end: line });
		}
	};

	const selectAll = () => {
		if (lines.length === 0) return;
		anchorRef.current = 1;
		setSel({ start: 1, end: lines.length });
	};

	const addToChat = () => {
		if (!sel) return;
		onAddLines(file.path, file.name, sel.start, sel.end);
		setAdded(true);
		if (addedTimer.current) clearTimeout(addedTimer.current);
		addedTimer.current = setTimeout(() => setAdded(false), 1400);
	};

	const canEdit =
		loaded !== null && loaded.kind === "text" && !loaded.binary && !loaded.truncated;

	const toggleEditing = () => {
		if (!canEdit) return;
		setEditing((value) => !value);
		setSel(null);
	};

	const saveEditing = (force = false, next?: () => void) => {
		if (!loaded || !canEdit || loading || disabled || pending.current) return;
		const id = randomUuid();
		pending.current = { id, text: draft, next };
		setStatus("saving");
		setError("");
		if (!send({ type: "write_file", path: file.path, cwd: file.cwd, text: draft, requestId: id, expectedVersion: loaded.version, force })) {
			pending.current = null;
			setStatus("failed");
			setError(t("fileOffline"));
		}
	};

	const handleClose = () => guard.current?.(onClose);

	const setZoomLevel = (next: number) => {
		setZoom(Math.min(200, Math.max(50, next)));
	};

	const selCount = sel ? sel.end - sel.start + 1 : 0;
	const isBinary = loaded?.binary ?? false;
	const truncated = loaded?.truncated ?? false;
	// Preview category from the server ("text" while loading). Media kinds are
	// streamed over the /api/file HTTP endpoint; "none" is never previewable.
	const kind = loaded?.kind ?? "text";
	const isMarkdown = isMarkdownFile(file.name);
	const showMarkdown =
		isMarkdown && markdownPreview && kind === "text" && !isBinary;
	// /api/file resolves against the requesting client's workspace (the opened
	// project), not the server's startup cwd — pass clientId so they can differ.
	const mediaUrl = (p: string) =>
		withToken(
			`/api/file?clientId=${encodeURIComponent(getClientId())}&path=${encodeURIComponent(p)}`,
		);

	return (
		<div
			className="fp-embedded"
			onKeyDown={(event) => {
				if (!event.nativeEvent.isComposing && (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s") {
					event.preventDefault();
					event.stopPropagation();
					saveEditing();
				}
			}}
		>
			<div
				className="fp"
				style={{ "--fp-zoom": zoom / 100 } as CSSProperties}
			>


				{truncated && kind === "text" && !isBinary && (
					<div className="fp-notice">{t("previewTruncated")}</div>
				)}

				{error && <div className="fp-notice" role="alert">{error}
					<button className="btn" disabled={disabled || status === "saving"} onClick={() => guard.current?.(requestContent)}>{t("fileReload")}</button>
					{conflict && <button className="btn" disabled={disabled} onClick={() => { if (window.confirm(t("fileOverwriteConfirm"))) saveEditing(true); }}>{t("fileOverwrite")}</button>}
				</div>}
				{leave && <div className="fp-leave" role="alertdialog" aria-label={t("fileUnsaved")}>
					<p>{t("fileLeavePrompt")}</p>
					<button className="btn primary" disabled={disabled} onClick={() => { const next = leave.action; setLeave(null); saveEditing(false, next); }}>{t("fileSaveContinue")}</button>
					<button className="btn" onClick={() => { const next = leave.action; setLeave(null); next(); }}>{t("fileDiscard")}</button>
					<button className="btn" onClick={() => setLeave(null)}>{t("cancel")}</button>
				</div>}
				{loading && !loaded && <div className="fp-empty">{t("loading")}</div>}

				{!loading && kind === "none" && !isBinary && (
					<div className="fp-empty">{t("previewNotSupported")}</div>
				)}

				{!loading && kind === "sqlite" && <SqlitePreview file={file} disabled={disabled || !connected} />}

				{!loading && kind === "image" && (
					<div className="fp-media-wrap">
						<img
							className="fp-media"
							src={mediaUrl(file.path)}
							alt={file.name}
						/>
					</div>
				)}

				{!loading && kind === "video" && (
					<div className="fp-media-wrap">
						<video
							className="fp-media"
							src={mediaUrl(file.path)}
							controls
							preload="metadata"
						/>
					</div>
				)}

				{!loading && showMarkdown && loaded && (editing && canEdit ?
					<RichMarkdownEditor file={file} value={draft} readOnly={disabled || status === "saving"} onChange={setDraft} /> : (
					<div className="fp-markdown msg-text">
						<div className="fp-markdown-zoom">
							<Markdown text={canEdit ? draft : loaded.text} imageSrc={(source) => markdownImageUrl(source, file)} />
						</div>
					</div>
				))}

				{!loading &&
					isBinary &&
					kind !== "image" &&
					kind !== "sqlite" &&
					kind !== "video" &&
					loaded && (
						<div className="fp-hex-wrap">
							<div className="fp-notice">
								{t("binaryFile")}
								{loaded.truncated && t("binaryHexTruncated")}
							</div>
							<pre className="fp-hex">{loaded.text}</pre>
						</div>
					)}

				{!loading && editing && !showMarkdown && kind === "text" && !isBinary && loaded && (
					<CodeFileEditor
						name={file.name}
						value={draft}
						readOnly={disabled || status === "saving"}
						onChange={setDraft}
						wrap={wrap}
					/>
				)}

				{!loading &&
					!showMarkdown &&
					!editing &&
					kind === "text" &&
					!isBinary &&
					loaded &&
					lines.length === 0 && (
						<div className="fp-empty">{t("emptyFile")}</div>
					)}

				{!loading &&
					!showMarkdown &&
					!editing &&
					kind === "text" &&
					!isBinary &&
					lines.length > 0 && (
					<div
						className={`fp-code ${dragging ? "dragging" : ""} ${
							wrap ? "" : "no-wrap"
						}`}
						onMouseDown={(e) => {
							// Block native text selection so click/drag maps to line ranges.
							if (e.button === 0) e.preventDefault();
						}}
					>
						{lines.map((text, i) => {
							const n = i + 1;
							const active = sel !== null && n >= sel.start && n <= sel.end;
							return (
								<div
									key={n}
									className={`fp-line ${active ? "sel" : ""}`}
									onMouseDown={(e) => {
										if (e.button !== 0) return;
										selectLine(n, e.shiftKey);
										draggingRef.current = true;
										setDragging(true);
									}}
									onMouseEnter={() => {
										if (draggingRef.current) selectLine(n, true);
									}}
								>
									<span className="fp-num">{n}</span>
									{codeHtml ? (
										<span
											className="fp-code-text hljs"
											// biome-ignore lint: highlightLines only ever returns
											// hljs's own escaped/span-wrapped output, never raw input.
											dangerouslySetInnerHTML={{
												__html: codeHtml[i] || "\u200b",
											}}
										/>
									) : (
										<span className="fp-code-text">{text}</span>
									)}
								</div>
							);
						})}
						{truncatedLines && (
							<div className="fp-lines-note">
								{t("previewLinesTruncated", { n: MAX_PREVIEW_LINES })}
							</div>
						)}
					</div>
				)}

				<div className="fp-foot fp-foot-compact">
					<button className="btn" onClick={handleClose} disabled={status === "saving"}>{t("backToFiles")}</button>
					<span className="fp-save-status" role="status">{kind === "sqlite" ? t("dbReadOnly") : status === "saving" ? t("fileSaving") : status === "failed" ? t("fileSaveFailed") : dirty ? t("fileUnsaved") : loaded ? t("fileSaved") : ""}</span>
					<details className="fp-more">
						<summary aria-label={t("fileMoreActions")}>···</summary>
						<div className="fp-more-actions">
						<button className="btn" disabled={disabled} onClick={() => { void downloadFile(file.path, file.name).then((r) => { if (!r.ok && !r.cancelled) setError(r.error); }); }}>{t("downloadFile")}</button>
						{isMarkdown && kind === "text" && !isBinary && loaded && (
							<button
								type="button"
								className={`fp-attach markdown ${markdownPreview ? "on" : ""}`}
								data-tip={
									markdownPreview
										? t("showMarkdownSource")
										: t("showMarkdownPreview")
								}
								disabled={disabled}
								onClick={() => setMarkdownPreview((value) => !value)}
							>
								{markdownPreview ? <FiEye /> : <FiCode />}
							</button>
						)}
						{kind === "text" && !isBinary && loaded && (
							<button
								type="button"
								className={`fp-attach edit ${editing ? "on" : ""}`}
								data-tip={
									truncated
										? t("fileEditTruncated")
										: editing
											? t("exitEditFile")
											: t("editFile")
								}
								disabled={!canEdit && !editing}
								onClick={toggleEditing}
							>
								<FiEdit3 />
							</button>
						)}
						{kind === "text" && !isBinary && !showMarkdown && (
							<button
								type="button"
								className={`fp-attach wrap ${wrap ? "on" : ""}`}
								data-tip={wrap ? t("disableWrap") : t("enableWrap")}
								onClick={() => setWrap((w) => !w)}
							>
								<FiCornerDownLeft />
							</button>
						)}
						{kind === "text" && loaded && (
							<span className="fp-zoom">
								<button
									type="button"
									className="fp-attach zoom-out"
									data-tip={t("zoomOut")}
									disabled={zoom <= 50}
									onClick={() => setZoomLevel(zoom - 10)}
								>
									<FiZoomOut />
								</button>
								<button
									type="button"
									className="fp-zoom-val"
									title={t("resetZoom")}
									onClick={() => setZoom(100)}
								>
									{zoom}%
								</button>
								<button
									type="button"
									className="fp-attach zoom-in"
									data-tip={t("zoomIn")}
									disabled={zoom >= 200}
									onClick={() => setZoomLevel(zoom + 10)}
								>
									<FiZoomIn />
								</button>
							</span>
						)}
						{kind !== "video" && kind !== "none" && kind !== "sqlite" && (
							<button
								type="button"
								className="fp-attach inline"
								data-tip={t("attachInlineTip")}
								disabled={disabled}
								onClick={() => onAttach(file.path, file.name, "inline")}
							>
								<FiPlus />
							</button>
						)}
						<button
							type="button"
							className="fp-attach ref"
							data-tip={t("referenceTip")}
							disabled={disabled}
							onClick={() => onAttach(file.path, file.name, "reference")}
						>
							<FiLink />
						</button>

						</div>
					</details>
					{canEdit && <button className="btn primary" disabled={!dirty || disabled || status === "saving"} onClick={() => saveEditing()}><FiSave /> {t("saveFile")}</button>}
					{!editing && !showMarkdown && kind === "text" && !isBinary && <div className="fp-selection-actions">
						<span>{sel ? t("selectedRange", { n: selCount, start: sel.start, end: sel.end }) : t("selectLinesHint")}</span>
						<button className="btn" disabled={!lines.length} onClick={selectAll}>{t("selectAll")}</button>
						<button className="btn" disabled={!sel} onClick={() => setSel(null)}>{t("clearSelection")}</button>
						<button className="btn" disabled={!sel || disabled} onClick={addToChat}>{added ? <FiCheck /> : null}{added ? t("addedToChat") : t("addToChat")}</button>
					</div>}
				</div>
			</div>
		</div>
	);
});

/** Optional modal shell for consumers outside the sidebar. */
export function FilePreview(props: FilePreviewProps) {
	return <div className="fp-overlay"><FilePreviewContent {...props} /></div>;
}

function isMarkdownFile(name: string): boolean {
	const lower = name.toLowerCase();
	return lower.endsWith(".md") || lower.endsWith(".markdown");
}
