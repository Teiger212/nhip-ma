"use client";

import { useLocalePathname, useLocaleRouter } from "@i18n/routing";
import { useOfficeLanguage } from "@inbox/lib/inbox-queries";
import type { OperatorLanguage } from "@inbox/lib/types";
import { useLocale } from "next-intl";
import { useEffect, useState } from "react";

/**
 * Keeps an office member's open page in the office language (ADR 0025) after the manager changes
 * it: the authenticated layout redirects on a page load, and this follows a change read while a
 * page is open (the open thread's poll refreshes it, as does the manager's own save). Rendered
 * for office members only; the platform admin keeps their own language.
 */
export function OfficeLocaleSync({ language: rendered }: { language: OperatorLanguage }) {
	// What the server read for this render is the freshest there is until something is read
	// after it: a value cached from before must not send the page back to a language the layout
	// has just redirected away from.
	const [mountedAt] = useState(() => Date.now());
	const query = useOfficeLanguage();
	const language =
		query.data !== undefined && query.dataUpdatedAt >= mountedAt ? query.data : rendered;
	const locale = useLocale();
	const router = useLocaleRouter();
	const pathname = useLocalePathname();

	useEffect(() => {
		if (language === locale) return;
		router.replace(`${pathname}${window.location.search}`, { locale: language });
	}, [language, locale, pathname, router]);

	return null;
}
