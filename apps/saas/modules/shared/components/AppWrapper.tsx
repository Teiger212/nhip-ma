"use client";

import { isInboxPath } from "@i18n/lib/locale-path";
import { LocaleLink } from "@i18n/routing";
import { Badge, cn, Logo, SidebarInset, SidebarProvider, SidebarTrigger } from "@repo/ui";
import { useTranslations } from "next-intl";
import { usePathname } from "next/navigation";
import type { PropsWithChildren } from "react";

import { NavBar, useShellYourTurnCount } from "./NavBar";
import { NotificationCenter } from "./NotificationCenter";
import { UserMenu } from "./UserMenu";

function AppMobileChrome() {
	const t = useTranslations();
	const yourTurnCount = useShellYourTurnCount();

	return (
		<header className="h-14 px-3 gap-2 lg:hidden flex shrink-0 items-center border-b border-sidebar-border bg-sidebar text-sidebar-foreground">
			<SidebarTrigger
				className="-ml-1 min-h-11 min-w-11 shrink-0"
				aria-label={t("app.menu.openNavigation")}
			/>
			<LocaleLink href="/inbox" className="gap-2 flex shrink-0 items-center">
				<Logo withLabel={false} className="shrink-0" />
				<span className="font-semibold tracking-tight shrink-0">{t("inbox.brand")}</span>
			</LocaleLink>
			{/* The sidebar is a sheet here, so the queue's count rides in the top bar. */}
			<span className="mr-auto flex">
				{yourTurnCount ? (
					<LocaleLink
						href="/inbox"
						data-test="topbar-your-turn-count"
						aria-label={t("inbox.queueCount", { count: yourTurnCount })}
						className="min-h-11 px-1 flex items-center"
					>
						<Badge status="warning" numeric>
							{yourTurnCount}
						</Badge>
					</LocaleLink>
				) : null}
			</span>
			<NotificationCenter className="size-11 shrink-0" />
			<div className="shrink-0">
				<UserMenu />
			</div>
		</header>
	);
}

function AppContent({ children }: PropsWithChildren) {
	const flush = isInboxPath(usePathname());

	return (
		<>
			<NavBar />
			<SidebarInset
				className={cn(flush ? "min-h-0 overflow-hidden" : "lg:overflow-y-auto", "min-w-0")}
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
		<SidebarProvider className={cn(flush && "h-dvh overflow-hidden")}>
			<AppContent>{children}</AppContent>
		</SidebarProvider>
	);
}
