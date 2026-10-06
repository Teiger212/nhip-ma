import { requireOfficeManager } from "@organizations/lib/require-office-manager";
import { ActivePlan } from "@payments/components/ActivePlan";
import { ChangePlan } from "@payments/components/ChangePlan";
import { listPurchases } from "@payments/lib/server";
import { createPurchasesHelper } from "@repo/payments/lib/helper";
import { PageHeader } from "@shared/components/PageHeader";
import { SettingsList } from "@shared/components/SettingsList";
import { KIT_SCREENS } from "@shared/lib/kit-screens";
import { orpc } from "@shared/lib/orpc-query-utils";
import { getServerQueryClient } from "@shared/lib/server";
import { getTranslations } from "next-intl/server";

export async function generateMetadata() {
	const t = await getTranslations("settings.billing");

	return {
		title: t("title"),
	};
}

export default async function BillingSettingsPage({
	params,
}: {
	params: Promise<{ organizationSlug: string }>;
}) {
	// Hidden, as the account's Billing is, before the page reads anything (#210).
	if (!KIT_SCREENS.officeBilling) notFound();
	const { organizationSlug } = await params;
	// Managers only (#212), before the purchases are read.
	const { organization } = await requireOfficeManager(organizationSlug);

	const purchases = await listPurchases(organization.id);

	const queryClient = getServerQueryClient();

	await queryClient.prefetchQuery({
		queryKey: orpc.payments.listPurchases.queryKey({
			input: {
				organizationId: organization.id,
			},
		}),
		queryFn: () => purchases,
	});

	const { activePlan } = createPurchasesHelper(purchases);

	const t = await getTranslations("settings.billing");

	return (
		<>
			<PageHeader title={t("title")} subtitle={t("changePlan.description")} />

			<SettingsList>
				{activePlan && <ActivePlan organizationId={organization.id} />}
				<ChangePlan organizationId={organization.id} activePlanId={activePlan?.id} />
			</SettingsList>
		</>
	);
}
