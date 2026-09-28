import { Inbox } from "@inbox/components/Inbox";
import { sendPlatformAdminToAdminArea } from "@shared/lib/platform-admin";
import { getTranslations } from "next-intl/server";

export async function generateMetadata() {
	const t = await getTranslations("app.menu");
	return {
		title: t("inbox"),
	};
}

export default async function InboxPage() {
	await sendPlatformAdminToAdminArea();
	return <Inbox />;
}
