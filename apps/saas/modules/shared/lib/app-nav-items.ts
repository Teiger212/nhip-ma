export type AppNavGroupId = "workspace" | "account";

export interface AppNavSubItem {
	label: string;
	href: string;
}

export interface AppNavItem {
	id: string;
	group: AppNavGroupId;
	label: string;
	href: string;
	iconName: "home" | "inbox" | "chatbot" | "settings" | "account" | "admin";
	isActive: boolean;
	subItems?: AppNavSubItem[];
}

export interface AppNavLabels {
	start: string;
	inbox: string;
	aiChatbot: string;
	organizationSettings: string;
	accountSettings: string;
	admin: string;
	accountGeneral: string;
	accountSecurity: string;
	accountNotifications: string;
	accountBilling: string;
	organizationGeneral: string;
	organizationMembers: string;
	organizationBilling: string;
}

export function isNavSubItemActive(pathname: string, href: string): boolean {
	return pathname === href || pathname.startsWith(`${href}/`);
}

export function buildAppNavItems({
	pathname,
	startHref,
	basePath,
	canAccessAdmin,
	canManageOrganization,
	canManageOrganizationBilling,
	organizationsEnabled,
	hasActiveOrganization,
	billingAttachedTo,
	labels,
}: {
	pathname: string;
	startHref: string;
	basePath: string;
	canAccessAdmin: boolean;
	canManageOrganization: boolean;
	canManageOrganizationBilling: boolean;
	organizationsEnabled: boolean;
	hasActiveOrganization: boolean;
	billingAttachedTo: "user" | "organization";
	labels: AppNavLabels;
}): AppNavItem[] {
	const accountSubItems: AppNavSubItem[] = [
		{
			label: labels.accountGeneral,
			href: "/settings/general",
		},
		{
			label: labels.accountSecurity,
			href: "/settings/security",
		},
		{
			label: labels.accountNotifications,
			href: "/settings/notifications",
		},
		...(billingAttachedTo === "user"
			? [
					{
						label: labels.accountBilling,
						href: "/settings/billing",
					},
				]
			: []),
	];

	const orgSettingsPrefix = `${basePath}/settings`;
	const organizationSubItems: AppNavSubItem[] | undefined =
		organizationsEnabled && hasActiveOrganization && canManageOrganization
			? [
					{
						label: labels.organizationGeneral,
						href: `${orgSettingsPrefix}/general`,
					},
					{
						label: labels.organizationMembers,
						href: `${orgSettingsPrefix}/members`,
					},
					...(billingAttachedTo === "organization" && canManageOrganizationBilling
						? [
								{
									label: labels.organizationBilling,
									href: `${orgSettingsPrefix}/billing`,
								},
							]
						: []),
				]
			: undefined;

	return [
		{
			id: "start",
			group: "workspace",
			label: labels.start,
			href: startHref,
			iconName: "home",
			isActive: pathname === "/" || pathname === basePath,
		},
		{
			id: "inbox",
			group: "workspace",
			label: labels.inbox,
			href: "/inbox",
			iconName: "inbox",
			isActive: pathname === "/inbox" || pathname.startsWith("/inbox/"),
		},
		{
			id: "chatbot",
			group: "workspace",
			label: labels.aiChatbot,
			href: "/chatbot",
			iconName: "chatbot",
			isActive: pathname.startsWith("/chatbot"),
		},
		...(organizationSubItems
			? [
					{
						id: "organization-settings",
						group: "account" as const,
						label: labels.organizationSettings,
						href: `${orgSettingsPrefix}/general`,
						iconName: "settings" as const,
						isActive: pathname.startsWith(`${orgSettingsPrefix}/`),
						subItems: organizationSubItems,
					},
				]
			: []),
		{
			id: "account-settings",
			group: "account",
			label: labels.accountSettings,
			href: "/settings/general",
			iconName: "account",
			isActive: pathname.startsWith("/settings/"),
			subItems: accountSubItems,
		},
		...(canAccessAdmin
			? [
					{
						id: "admin",
						group: "account" as const,
						label: labels.admin,
						href: "/admin",
						iconName: "admin" as const,
						isActive: pathname.startsWith("/admin/"),
					},
				]
			: []),
	];
}

export function groupAppNavItems(items: AppNavItem[]): Array<{
	id: AppNavGroupId;
	items: AppNavItem[];
}> {
	const groups: Array<{ id: AppNavGroupId; items: AppNavItem[] }> = [
		{ id: "workspace", items: [] },
		{ id: "account", items: [] },
	];

	for (const item of items) {
		const group = groups.find((entry) => entry.id === item.group);
		group?.items.push(item);
	}

	return groups.filter((group) => group.items.length > 0);
}
