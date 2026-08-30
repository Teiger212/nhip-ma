"use client";
import { toast } from "@repo/ui/components/toast";
import { SettingsItem } from "@shared/components/SettingsItem";
import { useTranslations } from "next-intl";

import { UserAvatarUpload } from "./UserAvatarUpload";

export function UserAvatarForm() {
	const t = useTranslations();

	return (
		<SettingsItem
			title={t("settings.account.avatar.title")}
			description={t("settings.account.avatar.description")}
		>
			<UserAvatarUpload
				onSuccess={() => {
					toast.add({ title: t("settings.account.avatar.notifications.success"), type: "success" });
				}}
				onError={() => {
					toast.add({ title: t("settings.account.avatar.notifications.error"), type: "error" });
				}}
			/>
		</SettingsItem>
	);
}
