import { expect, test } from "vitest";
import type { UiMessage } from "../../server/protocol.js";
import { conversationFileEntries, conversationFiles } from "../../web/src/conversation-files.js";
import { numberedOutputLine } from "../../web/src/bash-presentation.js";

test("conversation files include recent workspace tool targets and bash references", () => {
	const messages = [
		{ id: "1", role: "assistant", content: [{ type: "toolCall", id: "t1", name: "read", argumentsText: JSON.stringify({ path: "/tmp/work/CONTEXT.md" }) }] },
		{ id: "2", role: "assistant", content: [{ type: "toolCall", id: "t2", name: "bash", argumentsText: JSON.stringify({ command: "grep -n pattern .scratch/spec.md; cat ../other/private.md" }) }] },
	] as UiMessage[];
	expect(conversationFiles(messages, "/tmp/work")).toEqual([".scratch/spec.md", "CONTEXT.md"]);
	expect(conversationFileEntries(messages, "/tmp/work")).toEqual([{ path: ".scratch/spec.md", action: "grep" }, { path: "CONTEXT.md", action: "read" }]);
});

test("grep source lines replace generated output line numbers", () => {
	expect(numberedOutputLine("15:  匹配内容", 0, true)).toEqual({ number: "15", text: "匹配内容" });
	expect(numberedOutputLine("spec.md:27:  another match", 1, true)).toEqual({ number: "27", text: "spec.md: another match" });
	expect(numberedOutputLine("ordinary output", 2)).toEqual({ number: "3", text: "ordinary output" });
	expect(numberedOutputLine("12:34: started", 0)).toEqual({ number: "1", text: "12:34: started" });
});
