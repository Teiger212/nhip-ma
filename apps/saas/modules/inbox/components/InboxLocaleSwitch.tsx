"use client";

import { LocaleSwitch } from "@shared/components/LocaleSwitch";
import { useTranslations } from "next-intl";

export function InboxLocaleSwitch({ className }: { className?: string }) {
	const t = useTranslations();

	return (
		<LocaleSwitch
			showLabel
			label={t("inbox.language")}
			className={className ?? "min-h-11 min-w-11 h-11 px-3 font-medium"}
		/>
	);
}
