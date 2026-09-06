import { AnalyticsScript } from "@analytics";
import { config } from "@config";
import { config as i18nConfig } from "@i18n/config";
import { cn, ThemeProvider } from "@repo/ui";
import { ClientProviders } from "@shared/components/ClientProviders";
import { ConsentBanner } from "@shared/components/ConsentBanner";
import { ConsentProvider } from "@shared/components/ConsentProvider";
import { Footer } from "@shared/components/Footer";
import { NavBar } from "@shared/components/NavBar";
import { getTheme, getThemeScript } from "@teispace/next-themes/server";
import { NextIntlClientProvider } from "next-intl";
import { getMessages, setRequestLocale } from "next-intl/server";
import { DM_Sans, Inter } from "next/font/google";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import type { PropsWithChildren } from "react";

const sansFont = Inter({
	subsets: ["latin"],
	variable: "--font-inter",
});

const headingFont = DM_Sans({
	subsets: ["latin"],
	variable: "--font-dm-sans",
});

const locales = Object.keys(i18nConfig.locales) as string[];

export function generateStaticParams() {
	return locales.map((locale) => ({ locale }));
}

export default async function MarketingLayout({
	children,
	params,
}: PropsWithChildren<{ params: Promise<{ locale: string }> }>) {
	const { locale } = await params;

	if (!locales.includes(locale)) {
		notFound();
	}

	setRequestLocale(locale);

	const messages = await getMessages();

	const cookieStore = await cookies();
	const consentCookie = cookieStore.get("consent");
	const themeOptions = {
		attribute: "class" as const,
		enableSystem: true,
		defaultTheme: config.defaultTheme,
		themes: Array.from(config.enabledThemes),
	};
	const initialTheme = (await getTheme({ themes: themeOptions.themes })) ?? undefined;
	const themeScript = getThemeScript({
		...themeOptions,
		initialTheme,
	});

	return (
		<html
			lang={locale}
			suppressHydrationWarning
			className={cn(sansFont.variable, headingFont.variable)}
		>
			<head>
				<script dangerouslySetInnerHTML={{ __html: themeScript }} />
			</head>
			<body className={cn("font-sans min-h-screen bg-background text-foreground antialiased")}>
				<ConsentProvider initialConsent={consentCookie?.value === "true"}>
					<NextIntlClientProvider locale={locale} messages={messages}>
						<ClientProviders>
							<ThemeProvider
								{...themeOptions}
								disableTransitionOnChange
								initialTheme={initialTheme}
								noScript
							>
								<NavBar />

								<main className="min-h-screen">{children}</main>

								<Footer />

								<ConsentBanner />
								<AnalyticsScript />
							</ThemeProvider>
						</ClientProviders>
					</NextIntlClientProvider>
				</ConsentProvider>
			</body>
		</html>
	);
}
