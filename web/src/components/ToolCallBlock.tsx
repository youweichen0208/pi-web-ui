import { memo, useEffect, useState } from "react";
import {
	FiCheckCircle,
	FiChevronDown,
	FiChevronRight,
	FiChevronsDown,
	FiChevronsUp,
	FiCopy,
	FiMaximize2,
	FiSquare,
	FiTerminal,
	FiX,
} from "react-icons/fi";
import type { ToolStatus, UiMessage, UiToolCallBlock } from "../types";
import { useT } from "../i18n";
import { Markdown } from "./Markdown";
import { highlightLine } from "../hljs-lite";

export interface ToolView {
	/** Tool result message if the tool already finished. */
	result?: UiMessage;
	/** Live output accumulated from tool_delta while running. */
	liveOutput?: string;
	/** True when the session is streaming (tool may still be running). */
	streaming: boolean;
	/** Set the moment tool_execution_end fires (tool_status) — the command
	 *  exited but the model hasn't responded yet. */
	status?: ToolStatus;
}

/** Kill just the running bash command(s) — the agent run itself continues. */
export type KillBashHandler = () => void;

const TOOL_ICONS: Record<string, string> = {
	bash: "$",
	read: "📄",
	write: "✍️",
	edit: "✏️",
	grep: "🔍",
	find: "🧭",
	ls: "📂",
};

function toolIcon(name: string): string {
	return TOOL_ICONS[name] ?? "🛠";
}

/** True when this is a `read` tool call whose target path is a Markdown
 *  file — its output reads much better rendered than as a raw <pre> dump. */
function isMarkdownReadTarget(block: UiToolCallBlock): boolean {
	if (block.name !== "read" || !block.argumentsText) return false;
	try {
		const args = JSON.parse(block.argumentsText) as { path?: unknown };
		return (
			typeof args.path === "string" && /\.(md|markdown)$/i.test(args.path)
		);
	} catch {
		return false;
	}
}

/** Extension → highlight.js language alias, for coloring a `read` tool's
 *  raw dump the same way a fenced code block in chat gets colored (only
 *  covers languages bundled by rehype-highlight's "common" set — anything
 *  else falls through unhighlighted via `ignoreMissing: true`, never errors). */
const EXT_LANG: Record<string, string> = {
	json: "json",
	jsonc: "json",
	ts: "typescript",
	mts: "typescript",
	cts: "typescript",
	tsx: "typescript",
	js: "javascript",
	mjs: "javascript",
	cjs: "javascript",
	jsx: "javascript",
	py: "python",
	rb: "ruby",
	go: "go",
	rs: "rust",
	java: "java",
	kt: "kotlin",
	kts: "kotlin",
	swift: "swift",
	c: "c",
	h: "c",
	cpp: "cpp",
	cc: "cpp",
	hpp: "cpp",
	cs: "csharp",
	php: "php",
	sql: "sql",
	css: "css",
	scss: "scss",
	less: "less",
	html: "xml",
	htm: "xml",
	xml: "xml",
	svg: "xml",
	yml: "yaml",
	yaml: "yaml",
	sh: "bash",
	bash: "bash",
	zsh: "bash",
	toml: "ini",
	ini: "ini",
	graphql: "graphql",
	gql: "graphql",
	lua: "lua",
	r: "r",
	makefile: "makefile",
	diff: "diff",
	patch: "diff",
};

/** hljs language for a file path by extension, or null when unrecognized. */
function langFromPath(path: string): string | null {
	const ext = path.split(/[\\/]/).pop()?.split(".").pop()?.toLowerCase();
	return (ext && EXT_LANG[ext]) || null;
}

/** hljs language for a `read` tool call's target path, or null when the
 *  path has no recognized extension (falls back to the plain <pre> dump —
 *  and to the dedicated Markdown-preview path above for .md/.markdown). */
function readTargetLanguage(block: UiToolCallBlock): string | null {
	if (block.name !== "read" || !block.argumentsText) return null;
	try {
		const args = JSON.parse(block.argumentsText) as { path?: unknown };
		return typeof args.path === "string" ? langFromPath(args.path) : null;
	} catch {
		return null;
	}
}

/** For a `write` tool call: the language for its target path, and the raw
 *  content it's about to write — so the args panel can show colored code
 *  instead of the raw `{"path":...,"content":...}` JSON blob. Null when this
 *  isn't a (parseable) write call. */
function writeTargetPreview(
	block: UiToolCallBlock,
): { lang: string | null; content: string } | null {
	if (block.name !== "write" || !block.argumentsText) return null;
	try {
		const args = JSON.parse(block.argumentsText) as {
			path?: unknown;
			content?: unknown;
		};
		if (typeof args.content !== "string") return null;
		const lang = typeof args.path === "string" ? langFromPath(args.path) : null;
		return { lang, content: args.content };
	} catch {
		return null;
	}
}

/** For an `edit` tool call: the language for its target path (drives the
 *  diff view's per-line syntax coloring). Null when unavailable. */
function editTargetLanguage(block: UiToolCallBlock): string | null {
	if (block.name !== "edit" || !block.argumentsText) return null;
	try {
		const args = JSON.parse(block.argumentsText) as { path?: unknown };
		return typeof args.path === "string" ? langFromPath(args.path) : null;
	} catch {
		return null;
	}
}

/** Shape of the `edit` tool's toolResult.details on success (see
 *  edit-diff.ts's generateDiffString — a plain-text, line-numbered diff:
 *  each line is `+`/`-`/` ` followed by a padded line number, a space, then
 *  the code). Absent/malformed on error results. */
interface EditDiffDetails {
	diff?: unknown;
}

/** The `edit` tool's diff text for this block's result, or null when this
 *  isn't a successful edit result (running/error/not-an-edit-call). */
function editResultDiff(block: UiToolCallBlock, view: ToolView): string | null {
	if (block.name !== "edit" || !view.result || view.result.isError) return null;
	const details = view.result.details as EditDiffDetails | undefined;
	return typeof details?.diff === "string" ? details.diff : null;
}

/** One parsed line of the edit tool's diff text (see EditDiffDetails). */
interface DiffLine {
	marker: "+" | "-" | " ";
	lineNum: string;
	code: string;
}

const DIFF_LINE_RE = /^([+\- ])(\s*\d+) (.*)$/;

function parseDiffLines(diff: string): DiffLine[] {
	return diff.split("\n").map((raw) => {
		const m = DIFF_LINE_RE.exec(raw);
		if (!m) return { marker: " " as const, lineNum: "", code: raw };
		return { marker: m[1] as "+" | "-" | " ", lineNum: m[2], code: m[3] };
	});
}

/** The edit tool's own diff (see EditDiffDetails), rendered as colored
 *  +/- lines with per-line syntax highlighting — same green/red convention
 *  as the git diff viewer in SCMPanel.tsx (.scm-diff-line), but this one
 *  also tokenizes each line's code the way a fenced code block would. */
function DiffView({ diff, lang }: { diff: string; lang: string | null }) {
	const lines = parseDiffLines(diff);
	return (
		<div className="toolcall-diff">
			{lines.map((ln, i) => (
				<div
					key={i}
					className={`toolcall-diff-line ${ln.marker === "+" ? "add" : ln.marker === "-" ? "del" : "ctx"}`}
				>
					<span className="toolcall-diff-gutter">
						{ln.marker}
						{ln.lineNum}
					</span>
					<code
						className="toolcall-diff-code hljs"
						// biome-ignore lint: highlightLine only ever returns hljs's own
						// escaped/span-wrapped output (see hljs-lite.ts), never raw input.
						dangerouslySetInnerHTML={{ __html: highlightLine(ln.code, lang) || "\u200b" }}
					/>
				</div>
			))}
		</div>
	);
}

/** Wrap raw text in a fenced code block, picking a fence long enough that it
 *  can't be broken by a run of backticks already inside the text (CommonMark
 *  fence rule: the fence must be longer than any backtick run it contains). */
function fenceCodeBlock(text: string, lang: string): string {
	const runs = text.match(/`+/g)?.map((r) => r.length) ?? [];
	const longestRun = runs.length ? Math.max(...runs) : 0;
	const fence = "`".repeat(Math.max(3, longestRun + 1));
	return `${fence}${lang}\n${text.replace(/\n$/, "")}\n${fence}`;
}

export const ToolCallBlock = memo(function ToolCallBlock({
	block,
	view,
	onKillBash,
	wrap = true,
}: {
	block: UiToolCallBlock;
	view: ToolView;
	/** Kill the running bash command (bash cards only, while running). */
	onKillBash?: KillBashHandler;
	/** 设置面板「完整显示工具」开关：true（开）→ 工具始终完整展开；
	 *  false（关）→ 默认折叠，点击展开。 */
	wrap?: boolean;
}) {
	const t = useT();
	const [open, setOpen] = useState(wrap);
	const [copied, setCopied] = useState(false);
	// Markdown files read by the `read` tool default to rendered preview,
	// same convention as the file preview panel (see FilePreview.tsx).
	const [markdownPreview, setMarkdownPreview] = useState(true);
	// Code/diff panes are height-capped (see .toolcall-code / .toolcall-diff /
	// .toolcall-output pre in styles.css) so a long write or read can't push
	// the whole conversation off screen. `expanded` lifts the cap in place;
	// `zoomed` throws the same content into a full-screen overlay.
	const [expanded, setExpanded] = useState(false);
	const [zoomed, setZoomed] = useState(false);
	useEffect(() => {
		if (!zoomed) return;
		const onKey = (e: KeyboardEvent) => {
			if (e.key === "Escape") setZoomed(false);
		};
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, [zoomed]);

	const running = !view.result && view.streaming && !view.status;
	const isBashRunning = block.name === "bash" && running;
	const done = view.result !== undefined;
	/** Command finished (tool_status fired) but the authoritative toolResult
	 *  message hasn't landed in a snapshot yet — the model is still chewing on
	 *  the result. */
	const waitingModel = !view.result && !!view.status;
	const isError = view.result?.isError ?? view.status?.isError ?? false;
	const isMarkdown = isMarkdownReadTarget(block);
	// Non-markdown `read` targets still get colored like a normal code block
	// when the extension maps to a known language — was a flat monochrome
	// <pre> dump before, unlike every other code block in the app.
	const codeLang = !isMarkdown && !isError ? readTargetLanguage(block) : null;
	// `write` calls: show the file content they're about to write as colored
	// code instead of the raw {"path":...,"content":...} JSON blob.
	const writePreview = writeTargetPreview(block);
	// `edit` calls: the diff the tool itself computed (server-side, already
	// line-numbered) — colored +/- with per-line syntax highlighting.
	const editDiff = editResultDiff(block, view);
	const editLang = editDiff ? editTargetLanguage(block) : null;

	const output = view.result
		? view.result.content.map((b) => (b.type === "text" ? b.text : "")).join("")
		: (view.liveOutput ?? "");

	const statusClass = isError ? "err" : done ? "ok" : running || waitingModel ? "run" : "idle";
	let statusLabel = isError
		? t("error")
		: done
			? t("done")
			: running
				? t("running")
				: waitingModel
					? t("toolDoneWaitingModel")
					: t("toolQueued");
	const duration =
		waitingModel && view.status?.durationMs !== undefined
			? formatDuration(view.status.durationMs)
			: "";
	if (waitingModel && duration) statusLabel = `${statusLabel} · ${duration}`;

	// tool_status doesn't carry the exit code for successful bash runs (only
	// failures embed "exited with code N" in the error text); show it when known.
	const exitHint =
		waitingModel && view.status?.exitCode !== undefined
			? `exit ${view.status.exitCode}`
			: "";

	const copyArgs = () => {
		if (block.argumentsText) {
			void navigator.clipboard.writeText(block.argumentsText);
			setCopied(true);
			setTimeout(() => setCopied(false), 1200);
		}
	};

	// Rendered in place *and* inside the zoom overlay — kept as one value so
	// the two views can never drift apart.
	const bodyContent = (
		<>
			{block.argumentsText && (
				<div className="toolcall-args">
					{block.name === "bash" && block.argumentsText.startsWith("{") ? (
						<TerminalCommand args={block.argumentsText} />
					) : writePreview ? (
						writePreview.lang ? (
							<div className="toolcall-code">
								<Markdown text={fenceCodeBlock(writePreview.content, writePreview.lang)} />
							</div>
						) : (
							<pre>{writePreview.content}</pre>
						)
					) : (
						<pre>{block.argumentsText}</pre>
					)}
				</div>
			)}
			{output.length > 0 && (
				<div className="toolcall-output">
					<div className="toolcall-output-label">
						{isError ? t("errorOutput") : t("output")}
						{(running || waitingModel) && (
							<span className="thinking-spinner" aria-hidden="true" />
						)}
						<span className="toolcall-output-spacer" />
						{isMarkdown && !isError && (
							<button
								type="button"
								className="toolcall-md-toggle"
								title={
									markdownPreview
										? t("showMarkdownSource")
										: t("showMarkdownPreview")
								}
								onClick={() => setMarkdownPreview((v) => !v)}
							>
								{markdownPreview ? t("showMarkdownSource") : t("showMarkdownPreview")}
							</button>
						)}
					</div>
					{editDiff ? (
						<DiffView diff={editDiff} lang={editLang} />
					) : isMarkdown && markdownPreview && !isError ? (
						<div className="toolcall-markdown">
							<Markdown text={output} />
						</div>
					) : codeLang ? (
						<div className="toolcall-code">
							<Markdown text={fenceCodeBlock(output, codeLang)} />
						</div>
					) : (
						<pre>{output}</pre>
					)}
				</div>
			)}
			{running && output.length === 0 && (
				<div className="toolcall-waiting">
					<span className="thinking-live-label">
						<span className="thinking-spinner" aria-hidden="true" />
						{t("waitingOutput")}
					</span>
				</div>
			)}
			{waitingModel && output.length === 0 && (
				<div className="toolcall-waiting">
					<span className="thinking-live-label">
						<span className="thinking-spinner" aria-hidden="true" />
						{t("waitingModel")}
					</span>
				</div>
			)}
		</>
	);

	return (
		<div className={`toolcall ${statusClass}`}>
			<div className="toolcall-head">
				<span className="toolcall-icon">{toolIcon(block.name)}</span>
				<span className="toolcall-name">{block.name}</span>
				<span className="toolcall-status">
					{statusLabel}
					{exitHint && <em className="toolcall-exit">{exitHint}</em>}
				</span>
				<span className="toolcall-spacer" />
				{isBashRunning && onKillBash && (
					<button
						type="button"
						className="toolcall-kill"
						title={t("stopBashTip")}
						onClick={onKillBash}
					>
						<FiSquare />
						<span>{t("stopBash")}</span>
					</button>
				)}
				{open && (
					<button
						type="button"
						className="toolcall-expand"
						title={expanded ? t("collapseCode") : t("expandCode")}
						onClick={() => setExpanded((v) => !v)}
					>
						{expanded ? <FiChevronsUp /> : <FiChevronsDown />}
					</button>
				)}
				<button
					type="button"
					className="toolcall-expand"
					title={t("zoomCode")}
					onClick={() => setZoomed(true)}
				>
					<FiMaximize2 />
				</button>
				<button
					type="button"
					className="toolcall-copy"
					title={t("copyArgs")}
					onClick={copyArgs}
				>
					{copied ? <FiCheckCircle /> : <FiCopy />}
				</button>
				<button
					type="button"
					className="toolcall-toggle"
					onClick={() => setOpen((v) => !v)}
				>
					{open ? <FiChevronDown /> : <FiChevronRight />}
				</button>
			</div>
			{open && (
				<div className={`toolcall-body ${expanded ? "expanded" : ""}`}>
					{bodyContent}
				</div>
			)}
			{zoomed && (
				// biome-ignore lint/a11y/useKeyWithClickEvents: Esc is handled on window
				<div className="modal-backdrop" onClick={() => setZoomed(false)}>
					{/* biome-ignore lint/a11y/useKeyWithClickEvents: backdrop-only affordance */}
					<div
						className="toolcall-zoom"
						role="dialog"
						aria-modal="true"
						onClick={(e) => e.stopPropagation()}
					>
						<div className="toolcall-zoom-head">
							<span className="toolcall-icon">{toolIcon(block.name)}</span>
							<span className="toolcall-name">{block.name}</span>
							<span className="toolcall-spacer" />
							<button
								type="button"
								className="toolcall-zoom-close"
								title={t("closeZoom")}
								onClick={() => setZoomed(false)}
							>
								<FiX />
							</button>
						</div>
						<div className="toolcall-body toolcall-zoom-body">{bodyContent}</div>
					</div>
				</div>
			)}
		</div>
	);
});

/** Pretty-print a bash tool call's arguments as a terminal line. */
function TerminalCommand({ args }: { args: string }) {
	let parsed: { command?: string; timeout?: number } | null = null;
	try {
		parsed = JSON.parse(args) as { command?: string; timeout?: number };
	} catch {
		return <pre>{args}</pre>;
	}
	if (typeof parsed.command !== "string") return <pre>{args}</pre>;
	return (
		<div className="termline">
			<FiTerminal className="termline-icon" />
			<code>{parsed.command}</code>
			{typeof parsed.timeout === "number" && (
				<span className="termline-timeout">⏱ {parsed.timeout}s</span>
			)}
		</div>
	);
}

/** "0.3s" / "12.0s" / "1m 05s" — for the tool_status duration hint. */
function formatDuration(ms?: number): string {
	if (ms === undefined) return "";
	const totalSec = ms / 1000;
	if (totalSec < 60) return `${totalSec.toFixed(1)}s`;
	const m = Math.floor(totalSec / 60);
	const s = Math.round(totalSec % 60);
	return `${m}m ${String(s).padStart(2, "0")}s`;
}
