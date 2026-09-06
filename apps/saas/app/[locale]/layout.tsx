import { config } from "@config";
import { routing } from "@i18n/routing";
import { cn, Toaster } from "@repo/ui";
import { ApiClientProvider } from "@shared/components/ApiClientProvider";
import { ClientProviders } from "@shared/components/ClientProviders";
import { hasLocale } from "next-intl";
import { NextIntlClientProvider } from "next-intl";
import { getMessages, getTranslations, setRequestLocale } from "next-intl/server";
import { ThemeProvider } from "next-themes";
import { Be_Vietnam_Pro, IBM_Plex_Mono } from "next/font/google";
import { notFound } from "next/navigation";
import { NuqsAdapter } from "nuqs/adapters/next/app";
import type { PropsWithChildren } from "react";

const sansFont = Be_Vietnam_Pro({
	subsets: ["latin", "vietnamese"],
	weight: ["400", "500", "600", "700"],
	variable: "--font-be-vietnam",
	display: "swap",
});

const monoFont = IBM_Plex_Mono({
	subsets: ["latin", "latin-ext"],
	weight: ["400", "500"],
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

	return (
		<html
			lang={locale}
			suppressHydrationWarning
			className={cn(sansFont.variable, monoFont.variable)}
		>
			<body className={cn("font-sans min-h-screen bg-background text-foreground antialiased")}>
				<NuqsAdapter>
					<NextIntlClientProvider locale={locale} messages={messages}>
						<ThemeProvider
							attribute="class"
							disableTransitionOnChange
							enableSystem
							defaultTheme={config.defaultTheme}
							themes={Array.from(config.enabledThemes)}
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
