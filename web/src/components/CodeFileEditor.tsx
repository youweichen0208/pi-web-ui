import { memo, useMemo, useRef } from "react";
import { highlightLines, langFromPath } from "../hljs-lite";
import { useT } from "../i18n";

/** The textarea owns selection, IME and undo; the inert layer only supplies colors. */
export const CodeFileEditor = memo(function CodeFileEditor({ value, name, readOnly, wrap, onChange }: {
	value: string;
	name: string;
	readOnly: boolean;
	wrap: boolean;
	onChange: (value: string) => void;
}) {
	const t = useT();
	const paint = useRef<HTMLDivElement>(null);
	const lines = useMemo(() => highlightLines(value, langFromPath(name)), [value, name]);
	return <div className={`fp-code-editor ${wrap ? "" : "no-wrap"}`}>
		<div className="fp-code-paint" ref={paint} aria-hidden="true">
			<div className="fp-code-ink hljs">
				{lines.map((html, index) => <div className="fp-edit-line" key={index}>
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
