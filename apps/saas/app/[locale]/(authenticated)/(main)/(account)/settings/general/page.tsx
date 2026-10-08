import { getSession } from "@auth/lib/server";
import { isPlatformAdmin } from "@repo/auth/lib/roles";
import { ChangeEmailForm } from "@settings/components/ChangeEmailForm";
import { ChangeNameForm } from "@settings/components/ChangeNameForm";
import { DeleteAccountForm } from "@settings/components/DeleteAccountForm";
import { UserAvatarForm } from "@settings/components/UserAvatarForm";
import { UserLanguageForm } from "@settings/components/UserLanguageForm";
import { PageHeader } from "@shared/components/PageHeader";
import { SettingsList } from "@shared/components/SettingsList";
import { getTranslations } from "next-intl/server";
import { redirect } from "next/navigation";

export async function generateMetadata() {
	const t = await getTranslations("settings.account");

	return {
		title: t("title"),
	};
}

export default async function AccountSettingsPage() {
	const session = await getSession();

	if (!session) {
		redirect("/login");
	}

	const t = await getTranslations("settings.account");

	return (
		<>
			<PageHeader title={t("title")} subtitle={t("subtitle")} />

			<SettingsList>
				<UserAvatarForm />
				{/* An office member's language is the office's (ADR 0025); the platform admin keeps theirs. */}
				{isPlatformAdmin(session.user.role) ? <UserLanguageForm /> : null}
				<ChangeNameForm />
				<ChangeEmailForm />
				<DeleteAccountForm />
			</SettingsList>
		</>
	);
}
