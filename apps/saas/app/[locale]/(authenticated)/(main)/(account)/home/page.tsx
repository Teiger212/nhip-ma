import { Home } from "@home/components/Home";
import { getTranslations } from "next-intl/server";

export async function generateMetadata() {
	const t = await getTranslations("app.menu");
	return {
		title: t("home"),
	};
}

export default function HomePage() {
	return <Home />;
}
