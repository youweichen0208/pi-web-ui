export type FileDiffMarker = "added" | "changed" | "deleted";

/** Map a unified diff's new-file line numbers to editor gutter markers. */
export function fileDiffMarkers(diff: string): Map<number, FileDiffMarker> {
	const markers = new Map<number, FileDiffMarker>();
	let line = 0;
	let inHunk = false;
	let pendingDeletes = 0;
	const flushDeletes = () => {
		if (pendingDeletes && line > 0 && !markers.has(line)) markers.set(line, "deleted");
		pendingDeletes = 0;
	};
	for (const text of diff.split("\n")) {
		const hunk = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(text);
		if (hunk) {
			flushDeletes();
			line = Number(hunk[1]);
			inHunk = true;
			continue;
		}
		if (text.startsWith("diff --git ") || text.startsWith("--- ") || text.startsWith("+++ ")) {
			flushDeletes();
			inHunk = false;
			continue;
		}
		if (!inHunk) continue;
		if (text.startsWith("-")) { pendingDeletes++; continue; }
		if (text.startsWith("+")) {
			markers.set(line, pendingDeletes > 0 ? "changed" : "added");
			if (pendingDeletes > 0) pendingDeletes--;
			line++;
			continue;
		}
		flushDeletes();
		if (text.startsWith(" ")) line++;
	}
	flushDeletes();
	return markers;
}
