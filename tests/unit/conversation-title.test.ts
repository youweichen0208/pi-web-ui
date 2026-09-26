import { afterEach, describe, expect, it, vi } from "vitest";
import { ConversationTitleJob, completedTitleTurn } from "../../server/conversation-title.js";

afterEach(() => vi.useRealTimers());

describe("conversation titles", () => {
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
	it("waits for a substantive request after a casual greeting", async () => {
		const job = new ConversationTitleJob(true);
		const generate = vi.fn(async () => "Project work");
		const save = vi.fn();
		await job.complete("hello", "Hello!", generate, save);
		await job.complete("another task", "answer", generate, save);
		expect(generate).toHaveBeenCalledOnce();
		expect(save).toHaveBeenCalledExactlyOnceWith("Project work");
	});
	it("rejects a long English title for a Chinese first message", async () => {
		const save = vi.fn();
		await new ConversationTitleJob(true).complete("优化项目切换速度", "已优化", async () => "Improving Project Switching Performance", save);
		expect(save).toHaveBeenCalledOnce();
		const title = save.mock.calls[0][0];
		expect(title).toMatch(/[\p{Script=Han}]/u);
		expect(Array.from(title).length).toBeLessThanOrEqual(12);
	});
	it("keeps the first request's language across a deferred title attempt", async () => {
		const job = new ConversationTitleJob(true);
		const save = vi.fn();
		await job.complete("优化项目切换", "稍后", async () => "__DEFER__", save);
		await job.complete("Please continue", "已完成", async () => "Improving Switching", save);
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
