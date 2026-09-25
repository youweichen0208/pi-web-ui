import { useEffect, useState } from "react";
import { useT } from "../i18n";

export function WorkingDots() {
	return <span className="working-dots" aria-hidden="true"><i /><i /><i /></span>;
}
export function WorkingStatus({ label, phase, durationMs }: { label: string; phase: string; durationMs?: number }) {
	const t = useT();
	const [clock, setClock] = useState({ phase, started: Date.now(), elapsed: 0 });
	useEffect(() => {
		const started = Date.now() - (durationMs ?? 0);
		const update = () => setClock({ phase, started, elapsed: Date.now() - started });
		update();
		const timer = setInterval(update, 1000);
		return () => clearInterval(timer);
	}, [phase, durationMs]);
	const elapsed = clock.phase === phase ? clock.elapsed : durationMs ?? 0;
	return <div className="agent-working" role="status"><WorkingDots /><span>{label}</span>{elapsed >= 3000 && <span className="working-duration"> · {t("thinkingDuration", { n: Math.floor(elapsed / 1000) })}</span>}</div>;
}
