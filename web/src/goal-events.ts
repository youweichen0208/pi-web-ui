import type { UiMessage } from "../../server/protocol.js";

/** Exact legacy goal-service prompt envelope; ordinary user text stays a message. */
export function goalEventText(message: UiMessage): string | null {
	if (message.role !== "user" || message.content.some((block) => block.type !== "text")) return null;
	const text = message.content.map((block) => block.type === "text" ? block.text : "").join("\n");
	return /^【目标已设定】\n\n([\s\S]+)\n\n请现在开始实现这个目标。$/.exec(text)?.[1].trim() || null;
}

export function goalCompletedText(message: UiMessage): string | null {
	if (message.role !== "user" || message.content.some((block) => block.type !== "text")) return null;
	const text = message.content.map((block) => block.type === "text" ? block.text : "").join("\n");
	return /^✅ 目标已达成并通过审查（第 \d+ 轮）。\n\n目标：(.+)\n\n[\s\S]+\n\n（目标模式已解除，接下来按你的普通指令响应。）$/.exec(text)?.[1].trim() || null;
}

/** Coalesce only adjacent identical events; never discard intervening conversation. */
export function groupGoalEvents(messages: UiMessage[]) {
	const groups = new Map<string, { text: string; kind: "set" | "complete"; ids: string[] }>();
	const absorbed = new Set<string>();
	let previous: { text: string; kind: "set" | "complete"; ids: string[] } | undefined;
	for (const message of messages) {
		const set = goalEventText(message);
		const text = set ?? goalCompletedText(message);
		if (!text) { previous = undefined; continue; }
		const kind = set ? "set" : "complete";
		if (kind === "set" && previous?.text === text && previous.kind === kind) {
			previous.ids.push(message.id);
			absorbed.add(message.id);
		} else {
			previous = { text, kind, ids: [message.id] };
			groups.set(message.id, previous);
		}
	}
	return { groups, absorbed };
}
