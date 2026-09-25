import type { UiMessage } from "../../server/protocol.js";

export interface ConversationFileEntry { path: string; action: "read" | "grep" | "used" }

/** Files explicitly named by tools in this conversation, newest first. */
export function conversationFileEntries(messages: UiMessage[], cwd: string): ConversationFileEntry[] {
	if (!cwd) return [];
	const seen = new Set<string>();
	const files: ConversationFileEntry[] = [];
	const add = (candidate: string, action: ConversationFileEntry["action"]) => {
		const path = candidate.replaceAll("\\", "/");
		const root = cwd.replaceAll("\\", "/").replace(/\/$/, "");
		const relative = path.startsWith(`${root}/`) ? path.slice(root.length + 1) : path;
		if (relative.startsWith("/") || relative.startsWith("~/") || relative.split("/").includes("..")) return;
		const clean = relative.replace(/^\.\//, "");
		if (!clean || seen.has(clean)) return;
		seen.add(clean);
		files.push({ path: clean, action });
	};
	for (const message of [...messages].reverse()) {
		for (const block of [...message.content].reverse()) {
			if (block.type !== "toolCall" || typeof block.argumentsText !== "string") continue;
			let args: { path?: unknown; command?: unknown };
			try { args = JSON.parse(block.argumentsText); } catch { continue; }
			if (typeof args.path === "string") add(args.path, block.name === "read" ? "read" : block.name === "grep" ? "grep" : "used");
			if (block.name === "bash" && typeof args.command === "string") {
				const action = /\b(?:grep|rg)\b/.test(args.command) ? "grep" : "read";
				const matches = args.command.matchAll(/(?:^|[\s'"=])((?:\.{0,2}\/|\/?[\w.-]+\/)*[\w.-]+\.(?:md|markdown|tsx?|jsx?|mjs|cjs|json|css|html|ya?ml|py|go|rs|sh|sql))(?![\w.-])/gi);
				for (const match of matches) add(match[1], action);
			}
		}
	}
	return files.slice(0, 12);
}

export function conversationFiles(messages: UiMessage[], cwd: string): string[] {
	return conversationFileEntries(messages, cwd).map((entry) => entry.path);
}
