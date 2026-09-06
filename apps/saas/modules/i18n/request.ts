import { config as i18nConfig } from "@repo/i18n";
import { getRequestConfig } from "next-intl/server";
import { cookies } from "next/headers";

import { getMessagesForLocale } from "./lib/messages";

export default getRequestConfig(async ({ requestLocale }) => {
	const cookieStore = await cookies();
	const cookieLocale = cookieStore.get(i18nConfig.localeCookieName)?.value;
	let locale = cookieLocale ?? (await requestLocale) ?? i18nConfig.defaultLocale;

	if (!(locale in i18nConfig.locales)) {
		locale = i18nConfig.defaultLocale;
	}

	return {
		locale,
		messages: await getMessagesForLocale(locale),
	};
});
