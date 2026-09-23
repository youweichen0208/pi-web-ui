export interface DesktopWindowState {
	maximized: boolean;
	fullscreen: boolean;
}

export interface DesktopAPI {
	platform: string;
	windowAction: (action: "minimize" | "toggle-maximize" | "close") => void;
	onWindowState: (callback: (state: DesktopWindowState) => void) => () => void;
}

declare global {
	interface Window {
		electronAPI?: DesktopAPI;
	}
}

export const desktopAPI = window.electronAPI;
