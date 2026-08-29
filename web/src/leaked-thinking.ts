/**
 * Defensive rendering guard for reasoning models that occasionally emit raw
 * `<think>`/`<thinking>` reasoning tags on the normal text channel instead
 * of the SDK's dedicated `thinking` channel (a model/provider output
 * glitch, not something this app or the pi SDK can parse away upstream —
 * from here it's indistinguishable from ordinary text until it shows up
 * literally in a reply). Different reasoning models/providers spell the tag
 * differently (`</think>` vs `</thinking>` both observed in practice), so
 * both are matched.
 *
 * Everything up to and including the *last* closing tag in a text block is
 * treated as leaked reasoning noise and can be tucked behind a collapsed
 * toggle instead of dumped into the chat as a normal paragraph; whatever
 * follows it is the model's actual answer and renders normally. This
 * intentionally does not try to pair up open/close tags — the observed
 * failure mode is orphaned/duplicated closing tags with no matching opener,
 * so a pairing parser would just miss them.
 */
export interface LeakedThinkingSplit {
	/** Raw text up to and including the last closing tag. */
	leaked: string;
	/** Text after the last closing tag — the real reply, if any. */
	visible: string;
}

const CLOSE_TAG_RE = /<\/think(?:ing)?>/gi;

export function splitLeakedThinking(text: string): LeakedThinkingSplit | null {
	let lastEnd = -1;
	for (const m of text.matchAll(CLOSE_TAG_RE)) {
		lastEnd = m.index + m[0].length;
	}
	if (lastEnd === -1) return null;
	const leaked = text.slice(0, lastEnd).trim();
	const visible = text.slice(lastEnd).trim();
	if (!leaked) return null;
	return { leaked, visible };
}
