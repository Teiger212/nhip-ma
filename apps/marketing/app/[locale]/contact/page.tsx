import { ContactForm } from "@home/components/ContactForm";
import { SectionHeader } from "@home/components/SectionHeader";
import { getTranslations, setRequestLocale } from "next-intl/server";

export async function generateMetadata(props: { params: Promise<{ locale: string }> }) {
	const { locale } = await props.params;
	const t = await getTranslations({ locale, namespace: "contact" });
	return {
		title: t("title"),
		description: t("description"),
	};
}

export default async function ContactPage(props: { params: Promise<{ locale: string }> }) {
	const { locale } = await props.params;
	setRequestLocale(locale);

	const t = await getTranslations({ locale, namespace: "contact" });
	return (
		<div className="py-20 md:py-24 lg:py-28 lg:pb-40">
			<div className="container">
				<div className="gap-14 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)] lg:gap-20 lg:items-start grid w-full grid-cols-1">
					<SectionHeader
						titleAs="h1"
						className="mb-0 lg:mb-0"
						eyebrow={t("badge")}
						title={t("title")}
						description={t("description")}
					/>

					<ContactForm />
				</div>
			</div>
		</div>
	);
}
