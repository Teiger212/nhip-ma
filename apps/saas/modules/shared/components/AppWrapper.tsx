"use client";

import { isInboxPath } from "@i18n/lib/locale-path";
import { LocaleLink } from "@i18n/routing";
import { cn, Logo, SidebarInset, SidebarProvider, SidebarTrigger } from "@repo/ui";
import { useTranslations } from "next-intl";
import { usePathname } from "next/navigation";
import type { PropsWithChildren } from "react";

import { NavBar } from "./NavBar";
import { NotificationCenter } from "./NotificationCenter";
import { UserMenu } from "./UserMenu";

function AppMobileChrome() {
	const t = useTranslations();

	return (
		<header className="h-14 px-3 gap-2 md:hidden flex shrink-0 items-center border-b border-sidebar-border bg-sidebar text-sidebar-foreground">
			<SidebarTrigger
				className="-ml-1 min-h-11 min-w-11"
				aria-label={t("app.menu.openNavigation")}
			/>
			<LocaleLink href="/inbox" className="gap-2 min-w-0 mr-auto flex items-center">
				<Logo withLabel={false} className="text-sidebar-foreground" />
				<span className="font-semibold tracking-tight truncate">{t("inbox.brand")}</span>
			</LocaleLink>
			<NotificationCenter className="shrink-0" />
			<UserMenu />
		</header>
	);
}

function AppContent({ children }: PropsWithChildren) {
	const flush = isInboxPath(usePathname());

	return (
		<>
			<NavBar />
			<SidebarInset
				className={cn(flush ? "min-h-0 overflow-hidden" : "md:overflow-y-auto", "min-w-0")}
			>
				<AppMobileChrome />
				<div
					className={cn(
						flush ? "min-h-0 flex-1 overflow-hidden" : "flex-1",
						!flush && "py-4 container",
					)}
				>
					{children}
				</div>
			</SidebarInset>
		</>
	);
}

export function AppWrapper({ children }: PropsWithChildren) {
	const flush = isInboxPath(usePathname());

	return (
		<SidebarProvider className={cn("bg-background", flush ? "h-dvh overflow-hidden" : undefined)}>
			<AppContent>{children}</AppContent>
		</SidebarProvider>
	);
}
