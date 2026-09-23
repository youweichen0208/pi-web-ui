import { afterEach, describe, expect, it, vi } from "vitest";
import { ConversationTitleJob, completedTitleTurn, isTitleSmallTalk } from "../../server/conversation-title.js";

afterEach(() => vi.useRealTimers());

describe("conversation titles", () => {
	it("skips greetings but preserves tasks introduced with a greeting", () => {
		expect(isTitleSmallTalk("你好！")).toBe(true);
		expect(isTitleSmallTalk("Hello!")).toBe(true);
		expect(isTitleSmallTalk("你好，帮我优化切换速度")).toBe(false);
	});
	it("uses the completed user/assistant pair, excluding thinking and tools", () => {
		expect(completedTitleTurn([
			{ role: "user", content: "你好" },
			{ role: "assistant", content: "你好", stopReason: "stop" },
			{ role: "user", content: [{ type: "text", text: "优化切换" }] },
			{ role: "toolResult", content: "private tool output" },
			{ role: "assistant", stopReason: "stop", content: [{ type: "thinking", thinking: "private" }, { type: "text", text: "已缓存项目" }] },
		])).toEqual({ question: "优化切换", answer: "已缓存项目" });
		for (const stopReason of ["error", "aborted", "toolUse"]) {
			expect(completedTitleTurn([{ role: "user", content: "task" }, { role: "assistant", content: "partial", stopReason }])).toBeNull();
		}
	});
	it("defers greetings, then generates once using both sides of the conversation", async () => {
		const job = new ConversationTitleJob(true);
		const generate = vi.fn(async () => "优化项目切换");
		const save = vi.fn();
		await job.complete("你好", "你好", generate, save);
		expect(generate).not.toHaveBeenCalled();
		await job.complete("切换太慢", "添加缓存", generate, save);
		expect(generate.mock.calls[0]).toEqual([expect.stringContaining("切换太慢\n\nAssistant response:\n添加缓存"), expect.any(AbortSignal)]);
		await job.complete("another task", "answer", generate, save);
		expect(save).toHaveBeenCalledExactlyOnceWith("优化项目切换");
	});
	it("protects manual names even when unchanged, and cancels pending work", async () => {
		const job = new ConversationTitleJob(true);
		let resolve!: (value: string) => void;
		let signal!: AbortSignal;
		const save = vi.fn();
		const pending = job.complete("task", "answer", (_, s) => {
			signal = s;
			return new Promise<string>((r) => { resolve = r; });
		}, save);
		job.lock();
		expect(signal.aborted).toBe(true);
		resolve("late title");
		await pending;
		expect(save).not.toHaveBeenCalled();
	});
	it("does not rename restored named sessions", async () => {
		const generate = vi.fn();
		await new ConversationTitleJob(false).complete("task", "answer", generate, vi.fn());
		expect(generate).not.toHaveBeenCalled();
	});
	it("bounds failed or deferred attempts and clears timers", async () => {
		vi.useFakeTimers();
		const job = new ConversationTitleJob(true);
		const generate = vi.fn(async () => "__DEFER__");
		const save = vi.fn();
		for (let i = 0; i < 5; i++) await job.complete("vague topic", "answer", generate, save);
		expect(generate).toHaveBeenCalledTimes(3);
		expect(save).not.toHaveBeenCalled();
		expect(vi.getTimerCount()).toBe(0);
	});
	it("deduplicates in-flight requests and ignores results after timeout", async () => {
		vi.useFakeTimers();
		const job = new ConversationTitleJob(true);
		let resolve!: (value: string) => void;
		const generate = vi.fn(() => new Promise<string>((r) => { resolve = r; }));
		const save = vi.fn();
		const pending = job.complete("task", "answer", generate, save);
		await job.complete("task 2", "answer", generate, save);
		expect(generate).toHaveBeenCalledTimes(1);
		await vi.advanceTimersByTimeAsync(20_000);
		resolve("late title");
		await pending;
		expect(save).not.toHaveBeenCalled();
		expect(vi.getTimerCount()).toBe(0);
	});
});
