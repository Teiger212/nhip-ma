"use client";

import { config } from "@config";
import { authClient } from "@repo/auth/client";
import { Button } from "@repo/ui/components/button";
import { toast } from "@repo/ui/components/toast";
import { useTranslations } from "next-intl";
import { parseAsString, useQueryState } from "nuqs";

import { oAuthProviders } from "../constants/oauth-providers";

export function SocialSigninButton({
	provider,
	className,
}: {
	provider: keyof typeof oAuthProviders;
	className?: string;
}) {
	const t = useTranslations();
	const [invitationId] = useQueryState("invitationId", parseAsString);
	const providerData = oAuthProviders[provider];

	const redirectPath = invitationId
		? `/organization-invitation/${invitationId}`
		: config.redirectAfterSignIn;

	const onSignin = async () => {
		const callbackURL = new URL(redirectPath, window.location.origin);
		const { error } = await authClient.signIn.social({
			provider,
			callbackURL: callbackURL.toString(),
		});

		if (error) {
			toast.add({ title: t("auth.login.hints.socialSigninFailed"), type: "error" });
		}
	};

	return (
		<Button onClick={() => onSignin()} variant="secondary" type="button" className={className}>
			{providerData.icon && (
				<i className="mr-2 text-primary">
					<providerData.icon className="size-4" />
				</i>
			)}
			{providerData.name}
		</Button>
	);
}
