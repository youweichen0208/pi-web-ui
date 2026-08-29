/**
 * Lean `highlight.js` setup for spots that need to color a single line of
 * code programmatically (the edit-tool diff view) rather than through the
 * Markdown → rehype-highlight pipeline (Markdown.tsx), which only operates
 * on whole fenced blocks.
 *
 * Uses `highlight.js/lib/core` + individually-registered language modules
 * (the same approach `lowlight`'s "common" bundle takes internally) instead
 * of importing the full `highlight.js` package, which registers all ~190
 * languages and would otherwise bloat the bundle. The language set here
 * matches ToolCallBlock.tsx's EXT_LANG map exactly, so anything read/write
 * can highlight, the diff view can highlight too.
 */
import hljs from "highlight.js/lib/core";
import bash from "highlight.js/lib/languages/bash";
import c from "highlight.js/lib/languages/c";
import cpp from "highlight.js/lib/languages/cpp";
import csharp from "highlight.js/lib/languages/csharp";
import css from "highlight.js/lib/languages/css";
import diff from "highlight.js/lib/languages/diff";
import go from "highlight.js/lib/languages/go";
import graphql from "highlight.js/lib/languages/graphql";
import ini from "highlight.js/lib/languages/ini";
import java from "highlight.js/lib/languages/java";
import javascript from "highlight.js/lib/languages/javascript";
import json from "highlight.js/lib/languages/json";
import kotlin from "highlight.js/lib/languages/kotlin";
import less from "highlight.js/lib/languages/less";
import lua from "highlight.js/lib/languages/lua";
import makefile from "highlight.js/lib/languages/makefile";
import php from "highlight.js/lib/languages/php";
import python from "highlight.js/lib/languages/python";
import r from "highlight.js/lib/languages/r";
import ruby from "highlight.js/lib/languages/ruby";
import rust from "highlight.js/lib/languages/rust";
import scss from "highlight.js/lib/languages/scss";
import sql from "highlight.js/lib/languages/sql";
import swift from "highlight.js/lib/languages/swift";
import typescript from "highlight.js/lib/languages/typescript";
import xml from "highlight.js/lib/languages/xml";
import yaml from "highlight.js/lib/languages/yaml";

hljs.registerLanguage("bash", bash);
hljs.registerLanguage("c", c);
hljs.registerLanguage("cpp", cpp);
hljs.registerLanguage("csharp", csharp);
hljs.registerLanguage("css", css);
hljs.registerLanguage("diff", diff);
hljs.registerLanguage("go", go);
hljs.registerLanguage("graphql", graphql);
hljs.registerLanguage("ini", ini);
hljs.registerLanguage("java", java);
hljs.registerLanguage("javascript", javascript);
hljs.registerLanguage("json", json);
hljs.registerLanguage("kotlin", kotlin);
hljs.registerLanguage("less", less);
hljs.registerLanguage("lua", lua);
hljs.registerLanguage("makefile", makefile);
hljs.registerLanguage("php", php);
hljs.registerLanguage("python", python);
hljs.registerLanguage("r", r);
hljs.registerLanguage("ruby", ruby);
hljs.registerLanguage("rust", rust);
hljs.registerLanguage("scss", scss);
hljs.registerLanguage("sql", sql);
hljs.registerLanguage("swift", swift);
hljs.registerLanguage("typescript", typescript);
hljs.registerLanguage("xml", xml);
hljs.registerLanguage("yaml", yaml);

function escapeHtml(s: string): string {
	return s
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;");
}

/**
 * Highlight a single line of code, returning `.hljs-*`-tagged HTML (same
 * classes the imported github-dark.css / each theme's light hljs override
 * already style — see themes/*.css tails). Falls back to plain escaped text
 * when `lang` is null/unregistered, or if highlighting throws for any reason
 * (malformed partial line, unsupported construct) — this must never crash
 * the diff view over a single odd line.
 */
export function highlightLine(code: string, lang: string | null): string {
	if (!lang || !hljs.getLanguage(lang)) return escapeHtml(code);
	try {
		return hljs.highlight(code, { language: lang, ignoreIllegals: true }).value;
	} catch {
		return escapeHtml(code);
	}
}
