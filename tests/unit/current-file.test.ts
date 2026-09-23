import { afterEach, expect, it } from "vitest";
import { mkdtempSync, writeFileSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { validateEditorSnapshots } from "../../server/editor-snapshot.js";
import { mergeCurrentFile } from "../../web/src/current-file.js";
import { collectQuestionAttachments } from "../../web/src/question-attachments.js";
const roots: string[] = [];
afterEach(() => roots.splice(0).forEach((root) => rmSync(root, { recursive: true, force: true })));
function fixture() {
	const cwd = mkdtempSync(join(tmpdir(), "editor-context-")); roots.push(cwd);
	writeFileSync(join(cwd, "note.txt"), "disk");
	return { cwd, att: { path: "note.txt", editorSnapshot: { cwd, text: "真实草稿", dirty: true, version: "known" } } };
}
it("validates UTF-8 size, workspace, binary, traversal and symlink boundaries", () => {
	const { cwd, att } = fixture();
	expect(() => validateEditorSnapshots(cwd, [att])).not.toThrow();
	for (const editorSnapshot of [{ ...att.editorSnapshot, cwd: cwd + "other" }, { ...att.editorSnapshot, text: "中".repeat(180000) }, { ...att.editorSnapshot, text: "\0" }]) {
		expect(() => validateEditorSnapshots(cwd, [{ ...att, editorSnapshot }])).toThrow();
	}
	const other = fixture();
	symlinkSync(join(other.cwd, "note.txt"), join(cwd, "escape.txt"));
	for (const path of ["../outside.txt", "escape.txt"]) expect(() => validateEditorSnapshots(cwd, [{ ...att, path }])).toThrow();
	writeFileSync(join(cwd, "binary.txt"), Buffer.from([0, 1]));
	expect(() => validateEditorSnapshots(cwd, [{ ...att, path: "binary.txt" }])).toThrow();
});
it("overrides whole-file attachments but retains selections and recovers historical text", () => {
	const { att } = fixture();
	const lines = { path: "note.txt", mode: "lines" as const, lines: { start: 1, end: 1 } };
	expect(mergeCurrentFile([{ path: "./note.txt", mode: "reference" }, lines], att)).toEqual([lines, att]);
	const restored = collectQuestionAttachments([
		{ id: "q", role: "user", content: [] },
		{ role: "custom", customType: "file", content: [], details: { path: att.path, mode: "inline", editorSnapshot: att.editorSnapshot } },
	]);
	expect(restored.get("q")?.[0].editorSnapshot).toEqual(att.editorSnapshot);
});
