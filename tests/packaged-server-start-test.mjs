// Exercise the shipped server with the shipped Electron runtime, without using
// the checkout's node_modules. No model calls or user configuration are needed.
import assert from "node:assert/strict";
import { fork } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createServer } from "node:net";
import { once } from "node:events";

const [executable, appRoot] = process.argv.slice(2).map((p) => resolve(p));
assert(executable && appRoot, "Usage: node tests/packaged-server-start-test.mjs <executable> <resources/app>");
const temp = mkdtempSync(join(tmpdir(), "pi-packaged-start-"));
const workspace = join(temp, "workspace");
mkdirSync(workspace);
const listener = createServer();
await new Promise((resolve, reject) => {
	listener.once("error", reject);
	listener.listen(0, "127.0.0.1", resolve);
});
const port = listener.address().port;
await new Promise((resolve) => listener.close(resolve));
assert(port >= 8900);
let output = "";
let failure;
const child = fork(join(appRoot, "dist/server/index.js"), [], {
	execPath: executable,
	cwd: workspace,
	env: {
		...process.env,
		NODE_PATH: "",
		NODE_OPTIONS: "",
		ELECTRON_RUN_AS_NODE: "1",
		PORT: String(port),
		PI_WEB_HOST: "127.0.0.1",
		PI_WEB_CWD: workspace,
		PI_WEB_DATA_DIR: join(temp, "data"),
		PI_CODING_AGENT_DIR: join(temp, "agent"),
		PI_WEB_PKG_ROOT: appRoot,
		PI_WEB_NO_BROWSER: "1",
	},
	stdio: ["ignore", "pipe", "pipe", "ipc"],
	serialization: "json",
});
child.stdout.on("data", (chunk) => { output = (output + chunk).slice(-20000); });
child.stderr.on("data", (chunk) => { output = (output + chunk).slice(-20000); });
child.on("error", (error) => { failure = error; });
child.on("exit", (code, signal) => { failure = new Error(`Packaged server exited: ${code ?? signal}`); });
try {
	let healthy = false;
	for (let n = 0; n < 150; n++) {
		if (failure) throw failure;
		try {
			const response = await fetch(`http://127.0.0.1:${port}/api/health`, { signal: AbortSignal.timeout(1000) });
			const health = await response.json();
			assert.equal(health.ok, true);
			assert.equal(health.pid, child.pid);
			healthy = true;
			break;
		} catch {}
		await new Promise((resolve) => setTimeout(resolve, 200));
	}
	assert(healthy, "Packaged server health check timed out");
	const page = await fetch(`http://127.0.0.1:${port}/`);
	assert.equal(page.status, 200);
	assert.match(await page.text(), /<div id="root">/);
	console.log(`PASS packaged server: ${appRoot}`);
} catch (error) {
	console.error(output);
	throw error;
} finally {
	if (child.exitCode === null && child.signalCode === null) {
		const exited = once(child, "exit");
		child.kill();
		await exited;
	}
	rmSync(temp, { recursive: true, force: true });
}
