import { Home } from "@home/components/Home";
import { requireSession } from "@organizations/lib/require-session";
import { sendPlatformAdminToAdminArea } from "@shared/lib/platform-admin";
import { getTranslations } from "next-intl/server";

export async function generateMetadata() {
	const t = await getTranslations("app.menu");
	return {
		title: t("home"),
	};
}

export default async function HomePage() {
	// Signed in, checked here and not only by the layout (#231), before Home counts anything.
	await requireSession();
	await sendPlatformAdminToAdminArea();
	return <Home />;
}
