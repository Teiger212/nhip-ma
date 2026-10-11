"use client";

import { flushSync } from "react-dom";

/**
 * The Inbox's motion in script (#330, DESIGN.md "Motion"): what CSS alone can't run. The curves
 * are `globals.css`'s `--ease-*` tokens, repeated here because the Web Animations API takes no
 * CSS variables. Every caller checks `reducedMotion()` itself: a media query never reaches script.
 */
export const EASE = {
	/** A confident deceleration, for what comes in. */
	arrive: "cubic-bezier(0.16, 1, 0.3, 1)",
	/** The kit's own, for sheets and the phone's steps. */
	kit: "cubic-bezier(0.32, 0.72, 0, 1)",
	/** What leaves: faster than it came. */
	exit: "cubic-bezier(0.4, 0, 1, 1)",
} as const;

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

/**
 * The open card turns to the next guest after a send: on a desk a 160ms cross-fade, on a phone a
 * 12px step forward in 240ms; under reduced motion a 150ms cross-fade. Transform and opacity only.
 */
export function playHandoff(card: HTMLElement, sideBySide: boolean): void {
	if (reducedMotion()) {
		card.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 150, easing: "ease-out" });
		return;
	}
	if (sideBySide) {
		card.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 160, easing: "ease-out" });
		return;
	}
	card.animate(
		[
			{ opacity: 0, transform: "translateX(12px)" },
			{ opacity: 1, transform: "none" },
		],
		{ duration: 240, easing: EASE.kit },
	);
}
