import { config } from "@config";
import { routing } from "@i18n/routing";
import { cn, ThemeProvider, Toaster } from "@repo/ui";
import { ApiClientProvider } from "@shared/components/ApiClientProvider";
import { ClientProviders } from "@shared/components/ClientProviders";
import { getTheme, getThemeScript } from "@teispace/next-themes/server";
import { hasLocale } from "next-intl";
import { NextIntlClientProvider } from "next-intl";
import { getMessages, getTranslations, setRequestLocale } from "next-intl/server";
import { IBM_Plex_Mono, Manrope } from "next/font/google";
import { notFound } from "next/navigation";
import { NuqsAdapter } from "nuqs/adapters/next/app";
import type { PropsWithChildren } from "react";

// One family for headings and body (DESIGN.md, #314): Manrope's variable file, with the
// Vietnamese subset so diacritics set cleanly, and Cyrillic for Russian guests. Korean,
// Japanese and Chinese fall back to the platform's CJK faces (`--font-sans`, globals.css).
const sansFont = Manrope({
	subsets: ["latin", "latin-ext", "vietnamese", "cyrillic"],
	variable: "--font-manrope",
	display: "swap",
});

// Mono sets only digits (times, counts, Home's figures): loaded when used, not preloaded.
const monoFont = IBM_Plex_Mono({
	subsets: ["latin", "vietnamese"],
	weight: ["300", "400", "500"],
	preload: false,
	variable: "--font-ibm-plex-mono",
	display: "swap",
});

export function generateStaticParams() {
	return routing.locales.map((locale) => ({ locale }));
}

export default async function LocaleLayout({
	children,
	params,
}: PropsWithChildren<{ params: Promise<{ locale: string }> }>) {
	const { locale } = await params;

	if (!hasLocale(routing.locales, locale)) {
		notFound();
	}

	setRequestLocale(locale);

	const messages = await getMessages();
	const t = await getTranslations();
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
			className={cn(sansFont.variable, monoFont.variable)}
		>
			<head>
				<script dangerouslySetInnerHTML={{ __html: themeScript }} />
			</head>
			<body className={cn("font-sans min-h-screen bg-background text-foreground antialiased")}>
				<NuqsAdapter>
					<NextIntlClientProvider key={locale} locale={locale} messages={messages}>
						<ThemeProvider
							{...themeOptions}
							disableTransitionOnChange
							initialTheme={initialTheme}
							noScript
						>
							<ApiClientProvider>
								<ClientProviders>
									{children}

									<Toaster position="top-right" closeLabel={t("common.aria.closeToast")} />
								</ClientProviders>
							</ApiClientProvider>
						</ThemeProvider>
					</NextIntlClientProvider>
				</NuqsAdapter>
			</body>
		</html>
	);
}
