import { getActiveOrganization, getSession } from "@auth/lib/server";
import { ChangeOrganizationNameForm } from "@organizations/components/ChangeOrganizationNameForm";
import { DeleteOrganizationForm } from "@organizations/components/DeleteOrganizationForm";
import { OrganizationLogoForm } from "@organizations/components/OrganizationLogoForm";
import { PageHeader } from "@shared/components/PageHeader";
import { SettingsList } from "@shared/components/SettingsList";
import { permix, setupPermissions } from "@shared/lib/permix";
import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";

export async function generateMetadata() {
	const t = await getTranslations("organizations.settings");

	return {
		title: t("title"),
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

	const canManageDeletion = permix.check("organization.delete");

	const t = await getTranslations("organizations.settings");

	return (
		<>
			<PageHeader title={t("title")} subtitle={t("subtitle")} />

			<SettingsList>
				<OrganizationLogoForm />
				<ChangeOrganizationNameForm />
				{canManageDeletion && <DeleteOrganizationForm />}
			</SettingsList>
		</>
	);
}
