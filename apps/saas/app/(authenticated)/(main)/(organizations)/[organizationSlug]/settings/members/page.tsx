import { getActiveOrganization, getSession } from "@auth/lib/server";
import { InviteMemberForm } from "@organizations/components/InviteMemberForm";
import { OrganizationMembersBlock } from "@organizations/components/OrganizationMembersBlock";
import { PageHeader } from "@shared/components/PageHeader";
import { SettingsList } from "@shared/components/SettingsList";
import { permix, setupPermissions } from "@shared/lib/permix";
import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";

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
	const session = await getSession();
	const { organizationSlug } = await params;
	const organization = await getActiveOrganization(organizationSlug);

	if (!organization) {
		return notFound();
	}

	const membershipRole = organization.members.find(
		(member) => member.userId === session?.user.id,
	)?.role;

	setupPermissions({
		user: session?.user,
		membershipRole,
	});

	const t = await getTranslations("organizations.settings");

	return (
		<>
			<PageHeader title={t("members.title")} subtitle={t("members.description")} />

			<SettingsList>
				{permix.check("organization.manage") && (
					<InviteMemberForm organizationId={organization.id} />
				)}
				<OrganizationMembersBlock organizationId={organization.id} />
			</SettingsList>
		</>
	);
}
