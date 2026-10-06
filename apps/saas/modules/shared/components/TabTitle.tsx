"use client";

import { useEffect } from "react";

/**
 * While guests wait, the tab reads "(n) <Page> – Nhịp" on every page: the count in front of the
 * page's own title, n being the nav's Your-turn count (ADR 0019 and its 2026-10-06 amendment,
 * #136, #212), so an operator on another tab sees it; with none, the page's own title. Next writes
 * each page's title on navigation, after this has run, so a watch on the document head puts the
 * count back in front, and takes it off again when the count changes or goes.
 */
export function TabTitle({ count }: { count: number | null }) {
	useEffect(() => {
		if (!count) return;
		const prefix = `(${count}) `;
		const apply = () => {
			if (!document.title.startsWith(prefix)) document.title = prefix + document.title;
		};
		apply();
		const observer = new MutationObserver(apply);
		observer.observe(document.head, { childList: true, subtree: true, characterData: true });
		return () => {
			observer.disconnect();
			if (document.title.startsWith(prefix)) document.title = document.title.slice(prefix.length);
		};
	}, [count]);

	return null;
}
