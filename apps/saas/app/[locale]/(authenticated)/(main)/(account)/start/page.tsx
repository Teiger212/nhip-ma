import { getOrganizationList } from "@auth/lib/server";
import { OrganizationsGrid } from "@organizations/components/OrganizationsGrid";
import { requireSession } from "@organizations/lib/require-session";
import { config } from "@repo/auth/config";
import { Card } from "@repo/ui";
import { PageHeader } from "@shared/components/PageHeader";
import { KIT_SCREENS } from "@shared/lib/kit-screens";
import { getTranslations } from "next-intl/server";
import { redirect } from "next/navigation";
import { notFound } from "next/navigation";

export async function generateMetadata() {
	const t = await getTranslations("app.menu");

	return {
		title: t("start"),
	};
}

export default async function AppStartPage() {
	if (!KIT_SCREENS.start) notFound();
	// Signed in, checked here and not only by the layout (#231), before anything is read.
	const session = await requireSession();

	const organizations = await getOrganizationList();

	if (config.organizations.enable && config.organizations.requireOrganization) {
		const organization =
			organizations.find((org) => org.id === session.session.activeOrganizationId) ||
			organizations[0];

		if (!organization) {
			redirect("/new-organization");
		}

		redirect(`/${organization.slug}`);
	}

	const t = await getTranslations("start");

	return (
		<div className="">
			<PageHeader title={t("welcome", { name: session.user.name })} subtitle={t("subtitle")} />

			<div>
				{config.organizations.enable && <OrganizationsGrid />}

				<Card className="mt-6">
					<div className="h-64 p-8 flex items-center justify-center text-foreground/60">
						Place your content here...
					</div>
				</Card>
			</div>
		</div>
	);
}
