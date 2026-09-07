"use client";

import { LocaleLink, useLocalePathname } from "@i18n/routing";
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
	GlobeIcon,
	HomeIcon,
	InboxIcon,
	SettingsIcon,
	ShieldUserIcon,
	UserCogIcon,
} from "lucide-react";
import { useTranslations } from "next-intl";
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
	globe: GlobeIcon,
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
			<SidebarMenuButton
				isActive={false}
				tooltip={item.label}
				disabled
				aria-disabled
				className="opacity-45"
			>
				<Icon />
				<span className={cn(!showLabel && "sr-only")}>{item.label}</span>
			</SidebarMenuButton>
		);
	}

	return (
		<SidebarMenuButton
			isActive={item.isActive}
			tooltip={item.label}
			className={
				item.isActive
					? "shadow-[inset_2px_0_0_var(--sidebar-primary)] data-[active=true]:bg-sidebar-accent"
					: undefined
			}
			render={(props) => (
				<LocaleLink {...props} href={item.href} onClick={onNavigate} prefetch>
					<Icon />
					<span className={cn(!showLabel && "sr-only")}>{item.label}</span>
				</LocaleLink>
			)}
		/>
	);
}

export function NavBar() {
	const t = useTranslations();
	const pathname = useLocalePathname();
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

	const accountGroup = groups.find((group) => group.id === "account");
	const contentGroups = groups.filter((group) => group.id !== "account");

	function renderItems(items: AppNavItem[]) {
		return items.map((item) => (
			<SidebarMenuItem key={item.id}>
				<NavItemLink item={item} onNavigate={closeMobileNav} showLabel={showLabels} />
				{item.subItems?.length && item.isActive && showLabels ? (
					<SidebarMenuSub>
						{item.subItems.map((subItem) => (
							<SidebarMenuSubItem key={subItem.href}>
								<SidebarMenuSubButton
									isActive={isNavSubItemActive(pathname, subItem.href)}
									render={(props) => (
										<LocaleLink {...props} href={subItem.href} onClick={closeMobileNav} prefetch>
											<span>{subItem.label}</span>
										</LocaleLink>
									)}
								/>
							</SidebarMenuSubItem>
						))}
					</SidebarMenuSub>
				) : null}
			</SidebarMenuItem>
		));
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
				{authConfig.organizations.enable && !authConfig.organizations.hideOrganization ? (
					<OrganzationSelect
						className={cn(!showLabels && "flex justify-center")}
						collapsed={!showLabels}
					/>
				) : null}
			</SidebarHeader>
			<SidebarContent>
				{contentGroups.map((group, index) => (
					<SidebarGroup key={group.id}>
						{index > 0 ? <SidebarSeparator className="mb-2" /> : null}
						<SidebarGroupLabel>{groupLabels[group.id]}</SidebarGroupLabel>
						<SidebarGroupContent>
							<SidebarMenu>{renderItems(group.items)}</SidebarMenu>
						</SidebarGroupContent>
					</SidebarGroup>
				))}
			</SidebarContent>
			<SidebarFooter>
				{/* Settings open in the main pane; they live at the bottom next to the user menu. */}
				{accountGroup ? <SidebarMenu>{renderItems(accountGroup.items)}</SidebarMenu> : null}
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
