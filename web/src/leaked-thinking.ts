/**
 * Defensive rendering guard for reasoning models that occasionally emit raw
 * `</think>` tags on the normal text channel instead of the SDK's dedicated
 * `thinking` channel (a model/provider output glitch, not something this app
 * or the pi SDK can parse away upstream — from here it's indistinguishable
 * from ordinary text until it shows up literally in a reply).
 *
 * Everything up to and including the *last* `</think>` in a text block is
 * treated as leaked reasoning noise and can be tucked behind a collapsed
 * toggle instead of dumped into the chat as a normal paragraph; whatever
 * follows the last `</think>` is the model's actual answer and renders
 * normally. This intentionally does not try to pair up `<think>`/`</think>`
 * — the observed failure mode is orphaned/duplicated closing tags with no
 * matching opener, so a pairing parser would just miss them.
 */
export interface LeakedThinkingSplit {
	/** Raw text up to and including the last `</think>` marker. */
	leaked: string;
	/** Text after the last `</think>` marker — the real reply, if any. */
	visible: string;
}

const CLOSE_TAG = "</think>";

export function splitLeakedThinking(text: string): LeakedThinkingSplit | null {
	const lastClose = text.lastIndexOf(CLOSE_TAG);
	if (lastClose === -1) return null;
	const leaked = text.slice(0, lastClose + CLOSE_TAG.length).trim();
	const visible = text.slice(lastClose + CLOSE_TAG.length).trim();
	if (!leaked) return null;
	return { leaked, visible };
}
