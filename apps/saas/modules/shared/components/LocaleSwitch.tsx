"use client";

import { useSwitchLocale } from "@i18n/lib/use-switch-locale";
import { LocaleSwitch as LocaleSwitchControl } from "@repo/ui";
import { isWalkLocale, resolveWalkLocale, walkLocaleOptions } from "@shared/lib/walk-locales";
import { useLocale, useTranslations } from "next-intl";

export function LocaleSwitch({
	showLabel,
	className,
	label,
}: {
	showLabel?: boolean;
	className?: string;
	label?: string;
} = {}) {
	const t = useTranslations();
	const switchLocale = useSwitchLocale();
	const currentLocale = useLocale();
	const languageLabel = label ?? t("common.aria.language");
	const value = resolveWalkLocale(currentLocale);

	return (
		<LocaleSwitchControl
			locales={walkLocaleOptions}
			value={value}
			label={languageLabel}
			triggerLabel={showLabel ? languageLabel : undefined}
			className={className}
			onValueChange={async (nextLocale) => {
				if (!isWalkLocale(nextLocale)) {
					return;
				}

				await switchLocale(nextLocale);
			}}
		/>
	);
}
