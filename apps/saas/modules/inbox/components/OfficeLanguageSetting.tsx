"use client";

import { useOfficeLanguage, useSetOfficeLanguage } from "@inbox/lib/inbox-queries";
import type { OperatorLanguage } from "@inbox/lib/types";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@repo/ui/components/select";
import { toast } from "@repo/ui/components/toast";
import { SettingsItem } from "@shared/components/SettingsItem";
import { walkLocaleOptions } from "@shared/lib/walk-locales";
import { useTranslations } from "next-intl";

const items = walkLocaleOptions.map(({ value, label }) => ({ value, label }));

/**
 * The office language (ADR 0025), on the office's General settings for its managers, beside the
 * auto-reply switch. It saves on the choice, with no Save button; while saving it shows where
 * it's going.
 */
export function OfficeLanguageSetting() {
	const t = useTranslations("organizations.settings.officeLanguage");
	const current = useOfficeLanguage();
	const setLanguage = useSetOfficeLanguage();
	const language = setLanguage.isPending ? setLanguage.variables : current.data;

	const onValueChange = (next: OperatorLanguage) => {
		if (next === language) return;
		setLanguage.mutate(next, {
			onSuccess: () => toast.add({ title: t("saved"), type: "success" }),
			onError: () => toast.add({ title: t("error"), type: "error" }),
		});
	};

	return (
		<SettingsItem title={t("title")} description={t("hint")}>
			{current.isError ? (
				<p className="text-sm text-muted-foreground">{t("loadError")}</p>
			) : (
				<Select
					value={language ?? null}
					items={items}
					onValueChange={(value) => {
						if (value === "en" || value === "vi") onValueChange(value);
					}}
					disabled={language === undefined || setLanguage.isPending}
				>
					<SelectTrigger aria-label={t("title")} data-test="office-language">
						<SelectValue />
					</SelectTrigger>
					<SelectContent>
						{items.map((option) => (
							<SelectItem key={option.value} value={option.value}>
								{option.label}
							</SelectItem>
						))}
					</SelectContent>
				</Select>
			)}
		</SettingsItem>
	);
}
