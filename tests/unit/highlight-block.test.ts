import { describe, expect, it } from "vitest";
import { unified } from "unified";
import remarkParse from "remark-parse";
import { remarkHighlightBlock } from "../../web/src/remark-highlight-block.js";

const renderTree = (text: string) => {
	const processor = unified().use(remarkParse).use(remarkHighlightBlock);
	const tree = processor.parse(text);
	processor.runSync(tree);
	return tree;
};

describe("Markdown highlight blocks", () => {
	it("recognizes notes while preserving inline formatting and paragraphs", () => {
		const tree = renderTree("> [!NOTE]\n> A **bold** example.\n>\n> Another paragraph.");
		const note = tree.children[0];
		expect(note.data).toMatchObject({ hProperties: { className: ["rich-highlight"], "data-rich-highlight": "note" } });
		expect(JSON.stringify(note)).not.toContain('"value":"[!NOTE]');
		expect(JSON.stringify(note)).toContain('"type":"strong"');
		if (note.type !== "blockquote") throw new Error("Expected blockquote");
		expect(note.children).toHaveLength(2);
	});
	it("leaves ordinary quotes, code and literal markers unchanged", () => {
		for (const text of ["> Ordinary quote", "> [!NOTE] inline text", "[!NOTE]", "```\n> [!NOTE]\n```", "> `[!NOTE]`\n> literal"]) {
			expect(JSON.stringify(renderTree(text))).not.toContain("rich-highlight");
		}
	});
	it("supports an empty note and notes nested in lists", () => {
		expect(JSON.stringify(renderTree("> [!NOTE]"))).toContain("rich-highlight");
		expect(JSON.stringify(renderTree("- Item\n\n  > [!NOTE]\n  > Nested"))).toContain("rich-highlight");
	});
});
