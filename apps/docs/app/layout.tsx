import { cn, Logo } from "@repo/ui";

import "./global.css";
import { DocsLayout } from "fumadocs-ui/layouts/docs";
import { RootProvider } from "fumadocs-ui/provider/next";
import { DM_Sans, Inter } from "next/font/google";

import { source } from "@/lib/source";

const sansFont = Inter({
	subsets: ["latin"],
	variable: "--font-inter",
});

const headingFont = DM_Sans({
	subsets: ["latin"],
	variable: "--font-dm-sans",
});

export default function Layout({ children }: LayoutProps<"/">) {
	return (
		<html
			lang="en"
			className={cn(sansFont.variable, headingFont.variable)}
			suppressHydrationWarning
		>
			<body className="font-sans flex min-h-screen flex-col antialiased">
				<RootProvider>
					<DocsLayout
						tree={source.getPageTree()}
						nav={{
							title: <Logo className="font-heading" />,
						}}
					>
						{children}
					</DocsLayout>
				</RootProvider>
			</body>
		</html>
	);
}
