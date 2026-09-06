"use client";

import { useLocalePathname, useLocaleRouter } from "@i18n/routing";
import type { Locale } from "@repo/i18n";

import { updateLocale } from "./update-locale";

export function useSwitchLocale() {
	const router = useLocaleRouter();
	const pathname = useLocalePathname();

	return async (locale: Locale) => {
		await updateLocale(locale);
		router.replace(pathname, { locale });
	};
}
