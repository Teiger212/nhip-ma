import { getOrganizationList } from "@auth/lib/server";
import { CreateOrganizationForm } from "@organizations/components/CreateOrganizationForm";
import { requireSession } from "@organizations/lib/require-session";
import { config } from "@repo/auth/config";
import { AuthWrapper } from "@shared/components/AuthWrapper";
import { getTranslations } from "next-intl/server";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export async function generateMetadata() {
	const t = await getTranslations("organizations.createForm");

	return {
		title: t("title"),
	};
}

export default async function NewOrganizationPage() {
	// Signed in, checked here and not only by the layout (#231).
	await requireSession();
	const organizations = await getOrganizationList();

	if (
		!config.organizations.enable ||
		(!config.organizations.enableUsersToCreateOrganizations &&
			(!config.organizations.requireOrganization || organizations.length > 0))
	) {
		redirect("/");
	}

	return (
		<AuthWrapper>
			<CreateOrganizationForm />
		</AuthWrapper>
	);
}
