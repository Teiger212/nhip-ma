import { describe, expect, it } from "vitest";

import { buildSettingsSections, buildWalkNav, isNavSubItemActive } from "./walk-nav";

describe("buildWalkNav", () => {
	it("is Home, Inbox and one disabled placeholder, in that order", () => {
		const items = buildWalkNav("/inbox");
		expect(items.map((item) => item.id)).toEqual(["home", "inbox", "international"]);
		expect(items.map((item) => item.disabled)).toEqual([false, false, true]);
		expect(items.find((item) => item.id === "inbox")?.isActive).toBe(true);
		expect(items.find((item) => item.id === "home")?.isActive).toBe(false);
	});

	it("Admin is listed only for a platform admin, and only then can be active", () => {
		expect(buildWalkNav("/admin/organizations").map((item) => item.id)).toEqual([
			"home",
			"inbox",
			"international",
		]);
		const admin = buildWalkNav("/admin/organizations", { isAdmin: true });
		expect(admin.map((item) => item.id)).toEqual(["home", "inbox", "international", "admin"]);
		expect(admin.find((item) => item.id === "admin")).toMatchObject({
			href: "/admin/organizations",
			isActive: true,
			disabled: false,
		});
		expect(
			buildWalkNav("/vi/inbox", { isAdmin: true }).find((item) => item.id === "admin")?.isActive,
		).toBe(false);
	});

	it("Home is the numbers screen at /home, in either locale", () => {
		expect(buildWalkNav("/home").find((item) => item.id === "home")?.isActive).toBe(true);
		expect(buildWalkNav("/vi/home").find((item) => item.id === "home")?.isActive).toBe(true);
		expect(buildWalkNav("/home").find((item) => item.id === "inbox")?.isActive).toBe(false);
	});

	it("marks nested inbox routes as the live job and never activates placeholders", () => {
		expect(buildWalkNav("/inbox/thread-1").find((item) => item.id === "inbox")?.isActive).toBe(
			true,
		);
		const onChatbot = buildWalkNav("/chatbot");
		expect(onChatbot.find((item) => item.id === "international")?.isActive).toBe(false);
		expect(onChatbot.find((item) => item.id === "inbox")?.isActive).toBe(false);
	});
});

describe("buildSettingsSections", () => {
	it("is null outside settings", () => {
		expect(buildSettingsSections("/inbox", { billingAttachedToUser: true })).toBeNull();
	});

	it("lists the account sections and activates the current one", () => {
		const sections = buildSettingsSections("/settings/security", { billingAttachedToUser: true });
		expect(sections?.map((section) => section.href)).toEqual([
			"/settings/general",
			"/settings/security",
			"/settings/notifications",
			"/settings/billing",
		]);
		expect(sections?.find((section) => section.id === "security")?.isActive).toBe(true);
		expect(sections?.find((section) => section.id === "general")?.isActive).toBe(false);
	});

	it("omits billing when it is attached to the organization", () => {
		const sections = buildSettingsSections("/settings/general", { billingAttachedToUser: false });
		expect(sections?.map((section) => section.id)).toEqual([
			"general",
			"security",
			"notifications",
		]);
	});
});

describe("isNavSubItemActive", () => {
	it("matches the exact href and nested paths", () => {
		expect(isNavSubItemActive("/settings/general", "/settings/general")).toBe(true);
		expect(isNavSubItemActive("/settings/general/extra", "/settings/general")).toBe(true);
		expect(isNavSubItemActive("/settings/security", "/settings/general")).toBe(false);
	});
});
