import { getOrganizationList, getSession } from "@auth/lib/server";
import { localeRedirect } from "@i18n/routing";
import { listPurchases } from "@repo/api/modules/payments/procedures/list-purchases";
import { config as authConfig } from "@repo/auth/config";
import { config as paymentsConfig } from "@repo/payments/config";
import { createPurchasesHelper } from "@repo/payments/lib/helper";
import { getLocale } from "next-intl/server";
import { headers } from "next/headers";
import type { PropsWithChildren } from "react";

export default async function MainLayout({ children }: PropsWithChildren) {
	const session = await getSession();
	const locale = await getLocale();

	if (!session) {
		localeRedirect({ href: "/login", locale });
		return null;
	}

	if (authConfig.users.enableOnboarding && !session.user.onboardingComplete) {
		localeRedirect({ href: "/onboarding", locale });
		return null;
	}

	const organizations = await getOrganizationList();

	if (authConfig.organizations.enable && authConfig.organizations.requireOrganization) {
		const organization =
			organizations.find((org) => org.id === session.session.activeOrganizationId) ||
			organizations[0];

		if (!organization) {
			localeRedirect({ href: "/new-organization", locale });
			return null;
		}
	}

	if (paymentsConfig.requireActiveSubscription) {
		const organizationId = authConfig.organizations.enable
			? session.session.activeOrganizationId || organizations?.at(0)?.id
			: undefined;

		const purchases = await listPurchases.callable({
			context: { headers: await headers() },
		})({
			organizationId,
		});

		const { activePlan } = createPurchasesHelper(purchases);

		if (!activePlan) {
			localeRedirect({ href: "/choose-plan", locale });
			return null;
		}
	}

	return children;
}
