"use client";

import { useLocalePathname, useLocaleRouter } from "@i18n/routing";
import { config as i18nConfig } from "@repo/i18n";
import { LocaleSwitch as LocaleSwitchControl } from "@repo/ui";
import { useLocale, useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";

const locales = Object.entries(i18nConfig.locales).map(([value, localeConfig]) => ({
	value,
	label: localeConfig.label,
}));

export function LocaleSwitch() {
	const t = useTranslations();
	const localeRouter = useLocaleRouter();
	const localePathname = useLocalePathname();
	const searchParams = useSearchParams();
	const currentLocale = useLocale();

	return (
		<LocaleSwitchControl
			locales={locales}
			value={currentLocale}
			label={t("common.aria.language")}
			onValueChange={(nextLocale) => {
				localeRouter.replace(`${localePathname}?${searchParams.toString()}`, {
					locale: nextLocale,
				});
			}}
		/>
	);
}
