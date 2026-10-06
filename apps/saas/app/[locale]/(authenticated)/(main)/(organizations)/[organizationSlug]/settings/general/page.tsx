import { AutoReplySetting } from "@inbox/components/AutoReplySetting";
import { ChangeOrganizationNameForm } from "@organizations/components/ChangeOrganizationNameForm";
import { DeleteOrganizationForm } from "@organizations/components/DeleteOrganizationForm";
import { OrganizationLogoForm } from "@organizations/components/OrganizationLogoForm";
import { requireOfficeManager } from "@organizations/lib/require-office-manager";
import { PageHeader } from "@shared/components/PageHeader";
import { SettingsList } from "@shared/components/SettingsList";
import { permix } from "@shared/lib/permix";
import { getTranslations } from "next-intl/server";

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
	const { organizationSlug } = await params;
	// Managers only (#212), before the page reads anything.
	await requireOfficeManager(organizationSlug);

	const canManageDeletion = permix.check("organization.delete");

	const t = await getTranslations("organizations.settings");

	return (
		<>
			<PageHeader title={t("title")} subtitle={t("subtitle")} />

			<SettingsList>
				<OrganizationLogoForm />
				<ChangeOrganizationNameForm />
				{/* The auto-reply switch is the managers' (ADR 0021 G6, #167); the guard above already
				    turned everyone else away. */}
				<AutoReplySetting />
				{canManageDeletion && <DeleteOrganizationForm />}
			</SettingsList>
		</>
	);
}
