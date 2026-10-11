"use client";

import { cn } from "@repo/ui";
import { useEffect, useState } from "react";

/** How long the old value stays while it leaves: its 120ms exit, and a frame to spare. */
const LEAVING_MS = 150;

function reduced(): boolean {
	return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * A count that ticks when it changes (#330): the new value rises into its one-line slot in
 * 150ms while the old one leaves upward in 120ms. The first value shows as it is. Under reduced
 * motion the new value fades in over 150ms and the old one is gone at once, never left in the
 * text a reader or a test reads.
 */
export function TickingCount({ value, className }: { value: number | string; className?: string }) {
	const [shown, setShown] = useState<{
		value: number | string;
		leaving: number | string | null;
		ticked: boolean;
	}>({ value, leaving: null, ticked: false });
	if (shown.value !== value) {
		setShown({ value, leaving: reduced() ? null : shown.value, ticked: true });
	}
	const leaving = shown.leaving;
	useEffect(() => {
		if (leaving === null) return;
		const timer = window.setTimeout(
			() => setShown((current) => ({ ...current, leaving: null })),
			LEAVING_MS,
		);
		return () => window.clearTimeout(timer);
	}, [leaving]);
	return (
		<span className={cn("inline-grid overflow-hidden", className)}>
			{leaving !== null ? (
				<span
					key={`leaving-${leaving}`}
					aria-hidden="true"
					className="animate-count-out col-start-1 row-start-1"
				>
					{leaving}
				</span>
			) : null}
			<span
				key={shown.value}
				className={cn(
					"col-start-1 row-start-1",
					shown.ticked && "animate-count-in motion-reduce:animate-fade-in",
				)}
			>
				{shown.value}
			</span>
		</span>
	);
}
