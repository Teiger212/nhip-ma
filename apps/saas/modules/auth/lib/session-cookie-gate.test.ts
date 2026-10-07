import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { loginRedirectPath, PUBLIC_PAGES } from "./session-cookie-gate";

describe("the proxy's session-cookie gate (#231)", () => {
	it.each([
		["/en", "/en/login"],
		["/en/home", "/en/login"],
		["/vi/inbox", "/vi/login"],
		["/en/settings/security", "/en/login"],
		["/en/walk/settings/members", "/en/login"],
		["/vi/admin/organizations/abc", "/vi/login"],
		["/en/new-organization", "/en/login"],
		["/en/onboarding", "/en/login"],
		["/en/no-such-page", "/en/login"],
	])("sends a signed-in page, %s, to %s", (pathname, login) => {
		expect(loginRedirectPath("GET", pathname)).toBe(login);
		expect(loginRedirectPath("HEAD", pathname)).toBe(login);
	});

	it.each([
		"/en/login",
		"/vi/login",
		"/en/signup",
		"/en/forgot-password",
		"/en/reset-password",
		"/en/verify",
		"/en/organization-invitation/inv-1",
	])("never redirects the public page %s", (pathname) => {
		expect(loginRedirectPath("GET", pathname)).toBeNull();
	});

	it.each([
		"/",
		"/inbox",
		"/home",
		"/api/auth/get-session",
		"/api/conversations",
		"/webhooks/zalo",
		"/webhooks/whatsapp",
		"/dev/inbound",
		"/image-proxy/avatars/x",
		"/_next/static/chunks/app.js",
		"/_vercel/insights/script.js",
		"/favicon.ico",
		"/manifest.webmanifest",
		"/robots.txt",
		"/en/apple-icon.png",
		"/fr/home",
	])("never redirects %s, whatever the matcher lets in", (pathname) => {
		expect(loginRedirectPath("GET", pathname)).toBeNull();
	});

	it("leaves non-page requests (server actions) to the page's own check", () => {
		expect(loginRedirectPath("POST", "/en/inbox")).toBeNull();
		expect(loginRedirectPath("PUT", "/en/home")).toBeNull();
	});

	it("knows every page of the (unauthenticated) group as public", () => {
		const group = path.resolve(import.meta.dirname, "../../../app/[locale]/(unauthenticated)");
		const pages = fs
			.readdirSync(group, { withFileTypes: true })
			.filter((entry) => entry.isDirectory())
			.map((entry) => entry.name);

		expect(pages.length).toBeGreaterThan(0);
		for (const page of pages) {
			expect(PUBLIC_PAGES.has(page), `${page} is public`).toBe(true);
		}
	});
});
