import type { UiMessage } from "../../server/protocol.js";

const THIRTY_MINUTES = 30 * 60 * 1000;

/** Gap labels before visible messages, using the viewer's local time. */
export function messageTimeGaps(messages: readonly UiMessage[]): Map<number, string> {
	const gaps = new Map<number, string>();
	let previous: number | undefined;
	for (let index = 0; index < messages.length; index++) {
		const message = messages[index];
		if (message.role === "toolResult" || !message.timestamp) continue;
		const current = message.timestamp;
		if (previous !== undefined && current - previous > THIRTY_MINUTES) {
			const date = new Date(current);
			gaps.set(index, `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`);
		}
		previous = current;
	}
	return gaps;
}
