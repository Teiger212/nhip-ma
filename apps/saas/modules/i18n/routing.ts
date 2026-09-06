import { config } from "@repo/i18n";
import { createNavigation } from "next-intl/navigation";
import { defineRouting } from "next-intl/routing";

export const routing = defineRouting({
	locales: Object.keys(config.locales),
	defaultLocale: config.defaultLocale,
	localeCookie: {
		name: config.localeCookieName,
	},
	localePrefix: "always",
	localeDetection: Object.keys(config.locales).length > 1,
});

export const {
	Link: LocaleLink,
	redirect: localeRedirect,
	usePathname: useLocalePathname,
	useRouter: useLocaleRouter,
	getPathname,
} = createNavigation(routing);
