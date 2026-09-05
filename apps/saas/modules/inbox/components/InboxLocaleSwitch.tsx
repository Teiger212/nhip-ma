"use client";

import { updateLocale } from "@i18n/lib/update-locale";
import { config as i18nConfig, type Locale } from "@repo/i18n";
import { LocaleSwitch } from "@repo/ui";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";

const walkLocales = ["en", "vi"] as const satisfies readonly Locale[];

function isWalkLocale(value: string): value is (typeof walkLocales)[number] {
	return (walkLocales as readonly string[]).includes(value);
}

const locales = walkLocales.map((value) => ({
	value,
	label: i18nConfig.locales[value].label,
}));

export function InboxLocaleSwitch({ className }: { className?: string }) {
	const t = useTranslations();
	const router = useRouter();
	const currentLocale = useLocale();
	const value = isWalkLocale(currentLocale) ? currentLocale : "en";

	return (
		<LocaleSwitch
			locales={locales}
			value={value}
			label={t("inbox.language")}
			triggerLabel={t("inbox.language")}
			className={className ?? "min-h-11 min-w-11 h-11 px-3 font-medium"}
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
