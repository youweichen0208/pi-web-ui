import { withToken } from "./auth-token";
import { getClientId } from "./use-chat";

/** Display document-relative images through the workspace media endpoint. */
export function markdownImageUrl(source: string, file: { cwd: string; path: string }): string {
	if (!source || /^(?:[a-z]+:|\/\/|#)/i.test(source)) return source;
	try {
		const parent = file.path.replace(/\\/g, "/").split("/").slice(0, -1).map(encodeURIComponent).join("/");
		const path = decodeURIComponent(new URL(source, `https://workspace.invalid/${parent ? parent + "/" : ""}`).pathname).slice(1);
		return withToken(`/api/file?clientId=${encodeURIComponent(getClientId())}&cwd=${encodeURIComponent(file.cwd)}&path=${encodeURIComponent(path)}`);
	} catch {
		return source;
	}
}
