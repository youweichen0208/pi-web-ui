import { memo, useMemo, useRef, useState } from "react";
import { highlightLines, langFromPath } from "../hljs-lite";
import { useT } from "../i18n";
import type { FileDiffMarker } from "../file-diff-markers";

/** The textarea owns selection, IME and undo; the inert layer only supplies colors. */
export const CodeFileEditor = memo(function CodeFileEditor({ value, name, readOnly, wrap, markers, onChange, onSelectLines }: {
	value: string;
	name: string;
	readOnly: boolean;
	wrap: boolean;
	markers?: ReadonlyMap<number, FileDiffMarker>;
	onChange: (value: string) => void;
	onSelectLines?: (start: number, end: number) => void;
}) {
	const t = useT();
	const paint = useRef<HTMLDivElement>(null);
	const [currentLine, setCurrentLine] = useState(0);
	const lines = useMemo(() => highlightLines(value, langFromPath(name)), [value, name]);
	return <div className={`fp-code-editor ${wrap ? "" : "no-wrap"}`}>
		<div className="fp-code-paint" ref={paint} aria-hidden="true">
			<div className="fp-code-ink hljs">
				{lines.map((html, index) => <div className={`fp-edit-line ${index + 1 === currentLine ? "current" : ""}`} data-line={index + 1} key={index}>
					<span className={`fp-edit-marker ${markers?.get(index + 1) ?? ""}`} />
					<span className="fp-edit-number">{index + 1}</span>
					<span className="fp-edit-text" dangerouslySetInnerHTML={{ __html: html || "\u200b" }} />
				</div>)}
			</div>
		</div>
		<textarea
			className="fp-editor"
			aria-label={t("editFile")}
			value={value}
			readOnly={readOnly}
			onChange={(event) => onChange(event.target.value)}
			onClick={(event) => setCurrentLine(value.slice(0, event.currentTarget.selectionStart).split("\n").length)}
			onKeyUp={(event) => setCurrentLine(value.slice(0, event.currentTarget.selectionStart).split("\n").length)}
			onSelect={(event) => {
				const input = event.currentTarget;
				if (input.selectionStart === input.selectionEnd) return;
				const start = value.slice(0, input.selectionStart).split("\n").length;
				const end = value.slice(0, Math.max(input.selectionStart, input.selectionEnd - 1)).split("\n").length;
				onSelectLines?.(start, end);
			}}
			onScroll={(event) => {
				if (!paint.current) return;
				paint.current.scrollTop = event.currentTarget.scrollTop;
				paint.current.scrollLeft = event.currentTarget.scrollLeft;
			}}
			onKeyDown={(event) => {
				if (event.key !== "Tab" || readOnly || event.nativeEvent.isComposing) return;
				event.preventDefault();
				// Native editing command keeps this insertion in the browser undo stack.
				document.execCommand("insertText", false, "\t");
			}}
			wrap={wrap ? "soft" : "off"}
			spellCheck={false}
			autoCapitalize="off"
			autoCorrect="off"
		/>
	</div>;
});
