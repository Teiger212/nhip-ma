"use client";

import { flushSync } from "react-dom";

/**
 * The Inbox's motion in script (#330, DESIGN.md "Motion"): what CSS alone can't run. The
 * handoff's animation is CSS on React's View Transitions (`globals.css`, #337); script only
 * times its beat. Every caller checks `reducedMotion()` itself: a media query never reaches script.
 */

/** How long ✓ Sent shows on the answered row before the handoff takes it away (#337). */
export const HANDOFF_BEAT_MS = 500;

export function reducedMotion(): boolean {
	return (
		typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches
	);
}

/**
 * The phone's push between the list and a thread: `update` runs inside a view transition, the
 * thread sliding in over the list (`push`) or back off it (`back`); the styles are in
 * `globals.css` (`.vt-inbox`). Where the API is missing, or under reduced motion, the screens
 * swap at once, as before. Only local state belongs in `update`: a URL change is not flushed.
 */
export function swapScreens(direction: "push" | "back", update: () => void): void {
	if (typeof document.startViewTransition !== "function" || reducedMotion()) {
		update();
		return;
	}
	const root = document.documentElement;
	const name = `vt-${direction}`;
	root.classList.add(name);
	const transition = document.startViewTransition(() => {
		flushSync(update);
	});
	// A transition skipped (another starts, the tab hides) still lands on the new state.
	transition.ready.catch(() => undefined);
	void transition.finished.finally(() => root.classList.remove(name));
}
