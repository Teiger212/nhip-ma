"use client";

import { useSession } from "@auth/hooks/use-session";
import { LocaleLink, useLocalePathname } from "@i18n/routing";
import { useYourTurnCount } from "@inbox/lib/inbox-queries";
import { isPlatformAdmin } from "@repo/auth/lib/roles";
import { config as paymentsConfig } from "@repo/payments/config";
import {
	Badge,
	cn,
	Logo,
	Sidebar,
	SidebarContent,
	SidebarFooter,
	SidebarGroup,
	SidebarGroupContent,
	SidebarGroupLabel,
	SidebarHeader,
	SidebarMenu,
	SidebarMenuButton,
	SidebarMenuItem,
	SidebarMenuSub,
	SidebarMenuSubButton,
	SidebarMenuSubItem,
	SidebarRail,
	SidebarTrigger,
	Tooltip,
	TooltipContent,
	TooltipTrigger,
	useSidebar,
} from "@repo/ui";
import { NotificationCenter } from "@shared/components/NotificationCenter";
import { UserMenu } from "@shared/components/UserMenu";
import { KIT_SCREENS } from "@shared/lib/kit-screens";
import { ContactRoundIcon, FileTextIcon, HomeIcon, InboxIcon, ShieldCheckIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, useSyncExternalStore } from "react";

import {
	buildSettingsSections,
	buildWalkNav,
	type WalkNavComingSoon,
	type WalkNavLink,
} from "../lib/walk-nav";

const NAV_ICONS = {
	home: HomeIcon,
	inbox: InboxIcon,
	fileText: FileTextIcon,
	contact: ContactRoundIcon,
	shield: ShieldCheckIcon,
} as const;

const NAV_LABEL_KEYS = {
	home: "app.menu.home",
	inbox: "app.menu.inbox",
	paperwork: "app.menu.paperwork",
	crm: "app.menu.crm",
	admin: "app.menu.admin",
} as const;

const SECTION_LABEL_KEYS = {
	general: "settings.menu.account.general",
	security: "settings.menu.account.security",
	notifications: "settings.menu.account.notifications",
	billing: "settings.menu.account.billing",
} as const;

/**
 * A label in the sidebar fades with its width instead of vanishing at once (#234); in the strip
 * the 32px item clips it, and it stays the item's accessible name. It truncates while the width
 * moves, so what follows it (the count) stays in view. The phone sheet never collapses.
 */
const FADING_LABEL =
	"min-w-0 truncate transition-opacity duration-220 ease-out group-data-[collapsible=icon]:opacity-0 motion-reduce:transition-none";

/** What closes a row (the Coming soon badge) fades the same way, at its full width. */
const FADING_END =
	"ml-auto shrink-0 transition-opacity duration-220 ease-out group-data-[collapsible=icon]:opacity-0 motion-reduce:transition-none";

const subscribeToNothing = () => () => {};

function isApplePlatform(): boolean {
	const nav = navigator as Navigator & { userAgentData?: { platform?: string } };
	return /mac|iphone|ipad|ipod/i.test(nav.userAgentData?.platform || nav.platform || "");
}

/** The kit's shortcut (⌘B, or Ctrl+B), as this computer writes it. The server renders no tooltip. */
function useSidebarShortcut(): string {
	const apple = useSyncExternalStore(subscribeToNothing, isApplePlatform, () => false);
	return apple ? "⌘B" : "Ctrl+B";
}

/** The visible collapse/expand button (#234), beside the bell; at the strip's top when collapsed. */
function SidebarToggle() {
	const t = useTranslations();
	const { state } = useSidebar();
	const shortcut = useSidebarShortcut();
	const collapsed = state === "collapsed";
	// The hint is read when the tooltip opens, so a click doesn't flip it while it fades out.
	const [hintCollapsed, setHintCollapsed] = useState(collapsed);

	return (
		<Tooltip
			onOpenChange={(open) => {
				if (open) setHintCollapsed(collapsed);
			}}
		>
			<TooltipTrigger
				render={
					<SidebarTrigger
						data-test="sidebar-toggle"
						aria-label={collapsed ? t("app.menu.expandSidebar") : t("app.menu.collapseSidebar")}
						className="size-8 shrink-0 group-data-[collapsible=icon]:order-first"
					/>
				}
			/>
			<TooltipContent side={hintCollapsed ? "right" : "bottom"}>
				{hintCollapsed
					? t("app.menu.expandSidebarHint", { shortcut })
					: t("app.menu.collapseSidebarHint", { shortcut })}
			</TooltipContent>
		</Tooltip>
	);
}

function NavItemLink({
	item,
	label,
	onNavigate,
	collapsed,
	count,
	countLabel,
}: {
	item: WalkNavLink;
	label: string;
	onNavigate?: () => void;
	collapsed: boolean;
	/** The Your-turn count beside Inbox; none while it is zero or unknown. */
	count?: number | null;
	countLabel?: string;
}) {
	const Icon = NAV_ICONS[item.iconName];

	return (
		<SidebarMenuButton
			isActive={item.isActive}
			tooltip={label}
			variant="chip"
			render={(props) => (
				<LocaleLink {...props} href={item.href} onClick={onNavigate} prefetch>
					<Icon />
					<span className={FADING_LABEL}>{label}</span>
					{count ? (
						/* Open, the count closes the row. In the strip it is a compact count pinned to the
						   icon's top-right corner, its right edge fixed on the strip, overlapping only that corner (#94), on a canvas backing
						   so its tint stays readable over the icon (#234); past 99 it reads "99+". */
						<span
							data-test="nav-your-turn-count"
							aria-label={countLabel}
							className="group-data-[collapsible=icon]:-top-0.5 group-data-[collapsible=icon]:-right-3 ml-auto flex shrink-0 group-data-[collapsible=icon]:absolute group-data-[collapsible=icon]:z-20 group-data-[collapsible=icon]:rounded-md group-data-[collapsible=icon]:bg-sidebar group-data-[collapsible=icon]:ring-2 group-data-[collapsible=icon]:ring-sidebar"
						>
							<Badge status="warning" numeric size={collapsed ? "corner" : "md"}>
								{collapsed && count > 99 ? "99+" : count}
							</Badge>
						</span>
					) : null}
				</LocaleLink>
			)}
		/>
	);
}

/**
 * A later feature where it will live (PRODUCT.md, the Coming soon rule): disabled, linking
 * nowhere, with a neutral "Coming soon" badge where a link's count would sit. In the strip its
 * tooltip names it (#234); a disabled button takes no pointer, so the tooltip hangs on a wrapper.
 */
function NavItemComingSoon({
	item,
	label,
	soon,
	collapsed,
}: {
	item: WalkNavComingSoon;
	label: string;
	soon: string;
	collapsed: boolean;
}) {
	const Icon = NAV_ICONS[item.iconName];
	return (
		<Tooltip disabled={!collapsed}>
			<TooltipTrigger render={<span className="block" />}>
				<SidebarMenuButton variant="chip" disabled data-test={`nav-${item.id}`}>
					<Icon />
					<span className={FADING_LABEL}>{label}</span>
					<span className={FADING_END}>
						<Badge>{soon}</Badge>
					</span>
				</SidebarMenuButton>
			</TooltipTrigger>
			<TooltipContent side="right" align="center">
				<span className="gap-2 flex items-center">
					{label}
					<Badge>{soon}</Badge>
				</span>
			</TooltipContent>
		</Tooltip>
	);
}

/**
 * The Your-turn count for the shell (sidebar and phone top bar), so it is on screen on every
 * page at every width. Off for the platform admin, who has no office queue.
 */
export function useShellYourTurnCount(): number | null {
	const { user } = useSession();
	return useYourTurnCount({ enabled: Boolean(user) && !isPlatformAdmin(user?.role) });
}

export function NavBar() {
	const t = useTranslations();
	const pathname = useLocalePathname();
	const { isMobile, setOpenMobile, state } = useSidebar();
	const collapsed = !isMobile && state === "collapsed";

	const { user } = useSession();
	const isAdmin = isPlatformAdmin(user?.role);
	const items = buildWalkNav(pathname, { isAdmin });
	const yourTurnCount = useShellYourTurnCount();
	const settingsSections = buildSettingsSections(pathname, {
		billing: KIT_SCREENS.billing && paymentsConfig.billingAttachedTo === "user",
	});

	function closeMobileNav() {
		if (isMobile) {
			setOpenMobile(false);
		}
	}

	return (
		<Sidebar
			collapsible="icon"
			mobileTitle={t("app.menu.navigationTitle")}
			mobileDescription={t("app.menu.openNavigation")}
		>
			<SidebarHeader>
				<div className="gap-2 flex items-center group-data-[collapsible=icon]:flex-col group-data-[collapsible=icon]:items-start">
					<SidebarMenu className="min-w-0 flex-1">
						<SidebarMenuItem>
							<SidebarMenuButton
								size="lg"
								tooltip={t("app.menu.start")}
								render={(props) => (
									<LocaleLink
										{...props}
										href={isAdmin ? "/admin/organizations" : "/inbox"}
										prefetch
									>
										<Logo withLabel={false} className="group-data-[collapsible=icon]:ml-0.5" />
										<span className={cn("font-semibold tracking-tight text-brand", FADING_LABEL)}>
											{t("inbox.brand")}
										</span>
									</LocaleLink>
								)}
							/>
						</SidebarMenuItem>
					</SidebarMenu>
					<NotificationCenter className="shrink-0" />
					{/* The phone opens the sheet from its top bar; the sheet itself has no collapse. */}
					{isMobile ? null : <SidebarToggle />}
				</div>
			</SidebarHeader>
			<SidebarContent>
				<SidebarGroup>
					<SidebarGroupLabel>{t("app.menu.groupWorkspace")}</SidebarGroupLabel>
					<SidebarGroupContent>
						<nav aria-label={t("app.menu.groupWorkspace")}>
							<SidebarMenu>
								{items.map((item) => (
									<SidebarMenuItem key={item.id}>
										{item.comingSoon ? (
											<NavItemComingSoon
												item={item}
												label={t(NAV_LABEL_KEYS[item.id])}
												soon={t("app.menu.comingSoon")}
												collapsed={collapsed}
											/>
										) : (
											<NavItemLink
												item={item}
												label={t(NAV_LABEL_KEYS[item.id])}
												onNavigate={closeMobileNav}
												collapsed={collapsed}
												count={item.id === "inbox" ? yourTurnCount : null}
												countLabel={
													yourTurnCount
														? t("inbox.queueCount", { count: yourTurnCount })
														: undefined
												}
											/>
										)}
									</SidebarMenuItem>
								))}
							</SidebarMenu>
						</nav>
					</SidebarGroupContent>
				</SidebarGroup>
			</SidebarContent>
			<SidebarFooter>
				{/* The user row opens Account settings; while a settings page is active its
				    sections show here so they stay reachable. */}
				{settingsSections && !collapsed ? (
					<SidebarMenu>
						<SidebarMenuItem>
							<SidebarMenuSub>
								{settingsSections.map((section) => (
									<SidebarMenuSubItem key={section.href}>
										<SidebarMenuSubButton
											isActive={section.isActive}
											render={(props) => (
												<LocaleLink
													{...props}
													href={section.href}
													onClick={closeMobileNav}
													prefetch
												>
													<span>{t(SECTION_LABEL_KEYS[section.id])}</span>
												</LocaleLink>
											)}
										/>
									</SidebarMenuSubItem>
								))}
							</SidebarMenuSub>
						</SidebarMenuItem>
					</SidebarMenu>
				) : null}
				<UserMenu showUserName={!collapsed} />
			</SidebarFooter>
			<SidebarRail
				aria-label={
					state === "collapsed" ? t("app.menu.expandSidebar") : t("app.menu.collapseSidebar")
				}
			/>
		</Sidebar>
	);
}
