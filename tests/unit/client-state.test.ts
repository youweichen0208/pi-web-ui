import { afterEach, expect, it } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ClientStateStore, mergeProjectSummaries } from "../../server/client-state.js";

const roots: string[] = [];
afterEach(() => roots.splice(0).forEach((root) => rmSync(root, { recursive: true, force: true })));

function statePath(): string {
	const dir = mkdtempSync(join(tmpdir(), "client-state-"));
	roots.push(dir);
	return join(dir, "client-state.json");
}

it("keeps project order stable when re-opening an existing project", () => {
	const s = new ClientStateStore(statePath());
	s.remember("c", "/proj/a");
	s.remember("c", "/proj/b");
	s.remember("c", "/proj/a"); // re-open the older entry — must NOT jump to the front
	expect(s.get("c").projects.map((p) => p.path)).toEqual(["/proj/b", "/proj/a"]);
});

it("freezes legacy entries at their last-used time instead of reordering them", () => {
	const file = statePath();
	writeFileSync(file, JSON.stringify({ legacy: { projects: [
		{ path: "/old/x", lastUsed: 5000 },
		{ path: "/old/y", lastUsed: 1000 },
	] } }));
	const s = new ClientStateStore(file);
	s.remember("legacy", "/old/y");
	const projects = s.get("legacy").projects;
	expect(projects.map((p) => p.path)).toEqual(["/old/x", "/old/y"]);
	expect(projects[1].firstAdded).toBe(1000);
});

it("prepends brand-new projects and evicts the earliest-added beyond 30", () => {
	const s = new ClientStateStore(statePath());
	for (let i = 1; i <= 30; i++) s.remember("c", `/p/${i}`);
	s.remember("c", "/p/31");
	const projects = s.get("c").projects;
	expect(projects).toHaveLength(30);
	expect(projects[0].path).toBe("/p/31");
	expect(projects.some((p) => p.path === "/p/1")).toBe(false);
});

it("persists the stable order across store instances", () => {
	const file = statePath();
	const s1 = new ClientStateStore(file);
	s1.remember("c", "/a");
	s1.remember("c", "/b");
	s1.remember("c", "/a");
	const s2 = new ClientStateStore(file);
	expect(s2.get("c").projects.map((p) => p.path)).toEqual(["/b", "/a"]);
});

it("merges persisted and disk-discovered projects into a stable first-added order", () => {
	const saved = [
		{ path: "/persisted/new", lastUsed: 9000, firstAdded: 9000 },
		{ path: "/persisted/old", lastUsed: 8000 }, // legacy entry: no firstAdded yet
	];
	const disk = [
		{ path: "/persisted/old", lastUsed: 8000, firstAdded: 7000, conversationCount: 2 },
		{ path: "/disk/only", lastUsed: 6000, firstAdded: 5000, conversationCount: 1 },
		{ path: "/persisted/new", lastUsed: 9000, firstAdded: 1000, conversationCount: 0 },
		{ path: "/removed", lastUsed: 9500, firstAdded: 9500, conversationCount: 0 },
	];
	const merged = mergeProjectSummaries(saved, disk, new Set(["/removed"]));
	expect(merged.map((p) => p.path)).toEqual(["/persisted/new", "/persisted/old", "/disk/only"]);
	expect(merged[0].firstAdded).toBe(9000); // persisted entry wins over the disk anchor
	expect(merged[1].firstAdded).toBe(8000); // legacy fallback = its frozen lastUsed
	expect(merged[1].lastConversationAt).toBe(8000);
	expect(merged[1].conversationCount).toBe(2);
	expect(merged[2].lastUsed).toBe(6000);
});

it("keeps a disk-discovered project's displayed position after selecting it and reconnecting", () => {
	const file = statePath();
	const disk = [
		{ path: "/history/new", lastUsed: 3000, firstAdded: 3000, conversationCount: 1 },
		{ path: "/history/old", lastUsed: 2000, firstAdded: 1000, conversationCount: 1 },
	];
	const store = new ClientStateStore(file);
	const shown = mergeProjectSummaries(store.get("c").projects, disk, new Set());
	store.rememberDisplayedProjects("c", shown);
	store.remember("c", "/history/old");
	const reconnected = new ClientStateStore(file);
	expect(mergeProjectSummaries(reconnected.get("c").projects, disk, new Set()).map((p) => p.path))
		.toEqual(["/history/new", "/history/old"]);
	reconnected.remember("c", "/brand/new");
	expect(mergeProjectSummaries(reconnected.get("c").projects, disk, new Set()).map((p) => p.path))
		.toEqual(["/brand/new", "/history/new", "/history/old"]);
});

it("caps the merged project list at 20, dropping the earliest-added first", () => {
	const saved = Array.from({ length: 25 }, (_, i) => ({ path: `/p/${i}`, lastUsed: i, firstAdded: i }));
	const merged = mergeProjectSummaries(saved, [], new Set());
	expect(merged).toHaveLength(20);
	expect(merged[0].path).toBe("/p/24");
	expect(merged.at(-1)?.path).toBe("/p/5");
});
