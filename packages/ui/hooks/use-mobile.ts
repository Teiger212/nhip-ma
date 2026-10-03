"use client";

import * as React from "react";

/**
 * Below `lg` the sidebar is a sheet behind the top bar, as on a phone: docked at 256px it
 * would leave a tablet about 500px for the inbox's two panels. Matches Tailwind's `lg`.
 */
const MOBILE_BREAKPOINT = 1024;

export function useIsMobile() {
	const [isMobile, setIsMobile] = React.useState(false);

	React.useEffect(() => {
		const mediaQuery = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`);
		const onChange = () => {
			setIsMobile(window.innerWidth < MOBILE_BREAKPOINT);
		};

		onChange();
		mediaQuery.addEventListener("change", onChange);
		return () => mediaQuery.removeEventListener("change", onChange);
	}, []);

	return isMobile;
}
