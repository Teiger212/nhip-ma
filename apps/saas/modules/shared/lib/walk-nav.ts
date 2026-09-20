import { isAdminPath, isHomePath, isInboxPath } from "@i18n/lib/locale-path";

/**
 * The sidebar, stated directly. Inbox is the agent's job and Home the numbers screen
 * (ADR 0001); International stays a placeholder, visible but disabled. Admin is the
 * kit's admin area, where Nhịp creates offices and invites agents (ADR 0010), and it is
 * only listed for a platform admin. Account settings is reached from the user row in the
 * footer, and its sections appear there while a settings page is active.
 */
export type WalkNavId = "home" | "inbox" | "international" | "admin";

export type WalkNavItem = {
	id: WalkNavId;
	href: string;
	iconName: "home" | "inbox" | "globe" | "shield";
	isActive: boolean;
	disabled: boolean;
};

export type SettingsSection = {
	id: "general" | "security" | "notifications" | "billing";
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
	const items: WalkNavItem[] = [
		{
			id: "home",
			href: "/home",
			iconName: "home",
			isActive: isHomePath(pathname),
			disabled: false,
		},
		{
			id: "inbox",
			href: "/inbox",
			iconName: "inbox",
			isActive: isInboxPath(pathname),
			disabled: false,
		},
		{ id: "international", href: "/chatbot", iconName: "globe", isActive: false, disabled: true },
	];
	if (options.isAdmin) {
		items.push({
			id: "admin",
			href: "/admin/organizations",
			iconName: "shield",
			isActive: isAdminPath(pathname),
			disabled: false,
		});
	}
	return items;
}

export function isSettingsPath(pathname: string): boolean {
	return pathname === "/settings" || pathname.startsWith("/settings/");
}

/** Sections shown in the footer while the operator is inside Account settings. */
export function buildSettingsSections(
	pathname: string,
	options: { billingAttachedToUser: boolean },
): SettingsSection[] | null {
	if (!isSettingsPath(pathname)) return null;
	const ids: SettingsSection["id"][] = ["general", "security", "notifications"];
	if (options.billingAttachedToUser) ids.push("billing");
	return ids.map((id) => {
		const href = `/settings/${id}`;
		return { id, href, isActive: isNavSubItemActive(pathname, href) };
	});
}
