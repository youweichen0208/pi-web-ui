import { fork } from "node:child_process";
import { realpathSync, statSync } from "node:fs";
import { workspacePath } from "./files-service.js";
import type { SqlitePreviewData } from "./protocol.js";

export interface SqlitePreviewRequest { cwd: string; path: string; table?: string; offset: number }
let running = 0;

/** Queries run outside the chat process, with bounded concurrency and a hard deadline. */
export function readSqlitePreview(request: SqlitePreviewRequest, signal?: AbortSignal): Promise<SqlitePreviewData> {
	if (signal?.aborted) return Promise.reject(new Error("Request cancelled"));
	if (running >= 2) return Promise.reject(new Error("Database viewer is busy; retry shortly"));
	if (!Number.isSafeInteger(request.offset) || request.offset < 0 || request.offset > 10_000_000) return Promise.reject(new Error("Invalid page offset"));
	const root = realpathSync(request.cwd);
	const path = workspacePath(root, request.path);
	if (!path) throw new Error("Path outside workspace");
	const absolute = realpathSync(path.abs);
	if (!workspacePath(root, absolute) || !statSync(absolute).isFile()) throw new Error("Path outside workspace");
	return new Promise((resolve, reject) => {
		const workerUrl = new URL(import.meta.url.endsWith(".ts") ? "./sqlite-worker.ts" : "./sqlite-worker.js", import.meta.url);
		const child = fork(workerUrl, [], {
			stdio: ["ignore", "ignore", "pipe", "ipc"], serialization: "json",
			execArgv: process.execArgv.filter((arg) => !arg.startsWith("--watch")),
		});
		running++;
		// Consume experimental-runtime warnings without leaking paths into the UI.
		child.stderr?.resume();
		let settled = false;
		const finish = (error?: Error, data?: SqlitePreviewData) => {
			if (settled) return;
			settled = true;
			clearTimeout(timer);
			signal?.removeEventListener("abort", abort);
			child.kill("SIGKILL");
			if (error) reject(error); else resolve(data!);
		};
		const abort = () => finish(new Error("Request cancelled"));
		const timer = setTimeout(() => finish(new Error("Database query timed out")), 8000);
		child.once("exit", () => { running--; finish(new Error("Database reader stopped unexpectedly")); });
		child.once("error", (error) => finish(error));
		child.once("message", (message: { data?: SqlitePreviewData; error?: string }) => {
			if (message.data) finish(undefined, message.data);
			else finish(new Error(message.error || "Unable to read database"));
		});
		signal?.addEventListener("abort", abort, { once: true });
		if (signal?.aborted) abort();
		else child.send({ absolute, table: request.table, offset: request.offset });
	});
}
