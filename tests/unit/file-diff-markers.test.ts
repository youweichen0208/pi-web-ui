import { describe, expect, it } from "vitest";
import { fileDiffMarkers } from "../../web/src/file-diff-markers.js";

describe("fileDiffMarkers", () => {
	it("marks additions, replacements and deletions at new-file lines", () => {
		const diff = [
			"diff --git a/code.ts b/code.ts", "--- a/code.ts", "+++ b/code.ts",
			"@@ -2,5 +2,5 @@", " context", "-old", "+new", "+extra", " next", "-removed", " final",
		].join("\n");
		expect([...fileDiffMarkers(diff)]).toEqual([[3, "changed"], [4, "added"], [6, "deleted"]]);
	});
});
