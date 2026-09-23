import type { PromptAttachment } from "../../server/protocol.js";

export interface CurrentFileContext {
	id: string;
	cwd: string;
	path: string;
	name: string;
	dirty: boolean;
}
export type ReadCurrentFile = (openId: string) => PromptAttachment | null;

export function mergeCurrentFile(attachments: PromptAttachment[], current: PromptAttachment): PromptAttachment[] {
	const normalize = (path: string) => {
		const slashPath = path.replace(/\\/g, "/");
		const full = /^(?:\/|[A-Za-z]:\/)/.test(slashPath) ? slashPath : `${current.editorSnapshot?.cwd ?? ""}/${slashPath}`;
		const parts: string[] = [];
		for (const part of full.split("/")) {
			if (part === "..") parts.pop();
			else if (part && part !== ".") parts.push(part);
		}
		return parts.join("/");
	};
	return [...attachments.filter((a) => a.mode === "lines" || a.imageData || a.fileData || a.uploadPath ||
		normalize(a.path) !== normalize(current.path)), current];
}
