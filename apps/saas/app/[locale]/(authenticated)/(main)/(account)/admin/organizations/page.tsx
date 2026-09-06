import { OrganizationList } from "@admin/component/organizations/OrganizationList";
import { getTranslations } from "next-intl/server";

export async function generateMetadata() {
	const t = await getTranslations("admin.organizations");

	return {
		title: t("title"),
	};
}

export default function AdminOrganizationsPage() {
	return <OrganizationList />;
}
