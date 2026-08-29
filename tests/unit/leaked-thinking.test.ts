import { describe, expect, it } from "vitest";
import { splitLeakedThinking } from "../../web/src/leaked-thinking.js";

describe("splitLeakedThinking", () => {
	it("无 </think> 标签时返回 null", () => {
		expect(splitLeakedThinking("普通回复文本")).toBeNull();
	});

	it("单个孤立 </think>：之前的内容折叠，之后的正常显示", () => {
		const r = splitLeakedThinking("some reasoning...\n</think>\n真正的回复");
		expect(r).not.toBeNull();
		expect(r!.leaked).toBe("some reasoning...\n</think>");
		expect(r!.visible).toBe("真正的回复");
	});

	it("多个重复的 </think>：全部折叠到最后一个为止", () => {
		const r = splitLeakedThinking(
			"</think>\nfoo\n</think> </think>\nbar\n</think>\n最终答案",
		);
		expect(r).not.toBeNull();
		expect(r!.leaked.endsWith("</think>")).toBe(true);
		expect(r!.visible).toBe("最终答案");
	});

	it("整段都是泄露内容、</think> 后无剩余文本时 visible 为空字符串", () => {
		const r = splitLeakedThinking("leaked reasoning\n</think>");
		expect(r).not.toBeNull();
		expect(r!.visible).toBe("");
	});

	it("<thinking>...</thinking>（非 <think> 拼法）也能识别", () => {
		const r = splitLeakedThinking(
			"<thinking> some reasoning </thinking>\n真正的回复",
		);
		expect(r).not.toBeNull();
		expect(r!.leaked).toBe("<thinking> some reasoning </thinking>");
		expect(r!.visible).toBe("真正的回复");
	});

	it("同一段文字里混用 </think> 和 </thinking>：切到最后一个为止", () => {
		const r = splitLeakedThinking(
			"foo </think> <thinking>bar</thinking> 最终答案",
		);
		expect(r).not.toBeNull();
		expect(r!.leaked).toBe("foo </think> <thinking>bar</thinking>");
		expect(r!.visible).toBe("最终答案");
	});

	it("Kimi 风格 </antThinking>（大小写混合）也能识别", () => {
		const r = splitLeakedThinking(
			"reasoning...\n</antThinking>\n真正的回复",
		);
		expect(r).not.toBeNull();
		expect(r!.leaked).toBe("reasoning...\n</antThinking>");
		expect(r!.visible).toBe("真正的回复");
	});

	it("混用 </antThinking> 和 </think>：切到最后一个为止", () => {
		const r = splitLeakedThinking(
			"foo </antThinking> bar </think> 最终答案",
		);
		expect(r).not.toBeNull();
		expect(r!.leaked).toBe("foo </antThinking> bar </think>");
		expect(r!.visible).toBe("最终答案");
	});
});
