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

	// Team is the managers' (#82): an agent finds no page here, not a read-only one.
	if (!permix.check("organization.manage")) {
		return notFound();
	}

	const t = await getTranslations("organizations.settings");

	return (
		<>
			<PageHeader title={t("members.title")} subtitle={t("members.description")} />

			<SettingsList>
				<InviteMemberForm organizationId={organization.id} />
				{/* The platform admin's inert row never reaches this page: the auth API leaves it out (#174). */}
				<OrganizationMembersBlock organizationId={organization.id} lockOwnRow />
			</SettingsList>
		</>
	);
}
