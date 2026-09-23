/**
 * Sandboxed Electron preload: only fixed window operations cross the bridge.
 * Sandboxed preloads use CommonJS; ESM imports are not available here.
 */
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electronAPI", {
	platform: process.platform,
	windowAction: (action) => {
		if (["minimize", "toggle-maximize", "close"].includes(action)) {
			return ipcRenderer.invoke("pi-window-action", action);
		}
	},
	onWindowState: (callback) => {
		const listener = (_event, state) => callback({
			maximized: !!state.maximized,
			fullscreen: !!state.fullscreen,
		});
		ipcRenderer.on("pi-window-state", listener);
		ipcRenderer.invoke("pi-window-state-read").then((state) => {
			if (state) callback({ maximized: !!state.maximized, fullscreen: !!state.fullscreen });
		});
		return () => ipcRenderer.removeListener("pi-window-state", listener);
	},
	versions: {
		node: process.versions.node,
		electron: process.versions.electron,
		chrome: process.versions.chrome,
	},
});
