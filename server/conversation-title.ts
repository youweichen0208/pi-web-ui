/** Only exact small-talk messages are skipped; a greeting followed by a task is valid. */
export function isTitleSmallTalk(text: string): boolean {
	return /^(你好|您好|嗨|哈喽|早上好|晚上好|谢谢|好的|好|hi|hello|hey|thanks|thank you|ok|okay)[\s!！。.?,，？]*$/i.test(text.trim());
}

export function completedTitleTurn(messages: readonly unknown[]): { question: string; answer: string } | null {
	let question = "";
	let answer = "";
	for (const value of messages) {
		if (!value || typeof value !== "object") continue;
		const m = value as { role?: string; content?: unknown; stopReason?: string };
		const text = typeof m.content === "string" ? m.content : Array.isArray(m.content)
			? m.content.filter((p) => p?.type === "text" && typeof p.text === "string").map((p) => p.text).join("\n") : "";
		if (m.role === "user") {
			question = text;
			answer = "";
		} else if (m.role === "assistant") {
			answer = m.stopReason === "stop" || m.stopReason === "length" ? text : "";
		}
	}
	return question.trim() && answer.trim() ? { question, answer } : null;
}

/** One bounded background naming job per conversation. No transcript is retained. */
export class ConversationTitleJob {
	private locked: boolean;
	private attempts = 0;
	private pending?: AbortController;

	constructor(enabled: boolean) {
		this.locked = !enabled;
	}

	lock(): void {
		this.locked = true;
		this.pending?.abort();
	}

	async complete(
		question: string,
		answer: string,
		generate: (context: string, signal: AbortSignal) => Promise<string | null>,
		save: (title: string) => void,
	): Promise<void> {
		if (this.locked || this.pending || this.attempts >= 3 || !question.trim() || !answer.trim() || isTitleSmallTalk(question)) return;
		this.attempts++;
		const controller = new AbortController();
		this.pending = controller;
		const timeout = setTimeout(() => controller.abort(), 20_000);
		const clear = () => clearTimeout(timeout);
		controller.signal.addEventListener("abort", clear, { once: true });
		try {
			const title = await generate(`User request:\n${question.slice(0, 4000)}\n\nAssistant response:\n${answer.slice(0, 4000)}`, controller.signal);
			if (!this.locked && !controller.signal.aborted && title && title !== "__DEFER__") {
				save(title);
				this.locked = true;
			}
		} catch {
			// Keep the temporary title; a later successful turn may retry.
		} finally {
			clear();
			controller.signal.removeEventListener("abort", clear);
			this.pending = undefined;
		}
	}
}
