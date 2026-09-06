"use client";

import { updateLocale } from "@i18n/lib/update-locale";
import { LocaleSwitch as LocaleSwitchControl } from "@repo/ui";
import { isWalkLocale, resolveWalkLocale, walkLocaleOptions } from "@shared/lib/walk-locales";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";

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
	const router = useRouter();
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

				await updateLocale(nextLocale);
				router.refresh();
			}}
		/>
	);
}
