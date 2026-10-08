"use client";

import { useSession } from "@auth/hooks/use-session";
import { zodResolver } from "@hookform/resolvers/zod";
import { conversationsQueryKey } from "@inbox/lib/inbox-queries";
import { NAME_GUESTS_SEE_MAX, NameGuestsSee } from "@inbox/lib/name-guests-see";
import { Button } from "@repo/ui/components/button";
import { Input } from "@repo/ui/components/input";
import { toast } from "@repo/ui/components/toast";
import { SettingsItem } from "@shared/components/SettingsItem";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useForm } from "react-hook-form";
import { z } from "zod";

const formSchema = z.object({ nameGuestsSee: NameGuestsSee });

/**
 * "Name guests see" (#266), on the kit's account page next to the account name: the name the
 * template suggested reply introduces this operator by. Saved through Nhịp's route, which also
 * writes the untouched suggestion again on their threads; blank clears it.
 */
export function NameGuestsSeeForm() {
	const { user, reloadSession } = useSession();
	const queryClient = useQueryClient();
	const t = useTranslations("settings.account.nameGuestsSee");
	const tSettings = useTranslations("settings");

	const form = useForm({
		resolver: zodResolver(formSchema),
		defaultValues: { nameGuestsSee: user?.nameGuestsSee ?? "" },
	});

	const onSubmit = form.handleSubmit(async ({ nameGuestsSee }) => {
		const res = await fetch("/api/account/name-guests-see", {
			method: "PUT",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ nameGuestsSee }),
		}).catch(() => null);
		if (!res?.ok) {
			toast.add({ title: t("notifications.error"), type: "error" });
			return;
		}
		const saved = ((await res.json()) as { nameGuestsSee: string | null }).nameGuestsSee;
		// The suggestions on this operator's threads may have been written again.
		await queryClient.invalidateQueries({ queryKey: conversationsQueryKey });
		await reloadSession();
		toast.add({ title: t("notifications.success"), type: "success" });
		form.reset({ nameGuestsSee: saved ?? "" });
	});

	return (
		<SettingsItem title={t("title")} description={t("description")}>
			<form onSubmit={onSubmit}>
				<Input
					type="text"
					aria-label={t("title")}
					maxLength={NAME_GUESTS_SEE_MAX}
					placeholder={t("placeholder")}
					{...form.register("nameGuestsSee")}
				/>

				<div className="mt-4 flex justify-end">
					<Button
						type="submit"
						loading={form.formState.isSubmitting}
						disabled={!(form.formState.isValid && form.formState.dirtyFields.nameGuestsSee)}
					>
						{tSettings("save")}
					</Button>
				</div>
			</form>
		</SettingsItem>
	);
}
