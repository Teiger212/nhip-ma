import { test as base, expect } from "@playwright/test";
import type { Locator, Page } from "@playwright/test";

import { uniqueEmail, uniqueName } from "./data";
import type { Office } from "./offices";
import { deleteOffice, tryCreateOffice } from "./offices";
import { PLATFORM_ADMIN, WALK_OFFICE_ID } from "./seed";
import type { Api } from "./session";
import { signInApi, withOrigin } from "./session";

/** The admin lists load after the page and again after each search; the dev server is slow. */
const ADMIN_LIST = { timeout: 20_000 };

/**
 * The platform admin, in a browser context of their own: `api` for what they set up the way a
 * person can (ADR 0010: create an office, invite into it), `page` for what they see in the
 * admin area. Everything created through it is removed afterwards: pending invitations
 * cancelled, offices deleted (ADR 0013 deletes their non-admin members with them), and any
 * account under an email from `newEmail` removed through the admin's "Remove user".
 */
export type Admin = {
	page: Page;
	api: Api;
	/** A unique email whose account, should one ever exist, is removed after the test. */
	newEmail: (tag: string) => string;
	createOffice: (label: string) => Promise<Office>;
	/** Invites an email into an office (the walk office unless told otherwise). */
	invite: (email: string, officeId?: string) => Promise<string>;
	cancelInvitation: (invitationId: string) => Promise<void>;
	/** The office's members as the platform admin sees them. */
	memberEmails: (officeId: string) => Promise<string[]>;
	/** The office is still there, as the platform admin sees it. */
	expectOfficeExists: (office: Office) => Promise<void>;
	/** Admin → Users, searched for this email: the person-visible proof no account exists. */
	expectNoAccount: (email: string) => Promise<void>;
	/** Admin → Organizations, searched for a name: the row showing that exact name. */
	searchOffices: (name: string) => Promise<Locator>;
};

export const test = base.extend<{ admin: Admin }>({
	admin: async ({ browser }, use) => {
		const context = await browser.newContext();
		const page = await context.newPage();
		// The page shares the context's cookies, so signing in its API signs in the page too.
		const api = withOrigin(context.request);
		await signInApi(api, PLATFORM_ADMIN);

		const offices: string[] = [];
		const invitations: string[] = [];
		const emails: string[] = [];

		await use({
			page,
			api,
			newEmail: (tag) => {
				const email = uniqueEmail(tag);
				emails.push(email);
				return email;
			},
			createOffice: async (label) => {
				const name = uniqueName(label);
				const res = await tryCreateOffice(api, name);
				expect(res.status(), "the platform admin creates an office").toBe(200);
				const { id } = (await res.json()) as { id: string };
				offices.push(id);
				return { id, name };
			},
			invite: async (email, officeId = WALK_OFFICE_ID) => {
				const res = await api.post("/api/auth/organization/invite-member", {
					email,
					role: "member",
					organizationId: officeId,
				});
				expect(res.ok(), `the platform admin invites into the office: ${await res.text()}`).toBe(
					true,
				);
				const { id } = (await res.json()) as { id: string };
				invitations.push(id);
				return id;
			},
			cancelInvitation: async (invitationId) => {
				await api.post("/api/auth/organization/cancel-invitation", { invitationId });
			},
			memberEmails: async (officeId) => {
				const res = await api.get("/api/auth/organization/list-members", {
					organizationId: officeId,
				});
				expect(res.ok()).toBe(true);
				const { members } = (await res.json()) as { members: { user: { email: string } }[] };
				return members.map((m) => m.user.email);
			},
			expectOfficeExists: async (office) => {
				const res = await api.get("/api/auth/organization/get-full-organization", {
					organizationId: office.id,
				});
				expect(res.ok()).toBe(true);
				expect(await res.json()).toMatchObject({ id: office.id, name: office.name });
			},
			expectNoAccount: async (email) => {
				await page.goto("/en/admin/users");
				await page.getByTestId("admin-users-search").fill(email);
				await expect(page.getByTestId("admin-no-results")).toBeVisible(ADMIN_LIST);
				await expect(page.getByText(email)).toHaveCount(0);
			},
			searchOffices: async (name) => {
				await page.goto("/en/admin/organizations");
				await page.getByTestId("admin-organizations-search").fill(name);
				return page.getByText(name, { exact: true });
			},
		});

		// Accepted invitations cannot be cancelled; that refusal is fine here.
		for (const invitationId of invitations) {
			await api.post("/api/auth/organization/cancel-invitation", { invitationId });
		}
		for (const organizationId of offices) {
			await deleteOffice(api, organizationId);
		}
		for (const email of emails) {
			const res = await api.get("/api/auth/admin/list-users", {
				searchValue: email,
				searchField: "email",
			});
			if (!res.ok()) {
				continue;
			}
			const { users } = (await res.json()) as { users: { id: string; email: string }[] };
			for (const user of users.filter((u) => u.email === email)) {
				await api.post("/api/auth/admin/remove-user", { userId: user.id });
			}
		}
		await context.close();
	},
});

export { ADMIN_LIST, expect };
