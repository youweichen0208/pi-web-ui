/** Real editor with intercepted prompts (zero tokens); --electron uses desktop shell. */
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
const cwd = join(base, "workspace"); mkdirSync(cwd);
writeFileSync(join(cwd, "code.ts"), "const disk = 1;\n");
writeFileSync(join(cwd, "note.md"), "# Original\n");
writeFileSync(join(cwd, "large.txt"), "a".repeat(512 * 1024 + 1));
const env = { ...process.env, PI_WEB_CWD: cwd, PI_WEB_DATA_DIR: join(base, "data"), PI_CODING_AGENT_DIR: join(base, "agent") };
let server, browser, app;
try {
	let page;
	if (process.argv.includes("--electron")) {
		app = await electron.launch({ args: [".", `--user-data-dir=${join(base, "profile")}`], env });
		for (let i = 0; i < 200; i++) { page = app.windows().find((w) => w.url().startsWith("http://127.0.0.1:")); if (page) break; await sleep(100); }
		assert(page);
		page.on("dialog", () => {});
	} else {
		assert.equal(await portUp(8993), false);
		server = spawn(process.execPath, ["dist/server/index.js"], { env: { ...env, PORT: "8993" }, stdio: "ignore" });
		for (let i = 0; i < 100 && !(await portUp(8993)); i++) await sleep(100);
		assert(await portUp(8993));
		browser = await chromium.launch({ executablePath: CHROME_PATH });
		page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
	}
	const prompts = [];
	let rejectNext = false;
	await page.routeWebSocket("**/ws", (route) => {
		const upstream = route.connectToServer();
		route.onMessage((wire) => {
			const msg = JSON.parse(wire.toString());
			if (msg.type === "prompt") {
				prompts.push(msg);
				route.send(JSON.stringify({ type: "prompt_result", requestId: msg.requestId, ok: !rejectNext }));
				rejectNext = false;
			} else upstream.send(wire);
		});
	});
	await page.goto(app ? page.url() : "http://127.0.0.1:8993");
	await page.locator(".setup-modal .modal-close").click();
	await page.locator(".file-name", { hasText: "code.ts" }).click();
	const chip = page.locator(".current-file");
	await chip.waitFor();
	assert((await chip.textContent()).includes("@code.ts"));
	const code = page.locator(".fp-editor");
	const input = page.locator(".inputbox textarea");
	await code.fill("const draft = '最后一次输入';\n");
	assert((await chip.textContent()).includes("未保存"));
	const submit = async (text) => { await input.fill(text); await input.press("Enter"); };
	await submit("first question");
	await page.waitForFunction(() => document.querySelector(".inputbox textarea").value === "");
	assert.equal(prompts[0].attachments[0].editorSnapshot.text, "const draft = '最后一次输入';\n");
	assert.equal(readFileSync(join(cwd, "code.ts"), "utf8"), "const disk = 1;\n");
	await code.fill("second draft");
	await submit("second question");
	await page.waitForFunction(() => document.querySelector(".inputbox textarea").value === "");
	assert.equal(prompts[1].attachments[0].editorSnapshot.text, "second draft");
	assert.equal(prompts[0].attachments[0].editorSnapshot.text, "const draft = '最后一次输入';\n");
	rejectNext = true;
	await submit("rejected question"); await sleep(100);
	assert.equal(await input.inputValue(), "rejected question");
	await chip.locator("button").click();
	await code.fill("third draft");
	assert.equal(await chip.count(), 0);
	await submit("no automatic file");
	await page.waitForFunction(() => document.querySelector(".inputbox textarea").value === "");
	assert.equal(prompts.at(-1).attachments.length, 0);
	await code.fill("const disk = 1;\n");
	await page.locator(".fp-foot > button").first().click();
	await page.locator(".file-name", { hasText: "code.ts" }).click(); await chip.waitFor();
	await code.fill("中".repeat(180000));
	const count = prompts.length;
	await submit("oversized question"); await sleep(100);
	assert.equal(prompts.length, count);
	assert.equal(await input.inputValue(), "oversized question");
	await code.fill("const disk = 1;\n"); await input.fill("");
	await page.locator(".fp-foot > button").first().click();
	assert.equal(await chip.count(), 0);
	await page.locator(".file-name", { hasText: "large.txt" }).click();
	await page.locator(".fp-foot").waitFor(); assert.equal(await chip.count(), 0);
	await page.locator(".fp-foot > button").first().click();
	await page.locator(".file-name", { hasText: "note.md" }).click(); await chip.waitFor();
	await page.locator(".fp-rich-document").fill("Markdown last input");
	await submit("markdown question");
	await page.waitForFunction(() => document.querySelector(".inputbox textarea").value === "");
	assert(prompts.at(-1).attachments[0].editorSnapshot.text.includes("Markdown last input"));
	assert.equal(readFileSync(join(cwd, "note.md"), "utf8"), "# Original\n");
	await page.locator(".fp-more").evaluate((node) => { node.open = true; });
	await page.locator(".fp-attach.markdown").click();
	await code.fill("# Markdown source last input\n");
	await submit("source question");
	await page.waitForFunction(() => document.querySelector(".inputbox textarea").value === "");
	assert.equal(prompts.at(-1).attachments[0].editorSnapshot.text, "# Markdown source last input\n");
	await code.fill("# Original\n");
	await page.getByRole("tab").nth(2).click();
	assert.equal(await chip.count(), 1);
	await page.getByRole("tab").first().click();
	await chip.waitFor({ state: "visible" });
	await page.setViewportSize({ width: 650, height: 900 });
	if (!(await page.locator(".drawer-right").getAttribute("class")).includes("open")) await page.locator(".topbar .panel-toggle").last().click();
	await page.locator(".drawer-backdrop").click({ position: { x: 10, y: 200 } });
	await input.fill("focus stays here");
	assert.equal(await input.evaluate((node) => node === document.activeElement), true);
	await chip.waitFor({ state: "visible" });

	console.log("PASS current-file UI: persistent tag, dismissal/reopen, last code/rich/source edit, frozen snapshots, rejection, size limit, read-only exclusion, disk unchanged");
} finally {
	await browser?.close();
	if (app) { await app.evaluate(({ dialog }) => { dialog.showMessageBoxSync = () => 1; }).catch(() => {}); await app.close(); }
	if (server?.pid && server.exitCode === null && server.signalCode === null) { server.kill("SIGTERM"); await new Promise((resolve) => server.once("exit", resolve)); }
}
