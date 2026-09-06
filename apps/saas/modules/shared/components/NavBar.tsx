"use client";

import { useActiveOrganization } from "@organizations/hooks/use-active-organization";
import { config as authConfig } from "@repo/auth/config";
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
	SidebarSeparator,
	useSidebar,
} from "@repo/ui";
import { NotificationCenter } from "@shared/components/NotificationCenter";
import { usePermissions } from "@shared/components/PermixProvider";
import { UserMenu } from "@shared/components/UserMenu";
import {
	BotMessageSquareIcon,
	HomeIcon,
	InboxIcon,
	SettingsIcon,
	ShieldUserIcon,
	UserCogIcon,
} from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useMemo } from "react";

import { OrganzationSelect } from "../../organizations/components/OrganizationSelect";
import {
	type AppNavItem,
	buildAppNavItems,
	groupAppNavItems,
	isNavSubItemActive,
} from "../lib/app-nav-items";

const NAV_ICONS = {
	home: HomeIcon,
	inbox: InboxIcon,
	chatbot: BotMessageSquareIcon,
	settings: SettingsIcon,
	account: UserCogIcon,
	admin: ShieldUserIcon,
} as const;

function NavItemLink({
	item,
	onNavigate,
	showLabel,
}: {
	item: AppNavItem;
	onNavigate?: () => void;
	showLabel: boolean;
}) {
	const Icon = NAV_ICONS[item.iconName];

	if (item.disabled) {
		return (
			<SidebarMenuButton isActive={false} tooltip={item.label} disabled aria-disabled>
				<Icon />
				<span className={cn(!showLabel && "sr-only")}>{item.label}</span>
			</SidebarMenuButton>
		);
	}

	return (
		<SidebarMenuButton
			isActive={item.isActive}
			tooltip={item.label}
			render={(props) => (
				<Link {...props} href={item.href} onClick={onNavigate} prefetch>
					<Icon />
					<span className={cn(!showLabel && "sr-only")}>{item.label}</span>
				</Link>
			)}
		/>
	);
}

export function NavBar() {
	const t = useTranslations();
	const pathname = usePathname();
	const { check } = usePermissions();
	const { activeOrganization } = useActiveOrganization();
	const { isMobile, setOpenMobile, state } = useSidebar();
	const canAccessAdmin = check("admin.access");
	const canManageOrganization = check("organization.manage");
	const canManageOrganizationBilling = check("organization.manageBilling");
	const showLabels = isMobile || state === "expanded";

	const basePath = activeOrganization ? `/${activeOrganization.slug}` : "";
	const startHref = basePath || "/";

	const menuItems = useMemo(
		() =>
			buildAppNavItems({
				pathname,
				startHref,
				basePath,
				canAccessAdmin,
				canManageOrganization,
				canManageOrganizationBilling,
				organizationsEnabled: authConfig.organizations.enable,
				hasActiveOrganization: Boolean(activeOrganization),
				billingAttachedTo: paymentsConfig.billingAttachedTo,
				labels: {
					home: t("app.menu.home"),
					inbox: t("app.menu.inbox"),
					international: t("app.menu.international"),
					organizationSettings: t("app.menu.organizationSettings"),
					accountSettings: t("app.menu.accountSettings"),
					admin: t("app.menu.admin"),
					accountGeneral: t("settings.menu.account.general"),
					accountSecurity: t("settings.menu.account.security"),
					accountNotifications: t("settings.menu.account.notifications"),
					accountBilling: t("settings.menu.account.billing"),
					organizationGeneral: t("settings.menu.organization.general"),
					organizationMembers: t("settings.menu.organization.members"),
					organizationBilling: t("settings.menu.organization.billing"),
				},
			}),
		[
			activeOrganization,
			basePath,
			canAccessAdmin,
			canManageOrganization,
			canManageOrganizationBilling,
			pathname,
			startHref,
			t,
		],
	);

	const groups = groupAppNavItems(menuItems);
	const groupLabels: Record<(typeof groups)[number]["id"], string> = {
		workspace: t("app.menu.groupWorkspace"),
		account: t("app.menu.groupAccount"),
	};

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
									<Link {...props} href="/" prefetch>
										<Logo withLabel={false} className="text-sidebar-foreground" />
										<span className={cn("font-semibold tracking-tight", !showLabels && "sr-only")}>
											Acme
										</span>
									</Link>
								)}
							/>
						</SidebarMenuItem>
					</SidebarMenu>
					<NotificationCenter className="shrink-0" />
				</div>
				{authConfig.organizations.enable && !authConfig.organizations.hideOrganization ? (
					<OrganzationSelect
						className={cn(!showLabels && "flex justify-center")}
						collapsed={!showLabels}
					/>
				) : null}
			</SidebarHeader>
			<SidebarContent>
				{groups.map((group, index) => (
					<SidebarGroup key={group.id}>
						{index > 0 ? <SidebarSeparator className="mb-2" /> : null}
						<SidebarGroupLabel>{groupLabels[group.id]}</SidebarGroupLabel>
						<SidebarGroupContent>
							<SidebarMenu>
								{group.items.map((item) => (
									<SidebarMenuItem key={item.id}>
										<NavItemLink item={item} onNavigate={closeMobileNav} showLabel={showLabels} />
										{item.subItems?.length && item.isActive && showLabels ? (
											<SidebarMenuSub>
												{item.subItems.map((subItem) => (
													<SidebarMenuSubItem key={subItem.href}>
														<SidebarMenuSubButton
															isActive={isNavSubItemActive(pathname, subItem.href)}
															render={(props) => (
																<Link
																	{...props}
																	href={subItem.href}
																	onClick={closeMobileNav}
																	prefetch
																>
																	<span>{subItem.label}</span>
																</Link>
															)}
														/>
													</SidebarMenuSubItem>
												))}
											</SidebarMenuSub>
										) : null}
									</SidebarMenuItem>
								))}
							</SidebarMenu>
						</SidebarGroupContent>
					</SidebarGroup>
				))}
			</SidebarContent>
			<SidebarFooter>
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
