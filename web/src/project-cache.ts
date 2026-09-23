/** Display-only cache. Never use these snapshots as a delta revision base. */
export class ProjectCache<T> {
	private entries = new Map<string, { value: T; bytes: number }>();
	private bytes = 0;
	constructor(private limit = 3, private budget = 32 * 1024 * 1024) {}
	get(key: string): T | undefined {
		const entry = this.entries.get(key);
		if (!entry) return;
		this.entries.delete(key);
		this.entries.set(key, entry);
		return entry.value;
	}
	set(key: string, value: T): void {
		this.delete(key);
		const bytes = JSON.stringify(value).length * 2;
		if (bytes > this.budget) return;
		this.entries.set(key, { value, bytes });
		this.bytes += bytes;
		while (this.entries.size > this.limit || this.bytes > this.budget) {
			this.delete(this.entries.keys().next().value!);
		}
	}
	delete(key: string): void {
		this.bytes -= this.entries.get(key)?.bytes ?? 0;
		this.entries.delete(key);
	}
}
