import { toMerged } from "es-toolkit";

import { config, type Locale } from "../config";
import deMail from "../translations/de/mail.json";
import deMarketing from "../translations/de/marketing.json";
import deSaas from "../translations/de/saas.json";
import deShared from "../translations/de/shared.json";
import enMail from "../translations/en/mail.json";
import enMarketing from "../translations/en/marketing.json";
import enSaas from "../translations/en/saas.json";
import enShared from "../translations/en/shared.json";
import esMail from "../translations/es/mail.json";
import esMarketing from "../translations/es/marketing.json";
import esSaas from "../translations/es/saas.json";
import esShared from "../translations/es/shared.json";
import frMail from "../translations/fr/mail.json";
import frMarketing from "../translations/fr/marketing.json";
import frSaas from "../translations/fr/saas.json";
import frShared from "../translations/fr/shared.json";
import viMail from "../translations/vi/mail.json";
import viMarketing from "../translations/vi/marketing.json";
import viSaas from "../translations/vi/saas.json";
import viShared from "../translations/vi/shared.json";

export type TranslationScope = "marketing" | "saas" | "mail";

const catalogs = {
	en: { saas: enSaas, shared: enShared, marketing: enMarketing, mail: enMail },
	de: { saas: deSaas, shared: deShared, marketing: deMarketing, mail: deMail },
	es: { saas: esSaas, shared: esShared, marketing: esMarketing, mail: esMail },
	fr: { saas: frSaas, shared: frShared, marketing: frMarketing, mail: frMail },
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
