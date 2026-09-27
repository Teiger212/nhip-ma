import { toMerged } from "es-toolkit";

import { config, type Locale } from "../config";
import enMail from "../translations/en/mail.json";
import enMarketing from "../translations/en/marketing.json";
import enSaas from "../translations/en/saas.json";
import enShared from "../translations/en/shared.json";
import viMail from "../translations/vi/mail.json";
import viMarketing from "../translations/vi/marketing.json";
import viSaas from "../translations/vi/saas.json";
import viShared from "../translations/vi/shared.json";

export type TranslationScope = "marketing" | "saas" | "mail";

const catalogs = {
	en: { saas: enSaas, shared: enShared, marketing: enMarketing, mail: enMail },
	vi: { saas: viSaas, shared: viShared, marketing: viMarketing, mail: viMail },
} as const;

function importLocaleMessages<T>(locale: Locale, scope: TranslationScope | "shared"): T {
	return catalogs[locale][scope] as T;
}

export async function getMessagesForLocale<T = Record<string, unknown>>(
	locale: Locale,
	scope: TranslationScope,
): Promise<T> {
	const localeMessages = importLocaleMessages<T>(locale, scope);

	const sharedMessages = importLocaleMessages<Record<string, unknown>>(locale, "shared");

	let messages = toMerged(localeMessages as Record<string, unknown>, sharedMessages) as T;

	if (locale !== config.defaultLocale) {
		const defaultLocaleMessages = importLocaleMessages<T>(config.defaultLocale, scope);
		const defaultSharedMessages = importLocaleMessages<Record<string, unknown>>(
			config.defaultLocale,
			"shared",
		);
		const defaultMessages = toMerged(
			defaultLocaleMessages as Record<string, unknown>,
			defaultSharedMessages,
		);
		messages = toMerged(defaultMessages, messages as Record<string, unknown>) as T;
	}

	return messages;
}
