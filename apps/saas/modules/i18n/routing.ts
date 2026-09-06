import { config } from "@repo/i18n";
import { walkLocales } from "@shared/lib/walk-locales";
import { createNavigation } from "next-intl/navigation";
import { defineRouting } from "next-intl/routing";

export const routing = defineRouting({
	locales: walkLocales,
	defaultLocale: config.defaultLocale,
	localeCookie: {
		name: config.localeCookieName,
	},
	localePrefix: "always",
	localeDetection: walkLocales.length > 1,
});

export const {
	Link: LocaleLink,
	redirect: localeRedirect,
	usePathname: useLocalePathname,
	useRouter: useLocaleRouter,
	getPathname,
} = createNavigation(routing);
