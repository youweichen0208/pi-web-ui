import { mkdirSync, realpathSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import { randomUUID } from "node:crypto";
import { workspacePath } from "./files-service.js";
import { sniffImageMime } from "./text-sniff.js";

export const MAX_MARKDOWN_IMAGE_BYTES = 5 * 1024 * 1024;

/** Store durable document assets next to the Markdown file, never in expiring chat uploads. */
export function saveMarkdownImage(cwd: string, path: string, data: string): string {
	const root = realpathSync(cwd);
	const document = workspacePath(root, path);
	if (!document || !/\.markdown$|\.md$/i.test(path)) throw new Error("Invalid Markdown path");
	const actual = realpathSync(document.abs);
	if (!workspacePath(root, actual) || !statSync(actual).isFile()) throw new Error("Path outside workspace");
	if (!data || data.length > Math.ceil(MAX_MARKDOWN_IMAGE_BYTES / 3) * 4 || !/^[A-Za-z0-9+/]+={0,2}$/.test(data)) throw new Error("Invalid image data (maximum 5 MB)");
	const buffer = Buffer.from(data, "base64");
	if (buffer.length > MAX_MARKDOWN_IMAGE_BYTES) throw new Error("Image exceeds 5 MB");
	const mime = sniffImageMime(buffer, "");
	const extension = mime === "image/png" ? "png" : mime === "image/jpeg" ? "jpg" : mime === "image/webp" ? "webp" : mime === "image/gif" ? "gif" : null;
	if (!extension) throw new Error("Unsupported image format");
	const assets = join(dirname(actual), ".assets");
	// Refuse symlink escapes both before and after creating the assets directory.
	try { if (!workspacePath(root, realpathSync(assets))) throw new Error("Path outside workspace"); }
	catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
	mkdirSync(assets, { recursive: true });
	const destination = realpathSync(assets);
	if (!workspacePath(root, destination)) throw new Error("Path outside workspace");
	const name = `image-${randomUUID()}.${extension}`;
	writeFileSync(join(destination, name), buffer, { flag: "wx" });
	return relative(dirname(document.abs), join(destination, name)).split(sep).join("/");
}
