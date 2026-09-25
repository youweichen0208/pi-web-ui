import { expect, test } from "vitest";
import { displayReadPath, readPath, splitFrontmatter } from "../../web/src/read-presentation.js";

test("read calls show a compact path instead of internal JSON", () => {
	expect(readPath('{"path":"/Users/alice/.agents/skills/grilling/SKILL.md"}')).toBe("/Users/alice/.agents/skills/grilling/SKILL.md");
	expect(displayReadPath("/Users/alice/.agents/skills/grilling/SKILL.md")).toBe("~/.agents/skills/grilling/SKILL.md");
	expect(readPath('{"command":"ls"}')).toBeNull();
});

test("skill frontmatter is separated from Markdown prose", () => {
	expect(splitFrontmatter("---\nname: grilling\ndescription: Ask hard questions\n---\n# Usage\nBody")).toEqual({
		fields: [{ name: "name", value: "grilling" }, { name: "description", value: "Ask hard questions" }],
		body: "# Usage\nBody",
	});
	expect(splitFrontmatter("# Ordinary Markdown")).toEqual({ fields: [], body: "# Ordinary Markdown" });
});
