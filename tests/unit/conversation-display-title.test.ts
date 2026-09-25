import { describe, expect, it } from "vitest";
import { conversationDisplayTitle } from "../../web/src/conversation-display-title.js";

describe("conversation display title", () => {
	it("localizes a completed unnamed greeting without changing a manual name", () => {
		expect(conversationDisplayTitle("hello", "hello", undefined, 2, "zh")).toBe("打招呼");
		expect(conversationDisplayTitle("hello", "hello", undefined, 1, "zh")).toBe("hello");
		expect(conversationDisplayTitle("hello", "hello", "My chat", 2, "zh")).toBe("My chat");
		expect(conversationDisplayTitle("hello", "hello", undefined, 2, "en")).toBe("hello");
	});
});
