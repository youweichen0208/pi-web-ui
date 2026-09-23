import { describe, it, expect, vi } from "vitest";
import { ProjectCache } from "../../web/src/project-cache.js";
import { QueryCache } from "../../server/query-cache.js";

describe("project display cache", () => {
	it("evicts least recently used projects and rejects oversized entries", () => {
		const cache = new ProjectCache<string>(2, 30);
		cache.set("a", "a"); cache.set("b", "b"); cache.get("a"); cache.set("c", "c");
		expect(cache.get("b")).toBeUndefined();
		expect(cache.get("a")).toBe("a");
		cache.set("a", "x".repeat(30));
		expect(cache.get("a")).toBeUndefined();
		expect(cache.get("c")).toBe("c");
	});
	it("enforces the total byte budget", () => {
		const cache = new ProjectCache<string>(3, 16);
		cache.set("a", "aa"); cache.set("b", "bb"); cache.set("c", "cc");
		expect(cache.get("a")).toBeUndefined();
		expect(cache.get("b")).toBe("bb");
	});
});

describe("query cache", () => {
	it("bounds workspace entries and retains recently accessed results", async () => {
		const cache = new QueryCache<number>(5000, 2);
		const scan = vi.fn(async () => 1);
		await cache.get("a", scan);
		await cache.get("b", scan);
		await cache.get("a", scan);
		await cache.get("c", scan);
		expect(scan).toHaveBeenCalledTimes(3);
		await cache.get("a", scan);
		expect(scan).toHaveBeenCalledTimes(3);
		await cache.get("b", scan);
		expect(scan).toHaveBeenCalledTimes(4);
	});

	it("shares scans, returns stale data and publishes a refresh", async () => {
		const cache = new QueryCache<number>(0);
		let finish!: (n: number) => void;
		const scan = vi.fn(() => new Promise<number>((resolve) => { finish = resolve; }));
		const a = cache.get("a", scan); const b = cache.get("a", scan);
		expect(scan).toHaveBeenCalledTimes(1);
		finish(1); expect(await a).toBe(1); expect(await b).toBe(1);
		const refresh = vi.fn();
		expect(await cache.get("a", scan, refresh)).toBe(1);
		finish(2); await Promise.resolve(); await Promise.resolve();
		expect(refresh).toHaveBeenCalledWith(2);
	});
	it("invalidated scans cannot repopulate the cache", async () => {
		const cache = new QueryCache<number>(5000);
		let finish!: (n: number) => void;
		const old = cache.get("a", () => new Promise<number>((r) => { finish = r; }));
		cache.clear();
		expect(await cache.get("a", async () => 2)).toBe(2);
		finish(1); await old;
		expect(await cache.get("a", async () => 3)).toBe(2);
	});
});
