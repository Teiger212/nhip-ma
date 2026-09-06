import { describe, expect, it } from "vitest";

import {
	buildAppNavItems,
	groupAppNavItems,
	isLinkNavSubItem,
	isLocaleNavSubItem,
	isNavSubItemActive,
} from "./app-nav-items";

const labels = {
	start: "Start",
	inbox: "Inbox",
	aiChatbot: "AI Chatbot",
	organizationSettings: "Organization settings",
	accountSettings: "Account settings",
	admin: "Admin",
	accountGeneral: "General",
	accountSecurity: "Security",
	accountNotifications: "Notifications",
	accountBilling: "Billing",
	accountLanguage: "Language",
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

		expect(items.map((item) => item.id)).toEqual(["start", "inbox", "chatbot", "account-settings"]);
		expect(items.some((item) => /report|international/i.test(item.id))).toBe(false);
		expect(items.find((item) => item.id === "inbox")?.isActive).toBe(true);
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

	it("puts a walk Language row at the end of account settings", () => {
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

		expect(accountSubItems.at(-1)).toEqual({
			kind: "locale",
			label: "Language",
		});
		expect(accountSubItems.filter(isLocaleNavSubItem)).toHaveLength(1);
		expect(accountSubItems.filter(isLinkNavSubItem).map((item) => item.href)).toEqual([
			"/settings/general",
			"/settings/security",
			"/settings/notifications",
			"/settings/billing",
		]);
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
				?.subItems?.filter(isLinkNavSubItem)
				.map((item) => item.href),
		).toContain("/settings/billing");
		expect(
			withoutBilling
				.find((item) => item.id === "account-settings")
				?.subItems?.filter(isLinkNavSubItem)
				.map((item) => item.href),
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
		expect(groups[0]?.items.map((item) => item.id)).toEqual(["start", "inbox", "chatbot"]);
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
