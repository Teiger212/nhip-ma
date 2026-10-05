"use client";

import { useTranslations } from "next-intl";
import { useEffect } from "react";

/**
 * While guests wait, the tab reads "(n) Inbox" on every page, n being the nav's Your-turn count
 * (ADR 0019 "How", spec #84), so an operator on another tab sees it; with none, the page's own
 * title. Next writes each page's title on navigation, after this has run, so a watch on the
 * document head puts the count back, and keeps the page's title to restore.
 */
export function TabTitle({ count }: { count: number | null }) {
	const t = useTranslations("app.menu");
	const title = count ? `(${count}) ${t("inbox")}` : null;

	useEffect(() => {
		if (!title) return;
		let pageTitle = document.title;
		const apply = () => {
			if (document.title === title) return;
			pageTitle = document.title;
			document.title = title;
		};
		apply();
		const observer = new MutationObserver(apply);
		observer.observe(document.head, { childList: true, subtree: true, characterData: true });
		return () => {
			observer.disconnect();
			if (document.title === title) document.title = pageTitle;
		};
	}, [title]);

	return null;
}
