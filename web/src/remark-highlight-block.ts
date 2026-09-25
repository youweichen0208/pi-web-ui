import type { Root, RootContent } from "mdast";

/** A portable Markdown note: render its marker as block styling, not text. */
export function remarkHighlightBlock() {
	return (tree: Root) => {
		const visit = (node: Root | RootContent) => {
			if (node.type === "blockquote") {
				const paragraph = node.children[0];
				const first = paragraph?.type === "paragraph" ? paragraph.children[0] : undefined;
				if (first?.type === "text" && /^\[!NOTE\](?:\r?\n|$)/.test(first.value)) {
					first.value = first.value.replace(/^\[!NOTE\](?:\r?\n)?/, "");
					node.data = { ...node.data, hProperties: { className: ["rich-highlight"], "data-rich-highlight": "note" } };
				}
			}
			if ("children" in node) node.children.forEach((child) => visit(child as RootContent));
		};
		visit(tree);
	};
}
