import { afterEach, expect, it } from "vitest";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { saveMarkdownImage, MAX_MARKDOWN_IMAGE_BYTES } from "../../server/markdown-images.js";
const roots: string[] = [];
afterEach(() => roots.splice(0).forEach((root) => rmSync(root, { recursive: true, force: true })));
function fixture() {
	const root = mkdtempSync(join(tmpdir(), "markdown-images-")); roots.push(root);
	mkdirSync(join(root, "docs"));
	writeFileSync(join(root, "docs/note.md"), "# Note");
	return root;
}
const png = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
it("stores separate durable images relative to the document", () => {
	const root = fixture();
	const a = saveMarkdownImage(root, "docs/note.md", png);
	const b = saveMarkdownImage(root, "docs/note.md", png);
	expect(a).toMatch(/^\.assets\/image-.*\.png$/);
	expect(a).not.toBe(b);
	expect(readFileSync(join(root, "docs", a))).toEqual(Buffer.from(png, "base64"));
	expect(readFileSync(join(root, "docs/note.md"), "utf8")).toBe("# Note");
});
it("rejects invalid images, oversized payloads and symlink escapes", () => {
	const root = fixture();
	for (const data of ["", "invalid!", Buffer.from("<svg/>").toString("base64"), "A".repeat(MAX_MARKDOWN_IMAGE_BYTES * 2)]) {
		expect(() => saveMarkdownImage(root, "docs/note.md", data)).toThrow();
	}
	const outside = fixture();
	symlinkSync(join(outside, "docs"), join(root, "docs/.assets"), "dir");
	expect(() => saveMarkdownImage(root, "docs/note.md", png)).toThrow("outside workspace");
	expect(() => saveMarkdownImage(root, "../outside.md", png)).toThrow();
});
