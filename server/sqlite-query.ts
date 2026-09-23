import { DatabaseSync } from "node:sqlite";
import { closeSync, openSync, readSync } from "node:fs";
import type { SqlitePreviewData, SqliteCell } from "./protocol.js";

const PAGE_SIZE = 50;
const MAX_COLUMNS = 64;
const MAX_CELL_TEXT = 256;
function identifier(name: string): string { return '"' + name.replace(/"/g, '""') + '"'; }

/** Only fixed, parameterized read queries; no user SQL or extension loading. */
export function querySqlite(absolute: string, table: string | undefined, offset: number): SqlitePreviewData {
	const fd = openSync(absolute, "r");
	const header = Buffer.alloc(16);
	try { readSync(fd, header, 0, 16, 0); } finally { closeSync(fd); }
	if (header.toString("utf8") !== "SQLite format 3\0") throw new Error("Not a SQLite database (encrypted databases are not supported)");
	const db = new DatabaseSync(absolute, { readOnly: true, allowExtension: false, timeout: 200 });
	try {
		db.exec("PRAGMA query_only=ON; PRAGMA trusted_schema=OFF; PRAGMA temp_store=MEMORY; BEGIN");
		const allTables = db.prepare("SELECT name, type, sql FROM sqlite_schema WHERE type IN ('table','view') AND name NOT LIKE 'sqlite_%' ORDER BY name LIMIT 501").all();
		const tables = allTables.slice(0, 500).map((row) => ({ name: String(row.name), type: row.type === "view" ? "view" as const : "table" as const }));
		const chosen = table === undefined ? tables[0]?.name : table;
		const selected = allTables.find((row) => row.name === chosen);
		const base = { tables, tablesTruncated: allTables.length > 500, offset, pageSize: PAGE_SIZE };
		if (chosen === undefined) return { ...base, table: null, schema: "", columns: [], columnsTruncated: false, rows: [], hasMore: false };
		if (!selected || !tables.some((entry) => entry.name === chosen)) throw new Error("Table or view no longer exists");
		try {
			const info = db.prepare("SELECT name, type, pk FROM pragma_table_xinfo(?) WHERE hidden != 1 ORDER BY cid LIMIT 65").all(chosen);
			const columns = info.slice(0, MAX_COLUMNS).map((column) => ({ name: String(column.name), type: String(column.type || ""), primaryKey: Number(column.pk) }));
			if (!columns.length) throw new Error("No readable columns");
			const projection = columns.flatMap((column, index) => {
				const name = identifier(column.name);
				return [
					`CASE typeof(${name}) WHEN 'blob' THEN NULL WHEN 'text' THEN substr(${name},1,${MAX_CELL_TEXT + 1}) ELSE ${name} END AS v${index}`,
					`typeof(${name}) AS t${index}`,
					`CASE WHEN typeof(${name})='blob' THEN length(${name}) END AS b${index}`,
				];
			}).join(",");
			const keys = columns.filter((column) => column.primaryKey).sort((a, b) => a.primaryKey - b.primaryKey);
			const order = keys.length ? " ORDER BY " + keys.map((column) => identifier(column.name)).join(",") : "";
			const statement = db.prepare(`SELECT ${projection} FROM ${identifier(chosen)}${order} LIMIT ? OFFSET ?`);
			statement.setReadBigInts(true);
			const records = statement.all(PAGE_SIZE + 1, offset);
			const rows = records.slice(0, PAGE_SIZE).map((record) => columns.map((_, index): SqliteCell => {
				const kind = record[`t${index}`];
				if (kind === "null") return { kind: "null", value: "" };
				if (kind === "blob") return { kind: "blob", value: String(record[`b${index}`] ?? 0) };
				const value = String(record[`v${index}`] ?? "");
				return { kind: kind === "integer" || kind === "real" ? "number" : "text", value: value.slice(0, MAX_CELL_TEXT), truncated: value.length > MAX_CELL_TEXT };
			}));
			return { ...base, table: chosen, schema: String(selected.sql ?? "").slice(0, 16384), columns, columnsTruncated: info.length > MAX_COLUMNS, rows, hasMore: records.length > PAGE_SIZE };
		} catch (error) {
			return { ...base, table: chosen, schema: String(selected.sql ?? "").slice(0, 16384), columns: [], columnsTruncated: false, rows: [], hasMore: false, queryError: (error as Error).message };
		}
	} finally { db.close(); }
}
