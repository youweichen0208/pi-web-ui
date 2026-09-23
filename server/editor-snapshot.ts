import { realpathSync, statSync, openSync, readSync, closeSync } from "node:fs";
import { resolve, relative, isAbsolute, sep } from "node:path";
import type { PromptAttachment } from "./protocol.js";
import { looksLikeText, previewKind } from "./text-sniff.js";

/** Validate every snapshot before any attachment side effects or history fork. */
export function validateEditorSnapshots(cwd: string, attachments?: PromptAttachment[]): void {
	for (const att of attachments ?? []) {
		if (att.editorSnapshot === undefined) continue;
		const s = att.editorSnapshot;
		if (!s || typeof s.cwd !== "string" || s.cwd !== cwd || typeof s.text !== "string" ||
			typeof s.dirty !== "boolean" || (s.version !== undefined && typeof s.version !== "string") ||
			typeof att.path !== "string" || !att.path || att.mode === "lines" || att.imageData || att.fileData || att.uploadPath) {
			throw new Error("当前文件快照身份或类型无效，请重新打开文件");
		}
		if (Buffer.byteLength(s.text, "utf8") > 512 * 1024) throw new Error("当前文件快照超过 512 KiB，请缩减内容或移除标签");
		const root = realpathSync(cwd);
		const abs = resolve(cwd, att.path);
		for (const [boundary, path] of [[resolve(cwd), abs], [root, realpathSync(abs)]]) {
			const rel = relative(boundary, path);
			if (rel === ".." || rel.startsWith(`..${sep}`) || isAbsolute(rel)) throw new Error("当前文件路径超出工作区");
		}
		if (!statSync(abs).isFile() || !["text", "none"].includes(previewKind(att.path)) || !looksLikeText(Buffer.from(s.text))) {
			throw new Error("当前文件快照必须是文本文件");
		}
		const fd = openSync(abs, "r");
		try {
			const sample = Buffer.alloc(4096);
			const length = readSync(fd, sample, 0, sample.length, 0);
			if (!looksLikeText(sample.subarray(0, length))) throw new Error("当前文件不是可编辑文本");
		} finally { closeSync(fd); }
	}
}
