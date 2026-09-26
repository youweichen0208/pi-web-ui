import { expect, it } from "vitest";
import { keepNonPreviewAttachments } from "../../web/src/preview-attachments.js";

it("drops whole-file references while retaining line ranges, folders and uploads", () => {
	const kept = keepNonPreviewAttachments([
		{ path: "a.ts", name: "a.ts", mode: "reference" },
		{ path: "b.ts", name: "b.ts", mode: "inline" },
		{ path: "a.ts", name: "a.ts", mode: "lines", lines: { start: 2, end: 4 } },
		{ path: "src", name: "src", mode: "reference", isDir: true },
		{ path: "", name: "upload.txt", mode: "inline", fileData: "dGVzdA==" },
	]);
	expect(kept.map((item) => item.name)).toEqual(["a.ts", "src", "upload.txt"]);
});
