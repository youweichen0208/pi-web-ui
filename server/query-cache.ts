/** TTL + stale-while-revalidate, with one in-flight scan per key. */
export class QueryCache<T> {
	private entries = new Map<string, { value?: T; expires: number; pending?: Promise<T> }>();
	constructor(private ttl: number, private maxEntries = 24) {}
	clear(): void { this.entries.clear(); }
	async get(key: string, scan: () => Promise<T>, refreshed?: (value: T) => void): Promise<T> {
		let entry = this.entries.get(key);
		if (!entry) {
			entry = { expires: 0 };
			this.entries.set(key, entry);
		} else {
			this.entries.delete(key);
			this.entries.set(key, entry);
		}
		while (this.entries.size > this.maxEntries) {
			this.entries.delete(this.entries.keys().next().value!);
		}
		if (entry.value !== undefined && entry.expires > Date.now()) return entry.value;
		if (!entry.pending) {
			const current = entry;
			const hadValue = current.value !== undefined;
			current.pending = scan().then((value) => {
				if (this.entries.get(key) === current) {
					current.value = value;
					current.expires = Date.now() + this.ttl;
					if (hadValue) refreshed?.(value);
				}
				return value;
			}).finally(() => { current.pending = undefined; });
		}
		if (entry.value !== undefined) {
			void entry.pending!.catch(() => {});
			return entry.value;
		}
		return entry.pending!;
	}
}
