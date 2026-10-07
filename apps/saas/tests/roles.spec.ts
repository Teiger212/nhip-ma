import type { Page } from "@playwright/test";

import { expect, test } from "./support/fixtures";
import { LoginPage } from "./support/login-page";
import { AGENT, PLATFORM_ADMIN } from "./support/seed";
import { apiAs } from "./support/session";
import { signInContext } from "./support/session-state";

/** The sidebar's ways into an office's guests (CONTEXT.md "Inbox"; Home is the office's funnel). */
function officeLinks(page: Page) {
	return {
		inbox: page.getByRole("link", { name: "Inbox", exact: true }),
		home: page.getByRole("link", { name: "Home", exact: true }),
	};
}

/**
 * On Admin → Organizations: the address says so and its list is there. Waiting for the list
 * first means what the page does not offer is judged on a rendered page, not an empty one.
 */
async function expectAdminArea(page: Page) {
	await expect(page).toHaveURL(/\/en\/admin\/organizations$/);
	await expect(page.getByTestId("admin-organizations-search")).toBeVisible();
}

/** The sidebar offers the admin area only: the Admin entry, no Inbox and no Home. */
async function expectAdminSidebarOnly(page: Page) {
	await expect(page.getByRole("link", { name: "Admin", exact: true })).toBeVisible();
	const { inbox, home } = officeLinks(page);
	await expect(inbox).toHaveCount(0);
	await expect(home).toHaveCount(0);
}

// scenario: docs/e2e-scenarios.md Roles 1
test.describe("Roles 1 — the platform admin lands in the admin area", () => {
	test(
		"signing in as the platform admin opens Admin → Organizations, with no Inbox or Home",
		{ tag: "@core" },
		async ({ page }) => {
			const login = new LoginPage(page);
			await login.goto("en");
			await login.signIn(PLATFORM_ADMIN.email, PLATFORM_ADMIN.password);

			await expectAdminArea(page);
			await expectAdminSidebarOnly(page);
		},
	);
});

// scenario: docs/e2e-scenarios.md Roles 2
test.describe("Roles 2 — a platform admin's membership opens no guests", () => {
	test("opening /inbox, /home or / as the platform admin lands in the admin area", async ({
		page,
		context,
	}) => {
		await signInContext(context, PLATFORM_ADMIN);

		for (const path of ["/inbox", "/home", "/"]) {
			await page.goto(path);
			await expectAdminArea(page);
			await expectAdminSidebarOnly(page);
		}
	});

	test("the inbox's conversations API refuses the platform admin, list and thread alike", async () => {
		// A real thread of the office the platform admin is a member of (the seed's walk office).
		const agent = await apiAs(AGENT);
		const listed = await agent.get("/api/conversations");
		expect(listed.status(), "the agent's inbox lists the office's threads").toBe(200);
		const threads = (await listed.json()) as { id: string }[];
		expect(threads.length, "the walk office has threads").toBeGreaterThan(0);
		await agent.dispose();

		const admin = await apiAs(PLATFORM_ADMIN);
		const list = await admin.get("/api/conversations");
		expect(list.status(), "the platform admin cannot list the office's threads").toBe(403);
		const thread = await admin.get(`/api/conversations/${encodeURIComponent(threads[0].id)}`);
		expect(thread.status(), "the platform admin cannot open one of its threads").toBe(403);
		await admin.dispose();
	});

	test("the agent of the same office still lands in the Inbox and sees its threads", async ({
		page,
		context,
	}) => {
		await signInContext(context, AGENT);

		await page.goto("/");
		await expect(page).toHaveURL(/\/en\/inbox/);
		const { inbox, home } = officeLinks(page);
		await expect(inbox).toBeVisible();
		await expect(home).toBeVisible();

		// The threads the inbox's API gives the agent are the ones on screen.
		const listed = await page.request.get("/api/conversations");
		expect(listed.status()).toBe(200);
		const names = ((await listed.json()) as { guestName: string | null }[])
			.map((t) => t.guestName)
			.filter((name): name is string => !!name);
		expect(names.length, "the walk office has named guests").toBeGreaterThan(0);
		const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
		const anyGuest = new RegExp(`^(${names.map(escape).join("|")})`);
		await expect(page.getByRole("button", { name: anyGuest }).first()).toBeVisible();
		await expect(page.getByTestId("inbox-load-error")).toHaveCount(0);
	});
});
