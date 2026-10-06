import { InviteMemberForm } from "@organizations/components/InviteMemberForm";
import { OrganizationMembersBlock } from "@organizations/components/OrganizationMembersBlock";
import { requireOfficeManager } from "@organizations/lib/require-office-manager";
import { PageHeader } from "@shared/components/PageHeader";
import { SettingsList } from "@shared/components/SettingsList";
import { getTranslations } from "next-intl/server";

export async function generateMetadata() {
	const t = await getTranslations("organizations.settings");

	return {
		title: t("members.title"),
	};
}

export default async function OrganizationSettingsPage({
	params,
}: {
	params: Promise<{ organizationSlug: string }>;
}) {
	const { organizationSlug } = await params;
	// Team is the managers' (#82): an agent finds no page here, not a read-only one (#212).
	const { organization } = await requireOfficeManager(organizationSlug);

	const t = await getTranslations("organizations.settings");

	return (
		<>
			<PageHeader title={t("members.title")} subtitle={t("members.description")} />

			<SettingsList>
				<InviteMemberForm organizationId={organization.id} />
				{/* The auth API leaves the platform admin's inert row out for managers (#174). */}
				<OrganizationMembersBlock organizationId={organization.id} lockOwnRow />
			</SettingsList>
		</>
	);
}
