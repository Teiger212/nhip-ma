import { getActiveOrganization, getSession } from "@auth/lib/server";
import { InviteMemberForm } from "@organizations/components/InviteMemberForm";
import { OrganizationMembersBlock } from "@organizations/components/OrganizationMembersBlock";
import { isPlatformAdmin } from "@repo/auth/lib/roles";
import { db } from "@repo/database";
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

	// The platform admin's membership is inert (ADR 0015): not one of the office's people.
	const platformAdminIds = (
		await db.member.findMany({
			where: { organizationId: organization.id },
			select: { userId: true, user: { select: { role: true } } },
		})
	)
		.filter((member) => isPlatformAdmin(member.user.role))
		.map((member) => member.userId);

	const t = await getTranslations("organizations.settings");

	return (
		<>
			<PageHeader title={t("members.title")} subtitle={t("members.description")} />

			<SettingsList>
				<InviteMemberForm organizationId={organization.id} />
				<OrganizationMembersBlock
					organizationId={organization.id}
					hiddenUserIds={platformAdminIds}
					lockOwnRow
				/>
			</SettingsList>
		</>
	);
}
