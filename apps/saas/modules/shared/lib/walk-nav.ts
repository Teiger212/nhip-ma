import { isHomePath, isInboxPath } from "@i18n/lib/locale-path";

/**
 * The sidebar, stated directly. Inbox is the agent's job and Home the numbers screen
 * (ADR 0001); International stays a placeholder, visible but disabled. Account
 * settings is reached from the user row in the footer, and its sections appear
 * there while a settings page is active. The kit's organization, billing and admin
 * rules stay in the kit until there is a second tenant.
 */
export type WalkNavId = "home" | "inbox" | "international";

export type WalkNavItem = {
	id: WalkNavId;
	href: string;
	iconName: "home" | "inbox" | "globe";
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

export function buildWalkNav(pathname: string): WalkNavItem[] {
	return [
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
