import type { I18nConfig } from "./types";

export const config = {
	locales: {
		en: {
			label: "English",
			currency: "USD",
		},
		de: {
			label: "Deutsch",
			currency: "USD",
		},
		es: {
			label: "Español",
			currency: "USD",
		},
		fr: {
			label: "Français",
			currency: "USD",
		},
		vi: {
			label: "Tiếng Việt",
			currency: "VND",
		},
	},
	defaultLocale: "en",
	defaultCurrency: "USD",
	localeCookieName: "NEXT_LOCALE",
} as const satisfies I18nConfig;

export type Locale = keyof typeof config.locales;
