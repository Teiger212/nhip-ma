"use client";

import { useOfficeAutoReply, useSetOfficeAutoReply } from "@inbox/lib/inbox-queries";
import { Switch } from "@repo/ui";
import { toast } from "@repo/ui/components/toast";
import { SettingsItem } from "@shared/components/SettingsItem";
import { useTranslations } from "next-intl";

/**
 * The office's auto-reply switch (ADR 0021 G6, #167), on the office's General settings for its
 * managers. It saves on the flip, with no Save button; while saving it shows where it's going.
 */
export function AutoReplySetting() {
	const t = useTranslations("organizations.settings.autoReply");
	const current = useOfficeAutoReply();
	const setAutoReply = useSetOfficeAutoReply();
	const on = setAutoReply.isPending ? setAutoReply.variables : current.data?.on;

	const onCheckedChange = (next: boolean) => {
		setAutoReply.mutate(next, {
			onSuccess: () => toast.add({ title: t(next ? "turnedOn" : "turnedOff"), type: "success" }),
			onError: () => toast.add({ title: t("error"), type: "error" }),
		});
	};

	return (
		<SettingsItem title={t("title")} description={t("hint")}>
			<label className="gap-3 text-sm flex items-center">
				<Switch
					data-test="auto-reply-switch"
					aria-label={t("title")}
					checked={on ?? false}
					disabled={on === undefined || setAutoReply.isPending}
					onCheckedChange={onCheckedChange}
				/>
				<span className="text-muted-foreground">
					{on === undefined ? "…" : t(on ? "on" : "off")}
				</span>
			</label>
		</SettingsItem>
	);
}
