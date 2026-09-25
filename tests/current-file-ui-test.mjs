/** Explicit file references in a real browser (or Electron with --electron). */
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { chromium, _electron as electron } from "playwright-core";
import { CHROME_PATH } from "./lib/chrome.mjs";
import { portUp } from "./lib/port-utils.mjs";

const base = mkdtempSync(join(tmpdir(), "current-file-ui-"));
const cwd = join(base, "workspace");
mkdirSync(cwd);
writeFileSync(join(cwd, "code.ts"), "const disk = 1;\n");
writeFileSync(join(cwd, "note.md"), "# Note\n\nSelected paragraph.\n");
const env = { ...process.env, PI_WEB_CWD: cwd, PI_WEB_DATA_DIR: join(base, "data"), PI_CODING_AGENT_DIR: join(base, "agent") };
let server, browser, app;
try {
	let page;
	if (process.argv.includes("--electron")) {
		app = await electron.launch({ args: [".", `--user-data-dir=${join(base, "profile")}`], env });
		for (let i = 0; i < 200; i++) { page = app.windows().find((window) => window.url().startsWith("http://127.0.0.1:")); if (page) break; await sleep(100); }
		assert(page);
	} else {
		assert.equal(await portUp(8993), false);
		server = spawn(process.execPath, ["dist/server/index.js"], { env: { ...env, PORT: "8993" }, stdio: "ignore" });
		for (let i = 0; i < 100 && !await portUp(8993); i++) await sleep(100);
		assert(await portUp(8993));
		browser = await chromium.launch({ executablePath: CHROME_PATH });
		page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
	}
	const prompts = [];
	await page.routeWebSocket("**/ws", (route) => {
		const upstream = route.connectToServer();
		route.onMessage((wire) => {
			const message = JSON.parse(wire.toString());
			if (message.type === "prompt") {
				prompts.push(message);
				route.send(JSON.stringify({ type: "prompt_result", requestId: message.requestId, ok: true }));
			} else upstream.send(wire);
		});
	});
	await page.goto(app ? page.url() : "http://127.0.0.1:8993");
	await page.locator(".setup-modal .modal-close").click();
	await page.locator(".file-name", { hasText: "code.ts" }).click();
	await page.locator(".fp-editor").waitFor();
	assert.equal(await page.locator(".attach-chip.reference").count(), 1, "opening a file should attach a path reference");
	await page.locator(".fp-reference").click();
	assert.equal(await page.locator(".attach-chip.reference").count(), 1, "manual reference should not duplicate the opened file");
	await page.locator(".inputbox textarea").fill("Review this file");
	await page.locator(".inputbox textarea").press("Enter");
	await page.waitForFunction(() => document.querySelector(".inputbox textarea")?.value === "");
	assert.equal(prompts[0].attachments.length, 1);
	assert.equal(prompts[0].attachments[0].mode, "reference");
	assert.equal(prompts[0].attachments[0].editorSnapshot, undefined);
	await page.locator(".fp-editor").fill("const draft = 2;\n");
	await page.locator(".inputbox textarea").fill("No file please");
	await page.locator(".inputbox textarea").press("Enter");
	await page.waitForFunction(() => document.querySelector(".inputbox textarea")?.value === "");
	assert.equal(prompts.at(-1).attachments.length, 0);
	assert.equal(readFileSync(join(cwd, "code.ts"), "utf8"), "const disk = 1;\n");
	await page.locator(".fp-back").click();
	await page.locator(".fp-leave").getByRole("button", { name: "放弃修改" }).click();
	await page.locator(".file-name", { hasText: "note.md" }).click();
	await page.locator(".fp-markdown p").evaluate((node) => {
		const range = document.createRange();
		range.selectNodeContents(node);
		const selected = window.getSelection();
		selected.removeAllRanges();
		selected.addRange(range);
		node.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
	});
	await page.locator(".fp-quote-selection").click();
	await page.locator(".attach-chip.lines").waitFor();
	await page.locator(".inputbox textarea").fill("Explain these lines");
	await page.locator(".inputbox textarea").press("Enter");
	await page.waitForFunction(() => document.querySelector(".inputbox textarea")?.value === "");
	assert.equal(prompts.at(-1).attachments.find((attachment) => attachment.mode === "reference")?.path, "note.md");
	assert.equal(prompts.at(-1).attachments.find((attachment) => attachment.mode === "lines")?.lines.start, 3);
	console.log("PASS automatic current-file references and selected line ranges; no unsaved draft attachment");
} finally {
	await browser?.close();
	await app?.close();
	server?.kill("SIGTERM");
}
