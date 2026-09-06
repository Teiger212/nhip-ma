import { describe, expect, it } from "vitest";

import { buildAppNavItems, groupAppNavItems, isNavSubItemActive } from "./app-nav-items";

const labels = {
	home: "Home",
	inbox: "Inbox",
	international: "International",
	organizationSettings: "Organization settings",
	accountSettings: "Account settings",
	admin: "Admin",
	accountGeneral: "General",
	accountSecurity: "Security",
	accountNotifications: "Notifications",
	accountBilling: "Billing",
	organizationGeneral: "General",
	organizationMembers: "Members",
	organizationBilling: "Billing",
};

describe("buildAppNavItems", () => {
	it("keeps kit furniture plus Inbox and omits product jobs", () => {
		const items = buildAppNavItems({
			pathname: "/inbox",
			startHref: "/",
			basePath: "",
			canAccessAdmin: false,
			canManageOrganization: false,
			canManageOrganizationBilling: false,
			organizationsEnabled: true,
			hasActiveOrganization: false,
			billingAttachedTo: "user",
			labels,
		});

		expect(items.map((item) => item.id)).toEqual([
			"home",
			"inbox",
			"international",
			"account-settings",
		]);
		expect(items.find((item) => item.id === "home")).toMatchObject({
			label: "Home",
			disabled: true,
			isActive: false,
		});
		expect(items.find((item) => item.id === "international")).toMatchObject({
			label: "International",
			disabled: true,
			isActive: false,
		});
		expect(items.find((item) => item.id === "inbox")?.disabled).toBeUndefined();
		expect(items.find((item) => item.id === "inbox")?.isActive).toBe(true);
	});

	it("keeps Home and International disabled on their kit routes", () => {
		const items = buildAppNavItems({
			pathname: "/chatbot",
			startHref: "/",
			basePath: "",
			canAccessAdmin: false,
			canManageOrganization: false,
			canManageOrganizationBilling: false,
			organizationsEnabled: false,
			hasActiveOrganization: false,
			billingAttachedTo: "user",
			labels,
		});

		expect(items.find((item) => item.id === "home")?.isActive).toBe(false);
		expect(items.find((item) => item.id === "international")?.isActive).toBe(false);
		expect(items.find((item) => item.id === "inbox")?.isActive).toBe(false);
	});

	it("marks nested inbox routes as the live job", () => {
		const items = buildAppNavItems({
			pathname: "/inbox/thread-1",
			startHref: "/",
			basePath: "",
			canAccessAdmin: false,
			canManageOrganization: false,
			canManageOrganizationBilling: false,
			organizationsEnabled: false,
			hasActiveOrganization: false,
			billingAttachedTo: "user",
			labels,
		});

		expect(items.find((item) => item.id === "inbox")?.isActive).toBe(true);
	});

	it("keeps account settings as kit links without a language row", () => {
		const items = buildAppNavItems({
			pathname: "/inbox",
			startHref: "/",
			basePath: "",
			canAccessAdmin: false,
			canManageOrganization: false,
			canManageOrganizationBilling: false,
			organizationsEnabled: false,
			hasActiveOrganization: false,
			billingAttachedTo: "user",
			labels,
		});
		const accountSubItems = items.find((item) => item.id === "account-settings")?.subItems ?? [];

		expect(accountSubItems.map((item) => item.href)).toEqual([
			"/settings/general",
			"/settings/security",
			"/settings/notifications",
			"/settings/billing",
		]);
		expect(accountSubItems.some((item) => "kind" in item)).toBe(false);
	});

	it("adds account billing only when billing is attached to the user", () => {
		const withBilling = buildAppNavItems({
			pathname: "/settings/general",
			startHref: "/",
			basePath: "",
			canAccessAdmin: false,
			canManageOrganization: false,
			canManageOrganizationBilling: false,
			organizationsEnabled: false,
			hasActiveOrganization: false,
			billingAttachedTo: "user",
			labels,
		});
		const withoutBilling = buildAppNavItems({
			pathname: "/settings/general",
			startHref: "/",
			basePath: "",
			canAccessAdmin: false,
			canManageOrganization: false,
			canManageOrganizationBilling: false,
			organizationsEnabled: false,
			hasActiveOrganization: false,
			billingAttachedTo: "organization",
			labels,
		});

		expect(
			withBilling
				.find((item) => item.id === "account-settings")
				?.subItems?.map((item) => item.href),
		).toContain("/settings/billing");
		expect(
			withoutBilling
				.find((item) => item.id === "account-settings")
				?.subItems?.map((item) => item.href),
		).not.toContain("/settings/billing");
	});

	it("groups workspace jobs above account furniture", () => {
		const groups = groupAppNavItems(
			buildAppNavItems({
				pathname: "/inbox",
				startHref: "/",
				basePath: "",
				canAccessAdmin: true,
				canManageOrganization: false,
				canManageOrganizationBilling: false,
				organizationsEnabled: false,
				hasActiveOrganization: false,
				billingAttachedTo: "user",
				labels,
			}),
		);

		expect(groups.map((group) => group.id)).toEqual(["workspace", "account"]);
		expect(groups[0]?.items.map((item) => item.id)).toEqual(["home", "inbox", "international"]);
		expect(groups[1]?.items.map((item) => item.id)).toEqual(["account-settings", "admin"]);
	});
});

describe("isNavSubItemActive", () => {
	it("matches the exact href and nested paths", () => {
		expect(isNavSubItemActive("/settings/general", "/settings/general")).toBe(true);
		expect(isNavSubItemActive("/settings/general/extra", "/settings/general")).toBe(true);
		expect(isNavSubItemActive("/settings/security", "/settings/general")).toBe(false);
	});
});
