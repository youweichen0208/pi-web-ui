/** Only trim search-result indentation, never whitespace in ordinary code output. */
export function compactSearchLine(line: string) {
	return line.replace(/^(\s*(?:[^:\s]+:)?\d+[:-])[ \t]+(?=\S)/, "$1 ");
}

/** Reuse grep's source line in the gutter instead of adding a second count. */
export function numberedOutputLine(raw: string, index: number, searchOutput = false): { number: string; text: string } {
	const match = searchOutput ? /^(?:([^:\s]+):)?(\d+)[:-]\s*(.*)$/.exec(raw) : null;
	return match
		? { number: match[2], text: match[1] ? `${match[1]}: ${match[3]}` : match[3] }
		: { number: String(index + 1), text: compactSearchLine(raw) };
}

export function isSearchCommand(argumentsText?: string): boolean {
	try {
		const command = (JSON.parse(argumentsText ?? "{}") as { command?: unknown }).command;
		return typeof command === "string" && /(?:^|[;&|(\s])(?:grep|rg)(?:\s|$)/.test(command);
	} catch { return false; }
}
export function differentCommandDirectory(argumentsText: string | undefined, cwd: string): string | null {
	try {
		const args = JSON.parse(argumentsText ?? "{}");
		const literal = typeof args.cwd === "string" ? args.cwd : typeof args.command === "string"
			? /^\s*cd\s+(?:"([^"$`]+)"|'([^']+)'|([^\s;&|$`]+))\s*&&/.exec(args.command)?.slice(1).find(Boolean) : undefined;
		if (!literal || /[$`*?]/.test(literal)) return null;
		const home = /^(\/(?:Users|home)\/[^/]+)/.exec(cwd)?.[1];
		const path = literal.startsWith("~/") && home ? home + literal.slice(1) : literal.startsWith("/") ? literal : `${cwd}/${literal}`;
		const parts: string[] = [];
		for (const part of path.split("/")) { if (part === "..") parts.pop(); else if (part && part !== ".") parts.push(part); }
		const normalized = "/" + parts.join("/");
		if (normalized === cwd.replace(/\/$/, "")) return null;
		return home && (normalized === home || normalized.startsWith(home + "/")) ? "~" + normalized.slice(home.length) : normalized;
	} catch { return null; }
}
