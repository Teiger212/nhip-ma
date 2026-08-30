import { Inbox } from "@inbox/components/Inbox";
import { getTranslations } from "next-intl/server";

export async function generateMetadata() {
	const t = await getTranslations("inbox");
	return {
		title: t("navItem"),
	};
}

export default function InboxPage() {
	return <Inbox />;
}
