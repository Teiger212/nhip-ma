"use client";

import { LocaleLink, useLocalePathname } from "@i18n/routing";
import { config as paymentsConfig } from "@repo/payments/config";
import {
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
import { GlobeIcon, HomeIcon, InboxIcon } from "lucide-react";
import { useTranslations } from "next-intl";

import { buildSettingsSections, buildWalkNav, type WalkNavItem } from "../lib/walk-nav";

const NAV_ICONS = {
	home: HomeIcon,
	inbox: InboxIcon,
	globe: GlobeIcon,
} as const;

const NAV_LABEL_KEYS = {
	home: "app.menu.home",
	inbox: "app.menu.inbox",
	international: "app.menu.international",
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
}: {
	item: WalkNavItem;
	label: string;
	onNavigate?: () => void;
	showLabel: boolean;
}) {
	const Icon = NAV_ICONS[item.iconName];

	if (item.disabled) {
		return (
			<SidebarMenuButton
				isActive={false}
				tooltip={label}
				disabled
				aria-disabled
				className="opacity-45"
			>
				<Icon />
				<span className={cn(!showLabel && "sr-only")}>{label}</span>
			</SidebarMenuButton>
		);
	}

	return (
		<SidebarMenuButton
			isActive={item.isActive}
			tooltip={label}
			className={
				item.isActive
					? "shadow-[inset_2px_0_0_var(--sidebar-primary)] data-[active=true]:bg-sidebar-accent"
					: undefined
			}
			render={(props) => (
				<LocaleLink {...props} href={item.href} onClick={onNavigate} prefetch>
					<Icon />
					<span className={cn(!showLabel && "sr-only")}>{label}</span>
				</LocaleLink>
			)}
		/>
	);
}

export function NavBar() {
	const t = useTranslations();
	const pathname = useLocalePathname();
	const { isMobile, setOpenMobile, state } = useSidebar();
	const showLabels = isMobile || state === "expanded";

	const items = buildWalkNav(pathname);
	const settingsSections = buildSettingsSections(pathname, {
		billingAttachedToUser: paymentsConfig.billingAttachedTo === "user",
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
									<LocaleLink {...props} href="/inbox" prefetch>
										<Logo withLabel={false} className="text-sidebar-foreground" />
										<span
											className={cn(
												"font-semibold tracking-tight text-[0.95rem]",
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
