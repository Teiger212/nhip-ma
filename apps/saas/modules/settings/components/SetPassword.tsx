"use client";
import { useSession } from "@auth/hooks/use-session";
import { authClient } from "@repo/auth/client";
import { Button } from "@repo/ui/components/button";
import { toast } from "@repo/ui/components/toast";
import { SettingsItem } from "@shared/components/SettingsItem";
import { useTranslations } from "next-intl";
import { useState } from "react";

export function SetPasswordForm() {
	const t = useTranslations();
	const { user } = useSession();
	const [submitting, setSubmitting] = useState(false);

	const onSubmit = async () => {
		if (!user) {
			return;
		}

		setSubmitting(true);

		await authClient.requestPasswordReset(
			{
				email: user.email,
				redirectTo: `${window.location.origin}/reset-password`,
			},
			{
				onSuccess: () => {
					toast.add({
						title: t("settings.account.security.setPassword.notifications.success"),
						type: "success",
					});
				},
				onError: () => {
					toast.add({
						title: t("settings.account.security.setPassword.notifications.error"),
						type: "error",
					});
				},
				onResponse: () => {
					setSubmitting(false);
				},
			},
		);
	};

	return (
		<SettingsItem
			title={t("settings.account.security.setPassword.title")}
			description={t("settings.account.security.setPassword.description")}
		>
			<Button type="submit" loading={submitting} onClick={onSubmit}>
				{t("settings.account.security.setPassword.submit")}
			</Button>
		</SettingsItem>
	);
}
