import { Inbox } from "@inbox/components/Inbox";
import { getTranslations } from "next-intl/server";

export async function generateMetadata() {
	const t = await getTranslations("app.menu");
	return {
		title: t("inbox"),
	};
}

export default function InboxPage() {
	return <Inbox />;
}
