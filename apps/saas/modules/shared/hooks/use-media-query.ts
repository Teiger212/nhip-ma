"use client";

import { useEffect, useState } from "react";

/**
 * Hook to detect if the viewport matches a media query.
 * Uses Tailwind's md breakpoint (768px) by default for mobile detection.
 */
export function useMediaQuery(query: string): boolean {
	const [matches, setMatches] = useState(false);

	useEffect(() => {
		const mediaQuery = window.matchMedia(query);
		setMatches(mediaQuery.matches);

		const handler = (event: MediaQueryListEvent) => {
			setMatches(event.matches);
		};
		mediaQuery.addEventListener("change", handler);
		return () => mediaQuery.removeEventListener("change", handler);
	}, [query]);

	return matches;
}

/**
 * True below `lg` (1024px), where the app runs its phone shell: the sidebar is a sheet
 * behind the top bar (packages/ui/hooks/use-mobile.ts).
 */
export function useIsMobile(): boolean {
	return useMediaQuery("(max-width: 1023px)");
}
