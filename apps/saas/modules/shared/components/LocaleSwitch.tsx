"use client";

import { updateLocale } from "@i18n/lib/update-locale";
import { config as i18nConfig, type Locale } from "@repo/i18n";
import { LocaleSwitch as LocaleSwitchControl } from "@repo/ui";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";

function isLocale(value: string): value is Locale {
	return Object.hasOwn(i18nConfig.locales, value);
}

const locales = Object.entries(i18nConfig.locales).map(([value, localeConfig]) => ({
	value,
	label: localeConfig.label,
}));

export function LocaleSwitch({
	showLabel,
	className,
}: {
	showLabel?: boolean;
	className?: string;
} = {}) {
	const t = useTranslations();
	const router = useRouter();
	const currentLocale = useLocale();
	const languageLabel = t("common.aria.language");

	return (
		<LocaleSwitchControl
			locales={locales}
			value={currentLocale}
			label={languageLabel}
			triggerLabel={showLabel ? languageLabel : undefined}
			className={className}
			onValueChange={async (nextLocale) => {
				if (!isLocale(nextLocale)) {
					return;
				}

				await updateLocale(nextLocale);
				router.refresh();
			}}
		/>
	);
}
