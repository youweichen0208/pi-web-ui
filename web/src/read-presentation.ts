/** Parse a read tool's path without exposing its JSON arguments in the UI. */
export function readPath(argumentsText?: string): string | null {
	if (!argumentsText) return null;
	try {
		const value: unknown = JSON.parse(argumentsText);
		if (!value || typeof value !== "object" || !("path" in value)) return null;
		return typeof value.path === "string" ? value.path : null;
	} catch {
		return null;
	}
}

export function displayReadPath(path: string): string {
	const home = path.match(/^\/(?:Users|home)\/[^/]+(?=\/|$)/)?.[0];
	return home ? `~${path.slice(home.length)}` : path;
}

/** Keep YAML frontmatter out of Markdown rendering, where `---` can turn
 *  its first value into a giant setext heading. */
export function splitFrontmatter(text: string): { fields: { name: string; value: string }[]; body: string } {
	const lines = text.replace(/\r\n/g, "\n").split("\n");
	if (lines[0]?.trim() !== "---") return { fields: [], body: text };
	const end = lines.findIndex((line, index) => index > 0 && index < 50 && line.trim() === "---");
	if (end < 0) return { fields: [], body: text };
	const fields: { name: string; value: string }[] = [];
	for (const line of lines.slice(1, end)) {
		const match = /^([\w-]+):\s*(.*)$/.exec(line);
		if (match) fields.push({ name: match[1], value: match[2].replace(/^['"]|['"]$/g, "") });
		else if (/^\s+\S/.test(line) && fields.length) fields[fields.length - 1].value += ` ${line.trim()}`;
	}
	return { fields, body: lines.slice(end + 1).join("\n").trimStart() };
}
