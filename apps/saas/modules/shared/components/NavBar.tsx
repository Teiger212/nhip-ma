"use client";

import { useSession } from "@auth/hooks/use-session";
import { isHomePath, isInboxPath } from "@i18n/lib/locale-path";
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
	useSidebar,
} from "@repo/ui";
import { NotificationCenter } from "@shared/components/NotificationCenter";
import { UserMenu } from "@shared/components/UserMenu";
import { KIT_SCREENS } from "@shared/lib/kit-screens";
import { HomeIcon, InboxIcon, ShieldCheckIcon } from "lucide-react";
import { useTranslations } from "next-intl";

import { buildSettingsSections, buildWalkNav, type WalkNavItem } from "../lib/walk-nav";

const NAV_ICONS = {
	home: HomeIcon,
	inbox: InboxIcon,
	shield: ShieldCheckIcon,
} as const;

const NAV_LABEL_KEYS = {
	home: "app.menu.home",
	inbox: "app.menu.inbox",
	admin: "app.menu.admin",
} as const;

const SECTION_LABEL_KEYS = {
	general: "settings.menu.account.general",
	security: "settings.menu.account.security",
	notifications: "settings.menu.account.notifications",
	billing: "settings.menu.account.billing",
} as const;

function NavItemLink({
	item,
	label,
	onNavigate,
	showLabel,
	count,
	countLabel,
}: {
	item: WalkNavItem;
	label: string;
	onNavigate?: () => void;
	showLabel: boolean;
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
					<span className={cn(!showLabel && "sr-only")}>{label}</span>
					{count ? (
						<span
							data-test="nav-your-turn-count"
							aria-label={countLabel}
							className={cn("ml-auto", !showLabel && "sr-only")}
						>
							<Badge status="warning" numeric>
								{count}
							</Badge>
						</span>
					) : null}
				</LocaleLink>
			)}
		/>
	);
}

/**
 * The Your-turn count for the shell (sidebar and phone top bar), so it is on screen on every
 * page at every width. Off for the platform admin, who has no office queue.
 */
export function useShellYourTurnCount(): number | null {
	const pathname = useLocalePathname();
	const { user } = useSession();
	return useYourTurnCount({
		enabled: Boolean(user) && !isPlatformAdmin(user?.role),
		listMounted: isInboxPath(pathname) || isHomePath(pathname),
	});
}

export function NavBar() {
	const t = useTranslations();
	const pathname = useLocalePathname();
	const { isMobile, setOpenMobile, state } = useSidebar();
	const showLabels = isMobile || state === "expanded";

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
				<div className="gap-2 flex items-center group-data-[collapsible=icon]:flex-col">
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
										<Logo withLabel={false} />
										<span
											className={cn(
												"font-semibold tracking-tight text-brand",
												!showLabels && "sr-only",
											)}
										>
											{t("inbox.brand")}
										</span>
									</LocaleLink>
								)}
							/>
						</SidebarMenuItem>
					</SidebarMenu>
					<NotificationCenter className="shrink-0" />
				</div>
			</SidebarHeader>
			<SidebarContent>
				<SidebarGroup>
					<SidebarGroupLabel>{t("app.menu.groupWorkspace")}</SidebarGroupLabel>
					<SidebarGroupContent>
						<SidebarMenu>
							{items.map((item) => (
								<SidebarMenuItem key={item.id}>
									<NavItemLink
										item={item}
										label={t(NAV_LABEL_KEYS[item.id])}
										onNavigate={closeMobileNav}
										showLabel={showLabels}
										count={item.id === "inbox" ? yourTurnCount : null}
										countLabel={
											yourTurnCount ? t("inbox.queueCount", { count: yourTurnCount }) : undefined
										}
									/>
								</SidebarMenuItem>
							))}
						</SidebarMenu>
					</SidebarGroupContent>
				</SidebarGroup>
			</SidebarContent>
			<SidebarFooter>
				{/* The user row opens Account settings; while a settings page is active its
				    sections show here so they stay reachable. */}
				{settingsSections && showLabels ? (
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
				<UserMenu showUserName={showLabels} />
			</SidebarFooter>
			<SidebarRail
				aria-label={
					state === "collapsed" ? t("app.menu.expandSidebar") : t("app.menu.collapseSidebar")
				}
			/>
		</Sidebar>
	);
}
