import { afterEach, expect, it } from "vitest";
import { DatabaseSync } from "node:sqlite";
import { mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { querySqlite } from "../../server/sqlite-query.js";
import { readSqlitePreview } from "../../server/sqlite-preview.js";
import { previewKind } from "../../server/text-sniff.js";

const roots: string[] = [];
afterEach(() => roots.splice(0).forEach((root) => rmSync(root, { recursive: true, force: true })));
function fixture() {
	const root = mkdtempSync(join(tmpdir(), "sqlite-preview-")); roots.push(root);
	const path = join(root, "graph.db");
	const db = new DatabaseSync(path);
	db.exec('CREATE TABLE "nodes" (id INTEGER PRIMARY KEY, name TEXT, payload BLOB, optional TEXT); CREATE TABLE "odd""table" ("x""y" TEXT); CREATE VIEW names AS SELECT id, name FROM nodes;');
	const insert = db.prepare("INSERT INTO nodes VALUES (?, ?, ?, ?)");
	for (let i = 0; i < 105; i++) insert.run(i + 1, i === 0 ? "x".repeat(300) : "node-" + i, new Uint8Array([0, 1, 255]), null);
	db.exec("INSERT INTO nodes VALUES (9223372036854775807, 'big integer', NULL, 'NULL')");
	db.close();
	return { root, path };
}
it("recognizes database extensions without treating them as editable text", () => {
	for (const name of ["graph.db", "graph.sqlite", "graph.SQLITE3", "graph.db3"]) expect(previewKind(name)).toBe("sqlite");
});
it("pages read-only rows, preserves int64 values and distinguishes NULL/BLOB/text", () => {
	const { path } = fixture();
	const before = readFileSync(path);
	const first = querySqlite(path, "nodes", 0);
	expect(first.rows).toHaveLength(50);
	expect(first.hasMore).toBe(true);
	expect(first.rows[0][1]).toMatchObject({ kind: "text", truncated: true });
	expect(first.rows[0][2]).toEqual({ kind: "blob", value: "3" });
	expect(first.rows[0][3]).toEqual({ kind: "null", value: "" });
	const last = querySqlite(path, "nodes", 100);
	expect(last.rows).toHaveLength(6);
	expect(last.hasMore).toBe(false);
	expect(last.rows.at(-1)?.[0].value).toBe("9223372036854775807");
	expect(last.rows.at(-1)?.[3]).toMatchObject({ kind: "text", value: "NULL" });
	expect(querySqlite(path, "names", 0).columns.map((c) => c.name)).toEqual(["id", "name"]);
	expect(querySqlite(path, 'odd"table', 0).columns[0].name).toBe('x"y');
	expect(() => querySqlite(path, 'nodes"; DROP TABLE nodes; --', 0)).toThrow();
	expect(readFileSync(path)).toEqual(before);
});
it("handles empty and malformed databases", () => {
	const { root } = fixture();
	const empty = join(root, "empty.sqlite");
	const db = new DatabaseSync(empty); db.exec("VACUUM"); db.close();
	expect(querySqlite(empty, undefined, 0).tables).toEqual([]);
	writeFileSync(join(root, "bad.db"), "not SQLite");
	expect(() => querySqlite(join(root, "bad.db"), undefined, 0)).toThrow("Not a SQLite");
});
it("rejects traversal and symlink escapes before spawning a reader", async () => {
	const a = fixture(), b = fixture();
	expect(() => readSqlitePreview({ cwd: a.root, path: "../outside.db", offset: 0 })).toThrow();
	symlinkSync(b.path, join(a.root, "escape.db"));
	expect(() => readSqlitePreview({ cwd: a.root, path: "escape.db", offset: 0 })).toThrow("outside workspace");
	await expect(readSqlitePreview({ cwd: a.root, path: "graph.db", offset: -1 })).rejects.toThrow("Invalid page");
});
