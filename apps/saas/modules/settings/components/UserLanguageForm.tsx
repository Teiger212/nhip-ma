"use client";

import { updateLocale } from "@i18n/lib/update-locale";
import { useLocalePathname, useLocaleRouter } from "@i18n/routing";
import { authClient } from "@repo/auth/client";
import type { Locale } from "@repo/i18n";
import { config as i18nConfig } from "@repo/i18n";
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
import { useMutation } from "@tanstack/react-query";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";

export function UserLanguageForm() {
	const currentLocale = useLocale();
	const t = useTranslations();
	const router = useLocaleRouter();
	const pathname = useLocalePathname();
	const [locale, setLocale] = useState<Locale | undefined>(currentLocale as Locale);

	const updateLocaleMutation = useMutation({
		mutationFn: async () => {
			if (!locale) {
				return;
			}

			await authClient.updateUser({
				locale,
			});
			await updateLocale(locale);
			router.replace(pathname, { locale });
		},
	});

	const saveLocale = async () => {
		try {
			await updateLocaleMutation.mutateAsync();

			toast.add({ title: t("settings.account.language.notifications.success"), type: "success" });
		} catch {
			toast.add({ title: t("settings.account.language.notifications.error"), type: "error" });
		}
	};

	if (Object.keys(i18nConfig.locales).length <= 1) {
		return null;
	}

	const localeItems = walkLocaleOptions.map(({ value, label }) => ({
		value,
		label,
	}));

	return (
		<SettingsItem
			title={t("settings.account.language.title")}
			description={t("settings.account.language.description")}
		>
			<Select
				value={locale}
				items={localeItems}
				onValueChange={(value) => {
					setLocale(value as Locale);
					void saveLocale();
				}}
				disabled={updateLocaleMutation.isPending}
			>
				<SelectTrigger>
					<SelectValue />
				</SelectTrigger>
				<SelectContent>
					{walkLocaleOptions.map((option) => (
						<SelectItem key={option.value} value={option.value}>
							{option.label}
						</SelectItem>
					))}
				</SelectContent>
			</Select>
		</SettingsItem>
	);
}
