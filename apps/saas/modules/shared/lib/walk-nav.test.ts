import { describe, expect, it } from "vitest";

import { buildSettingsSections, buildWalkNav, isNavSubItemActive } from "./walk-nav";

describe("buildWalkNav", () => {
	it("is Home, Inbox, then International, coming soon (PRODUCT.md, the Coming soon rule)", () => {
		const items = buildWalkNav("/inbox");
		expect(items.map((item) => item.id)).toEqual(["home", "inbox", "international"]);
		expect(items.find((item) => item.id === "inbox")?.isActive).toBe(true);
		expect(items.find((item) => item.id === "home")?.isActive).toBe(false);
	});

	it("International is disabled, marked Coming soon, links nowhere and is never active", () => {
		for (const pathname of ["/inbox", "/home", "/international", "/settings/general"]) {
			expect(buildWalkNav(pathname).find((item) => item.id === "international")).toEqual({
				id: "international",
				href: null,
				iconName: "globe",
				isActive: false,
				comingSoon: true,
			});
		}
		expect(buildWalkNav("/inbox").filter((item) => item.comingSoon)).toHaveLength(1);
	});

	it("the platform admin sees the admin area only; operators never see it", () => {
		expect(buildWalkNav("/admin/organizations").map((item) => item.id)).toEqual([
			"home",
			"inbox",
			"international",
		]);
		const admin = buildWalkNav("/admin/organizations", { isAdmin: true });
		expect(admin).toEqual([
			{
				id: "admin",
				href: "/admin/organizations",
				iconName: "shield",
				isActive: true,
			},
		]);
		expect(buildWalkNav("/vi/admin/users", { isAdmin: true })[0]?.isActive).toBe(true);
	});

	it("Home is the numbers screen at /home, in either locale", () => {
		expect(buildWalkNav("/home").find((item) => item.id === "home")?.isActive).toBe(true);
		expect(buildWalkNav("/vi/home").find((item) => item.id === "home")?.isActive).toBe(true);
		expect(buildWalkNav("/home").find((item) => item.id === "inbox")?.isActive).toBe(false);
	});

	it("marks nested inbox routes as the live job, and nothing elsewhere", () => {
		expect(buildWalkNav("/inbox/thread-1").find((item) => item.id === "inbox")?.isActive).toBe(
			true,
		);
		expect(buildWalkNav("/settings/general").some((item) => item.isActive)).toBe(false);
	});
});

describe("buildSettingsSections", () => {
	it("is null outside settings", () => {
		expect(buildSettingsSections("/inbox")).toBeNull();
	});

	it("lists the account sections and activates the current one", () => {
		const sections = buildSettingsSections("/settings/security");
		expect(sections?.map((section) => section.href)).toEqual([
			"/settings/general",
			"/settings/security",
			"/settings/notifications",
		]);
		expect(sections?.find((section) => section.id === "security")?.isActive).toBe(true);
		expect(sections?.find((section) => section.id === "general")?.isActive).toBe(false);
	});

	it("has no Billing until its kit screen is on (ADR 0014), and lists it once it is", () => {
		const off = buildSettingsSections("/settings/general");
		expect(off?.some((section) => section.href === "/settings/billing")).toBe(false);
		const on = buildSettingsSections("/settings/general", { billing: true });
		expect(on?.at(-1)?.href).toBe("/settings/billing");
	});
});

describe("isNavSubItemActive", () => {
	it("matches the exact href and nested paths", () => {
		expect(isNavSubItemActive("/settings/general", "/settings/general")).toBe(true);
		expect(isNavSubItemActive("/settings/general/extra", "/settings/general")).toBe(true);
		expect(isNavSubItemActive("/settings/security", "/settings/general")).toBe(false);
	});
});
