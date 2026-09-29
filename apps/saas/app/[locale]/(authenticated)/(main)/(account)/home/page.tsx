import { Home } from "@home/components/Home";
import { sendPlatformAdminToAdminArea } from "@shared/lib/platform-admin";
import { getTranslations } from "next-intl/server";

export async function generateMetadata() {
	const t = await getTranslations("app.menu");
	return {
		title: t("home"),
	};
}

export default async function HomePage() {
	await sendPlatformAdminToAdminArea();
	return <Home />;
}
