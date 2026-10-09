"use client";

import { useSyncExternalStore } from "react";

const subscribe = () => () => {};

/**
 * False on the server and while the page hydrates, true from the render after (#94). A client
 * component the server paints too (the Inbox and Home are prefetched there) renders a time that
 * depends on the clock or the device's time zone ("18 min", "6 hours ago", "Sep 21, 5:11 PM")
 * only once this is true: the server's clock and zone are not the browser's, and a text that
 * differs fails hydration (React #418), which throws away the first click.
 */
export function useHydrated(): boolean {
	return useSyncExternalStore(
		subscribe,
		() => true,
		() => false,
	);
}
