import { describe, it, expect } from "vitest";
import { goalEventText, goalCompletedText, groupGoalEvents } from "../../web/src/goal-events.js";
import { buildCollapsedGroups } from "../../web/src/collapsed-groups.js";
import type { UiMessage } from "../../server/protocol.js";
const event = (id: string, goal = "Goal Buddy"): UiMessage => ({ id, role: "user", content: [{ type: "text", text: `【目标已设定】\n\n${goal}\n\n请现在开始实现这个目标。` }] });
describe("goal events", () => {
	it("merges adjacent repeats only, preserving raw messages", () => {
		const messages = [event("a"), event("b"), event("c"), event("d", "Other"), event("e")];
		const result = groupGoalEvents(messages);
		expect(result.groups.get("a")?.ids).toEqual(["a", "b", "c"]);
		expect(result.groups.size).toBe(3);
		expect(messages.length).toBe(5);
	});
	it("keeps normal text and breaks runs across replies", () => {
		const plain: UiMessage = { id: "p", role: "user", content: [{ type: "text", text: "【目标已设定】 just quoting" }] };
		expect(goalEventText(plain)).toBeNull();
		expect(groupGoalEvents([event("a"), plain, event("b")]).groups.size).toBe(2);
		expect([...buildCollapsedGroups([plain, event("a"), plain], 3, new Set()).groupAt.keys()]).toEqual([0, 2]);
	});
	it("renders the exact completed-goal envelope as a distinct event", () => {
		const completed: UiMessage = { id: "done", role: "user", content: [{ type: "text", text: "✅ 目标已达成并通过审查（第 2 轮）。\n\n目标：完成界面\n\n审查通过。\n\n（目标模式已解除，接下来按你的普通指令响应。）" }] };
		expect(goalCompletedText(completed)).toBe("完成界面");
		expect(groupGoalEvents([event("a"), completed]).groups.get("done")?.kind).toBe("complete");
		expect(groupGoalEvents([completed, { ...completed, id: "done-again" }]).groups.size).toBe(2);
		expect(goalCompletedText({ ...completed, content: [{ type: "text", text: "✅ 目标已完成" }] })).toBeNull();
	});
});
