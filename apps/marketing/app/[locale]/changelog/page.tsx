import { ChangelogSection } from "@changelog/components/ChangelogSection";
import { SectionHeader } from "@home/components/SectionHeader";
import { getTranslations, setRequestLocale } from "next-intl/server";

export async function generateMetadata(props: { params: Promise<{ locale: string }> }) {
	const { locale } = await props.params;
	const t = await getTranslations({ locale, namespace: "changelog" });
	return {
		title: t("title"),
		description: t("description"),
	};
}

export default async function ChangelogPage(props: { params: Promise<{ locale: string }> }) {
	const { locale } = await props.params;
	setRequestLocale(locale);

	const t = await getTranslations({ locale, namespace: "changelog" });

	return (
		<div className="py-20 md:py-24 lg:py-28 lg:pb-40">
			<div className="container">
				<SectionHeader
					titleAs="h1"
					eyebrow={t("badge")}
					title={t("title")}
					description={t("description")}
				/>

				<ChangelogSection />
			</div>
		</div>
	);
}
