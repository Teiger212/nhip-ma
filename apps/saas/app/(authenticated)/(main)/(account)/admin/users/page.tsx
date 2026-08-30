import { UserList } from "@admin/component/users/UserList";
import { getTranslations } from "next-intl/server";

export async function generateMetadata() {
	const t = await getTranslations("admin.users");

	return {
		title: t("title"),
	};
}

export default function AdminUserPage() {
	return (
		<div>
			<UserList />
		</div>
	);
}
