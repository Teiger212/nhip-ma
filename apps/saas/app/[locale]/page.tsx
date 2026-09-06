import { localeRedirect } from "@i18n/routing";

export default async function LocaleRootPage({ params }: { params: Promise<{ locale: string }> }) {
	const { locale } = await params;
	localeRedirect({ href: "/inbox", locale });
}
