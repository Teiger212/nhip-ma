"use client";

import { useLocalePathname, useLocaleRouter } from "@i18n/routing";
import { useOfficeLanguage } from "@inbox/lib/inbox-queries";
import { useLocale } from "next-intl";
import { useEffect } from "react";

/**
 * Keeps an office member's open page in the office language (ADR 0025) after the manager changes
 * it: the authenticated layout redirects on a page load, and this follows a change read while a
 * page is open (the open thread's poll refreshes it, as does the manager's own save). Rendered
 * for office members only; the platform admin keeps their own language.
 */
export function OfficeLocaleSync() {
	const language = useOfficeLanguage().data;
	const locale = useLocale();
	const router = useLocaleRouter();
	const pathname = useLocalePathname();

	useEffect(() => {
		if (!language || language === locale) return;
		router.replace(`${pathname}${window.location.search}`, { locale: language });
	}, [language, locale, pathname, router]);

	return null;
}
