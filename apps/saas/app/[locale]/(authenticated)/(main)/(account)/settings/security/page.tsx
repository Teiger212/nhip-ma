import { userAccountQueryKey, userPasskeyQueryKey } from "@auth/lib/api";
import { getUserAccounts, getUserPasskeys } from "@auth/lib/server";
import { requireSession } from "@organizations/lib/require-session";
import { config } from "@repo/auth/config";
import { ActiveSessionsBlock } from "@settings/components/ActiveSessionsBlock";
import { ChangePasswordForm } from "@settings/components/ChangePassword";
import { ConnectedAccountsBlock } from "@settings/components/ConnectedAccountsBlock";
import { PasskeysBlock } from "@settings/components/PasskeysBlock";
import { SetPasswordForm } from "@settings/components/SetPassword";
import { TwoFactorBlock } from "@settings/components/TwoFactorBlock";
import { PageHeader } from "@shared/components/PageHeader";
import { SettingsList } from "@shared/components/SettingsList";
import { getServerQueryClient } from "@shared/lib/server";
import { getTranslations } from "next-intl/server";

export async function generateMetadata() {
	const t = await getTranslations("settings.account.security");

	return {
		title: t("title"),
	};
}

export default async function AccountSettingsPage() {
	// Signed in, checked here and not only by the layout (#231), before the accounts are read.
	await requireSession();

	const userAccounts = await getUserAccounts();

	const userHasPassword = userAccounts?.some((account) => account.providerId === "credential");

	const queryClient = getServerQueryClient();

	await queryClient.prefetchQuery({
		queryKey: userAccountQueryKey,
		queryFn: () => getUserAccounts(),
	});

	if (config.enablePasskeys) {
		await queryClient.prefetchQuery({
			queryKey: userPasskeyQueryKey,
			queryFn: () => getUserPasskeys(),
		});
	}

	const t = await getTranslations("settings.account.security");

	return (
		<>
			<PageHeader title={t("title")} />

			<SettingsList>
				{config.enablePasswordLogin &&
					(userHasPassword ? <ChangePasswordForm /> : <SetPasswordForm />)}
				{config.enableSocialLogin && <ConnectedAccountsBlock />}
				{config.enablePasskeys && <PasskeysBlock />}
				{config.enableTwoFactor && <TwoFactorBlock />}
				<ActiveSessionsBlock />
			</SettingsList>
		</>
	);
}
