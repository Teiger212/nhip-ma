import { isAdminPath, isHomePath, isInboxPath } from "@i18n/lib/locale-path";

/**
 * The sidebar, stated directly. Inbox is the agent's job and Home the numbers screen
 * (ADR 0001). No placeholders: a later feature appears only under PRODUCT.md's "Coming
 * soon" rule, where it will live. Admin is the kit's admin area, where Nhịp creates
 * offices and invites agents (ADR 0010), and it is only listed for a platform admin.
 * Account settings is reached from the user row in the footer, and its sections appear
 * there while a settings page is active.
 */
export type WalkNavId = "home" | "inbox" | "admin";

export type WalkNavItem = {
	id: WalkNavId;
	href: string;
	iconName: "home" | "inbox" | "shield";
	isActive: boolean;
};

export type SettingsSection = {
	id: "general" | "security" | "notifications";
	href: string;
	isActive: boolean;
};

export function isNavSubItemActive(pathname: string, href: string): boolean {
	return pathname === href || pathname.startsWith(`${href}/`);
}

export function buildWalkNav(
	pathname: string,
	options: { isAdmin: boolean } = { isAdmin: false },
): WalkNavItem[] {
	// The platform admin works in the admin area only: no office screens (ADR 0015).
	if (options.isAdmin) {
		return [
			{
				id: "admin",
				href: "/admin/organizations",
				iconName: "shield",
				isActive: isAdminPath(pathname),
			},
		];
	}
	return [
		{
			id: "home",
			href: "/home",
			iconName: "home",
			isActive: isHomePath(pathname),
		},
		{
			id: "inbox",
			href: "/inbox",
			iconName: "inbox",
			isActive: isInboxPath(pathname),
		},
	];
}

export function isSettingsPath(pathname: string): boolean {
	return pathname === "/settings" || pathname.startsWith("/settings/");
}

/** Sections shown in the footer while the operator is inside Account settings. */
export function buildSettingsSections(pathname: string): SettingsSection[] | null {
	if (!isSettingsPath(pathname)) return null;
	// No Billing: an office pays per seat (ADR 0014) and that is not built, so there is
	// nothing for an operator to see here yet.
	const ids: SettingsSection["id"][] = ["general", "security", "notifications"];
	return ids.map((id) => {
		const href = `/settings/${id}`;
		return { id, href, isActive: isNavSubItemActive(pathname, href) };
	});
}
