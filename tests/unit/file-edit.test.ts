import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { FilesService, MAX_PREVIEW_BYTES } from "../../server/files-service.js";
import type { ServerMessage } from "../../server/protocol.js";

const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });
function fixture() {
	const cwd = mkdtempSync(join(tmpdir(), "file-edit-unit-"));
	roots.push(cwd);
	const messages: ServerMessage[] = [];
	const service = new FilesService({ getCwd: () => cwd, getActiveCwd: () => cwd, isDisposed: () => false, emit: (msg) => messages.push(msg) });
	writeFileSync(join(cwd, "a.txt"), "original");
	return { cwd, service, messages };
}
describe("versioned file editing", () => {
	it("acknowledges only successful writes and rejects stale versions, with explicit override", async () => {
		const { cwd, service, messages } = fixture();
		await service.readFile("a.txt", { cwd, requestId: "read" });
		const content = messages.at(-1);
		if (content?.type !== "file_content") throw new Error("missing content");
		expect(content.requestId).toBe("read");
		expect(content.version).toMatch(/^[a-f0-9]{64}$/);
		writeFileSync(join(cwd, "a.txt"), "external");
		await service.writeFile("a.txt", "draft", { cwd, requestId: "save", expectedVersion: content.version });
		expect(messages.at(-1)).toMatchObject({ type: "file_result", ok: false, conflict: true, requestId: "save", cwd, path: "a.txt" });
		expect(readFileSync(join(cwd, "a.txt"), "utf8")).toBe("external");
		await service.writeFile("a.txt", "draft", { cwd, force: true });
		expect(messages.at(-1)).toMatchObject({ ok: true });
		expect(readFileSync(join(cwd, "a.txt"), "utf8")).toBe("draft");
	});
	it("rejects wrong workspaces, missing files, traversal, binary and truncated files", async () => {
		const { cwd, service, messages } = fixture();
		await service.writeFile("a.txt", "bad", { cwd: cwd + "-other", force: true });
		expect(messages.at(-1)).toMatchObject({ ok: false });
		expect(readFileSync(join(cwd, "a.txt"), "utf8")).toBe("original");
		await service.readFile("missing", { cwd, requestId: "missing" });
		expect(messages.at(-1)).toMatchObject({ type: "file_result", operation: "read", ok: false, requestId: "missing" });
		for (const path of ["../outside", "binary", "large"]) {
			if (path === "binary") writeFileSync(join(cwd, path), Buffer.from([0, 1, 2]));
			if (path === "large") writeFileSync(join(cwd, path), "a".repeat(MAX_PREVIEW_BYTES + 1));
			await service.writeFile(path, "bad", { cwd, force: true });
			expect(messages.at(-1)).toMatchObject({ ok: false });
		}
	});
});
