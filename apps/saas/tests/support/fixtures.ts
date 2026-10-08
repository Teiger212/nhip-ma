import { test as base, expect } from "@playwright/test";
import type { APIRequestContext, BrowserContext, Locator, Page } from "@playwright/test";

import { uniqueEmail, uniqueName } from "./data";
import type { Office } from "./offices";
import { deleteOffice, tryCreateOffice } from "./offices";
import { PLATFORM_ADMIN, DEMO_OFFICE_ID } from "./seed";
import type { Api } from "./session";
import { clientIpHeaders, withOrigin } from "./session";
import { signInContext } from "./session-state";
import { startStateProcess } from "./state-client";

/** The admin lists load after the page and again after each search; the dev server is slow. */
const ADMIN_LIST = { timeout: 20_000 };

/** The kit's roles an invitation can carry: an agent is its `member`, a manager its `admin` or `owner`. */
type InviteRole = "member" | "admin" | "owner";

/**
 * The platform admin, in a browser context of their own: `api` (and `request`, the same context's
 * raw requests) for what they set up the way a person can (ADR 0010: create an office, invite
 * into it), `openPage` for what they see in the admin area. Everything created through it is
 * removed afterwards: offices deleted (ADR 0013 deletes their non-admin members with them, and
 * their invitations go with them), invitations into other offices cancelled, and any account
 * under an email from `newEmail` that no deleted office took with it removed through the
 * admin's "Remove user".
 */
export type Admin = {
	/**
	 * The admin's page, opened on first use (#278: most tests never look through it): every call
	 * gives the same page.
	 */
	openPage: () => Promise<Page>;
	api: Api;
	/** The admin's raw request context, for a helper that takes one (no page needed). */
	request: APIRequestContext;
	/** A unique email whose account, should one ever exist, is removed after the test. */
	newEmail: (tag: string) => string;
	createOffice: (label: string) => Promise<Office>;
	/**
	 * Invites an email into an office (the walk office unless told otherwise), as an agent (the
	 * kit's `member`) unless told `admin`, the kit's role for a manager (CONTEXT.md "Manager"), or
	 * `owner`, the kit's other manager role.
	 */
	invite: (email: string, officeId?: string, role?: InviteRole) => Promise<string>;
	/**
	 * Records that `email`'s account accepted an invitation into `officeId` (operators.ts's
	 * `joinOffice`): when every office it joined is one this fixture deletes, deleting them ends
	 * the account (ADR 0013), and teardown does not look for it again.
	 */
	joined: (email: string, officeId: string) => void;
	cancelInvitation: (invitationId: string) => Promise<void>;
	/** The office's members as the platform admin sees them. */
	memberEmails: (officeId: string) => Promise<string[]>;
	/** The office is still there, as the platform admin sees it. */
	expectOfficeExists: (office: Office) => Promise<void>;
	/** The office is gone, as the platform admin sees it: it can't be read, and it's not among theirs. */
	expectOfficeGone: (office: Office) => Promise<void>;
	/** Admin → Users, searched for this email: the person-visible proof no account exists. */
	expectNoAccount: (email: string) => Promise<void>;
	/** Admin → Organizations, searched for a name: the row showing that exact name. */
	searchOffices: (name: string) => Promise<Locator>;
};

/**
 * The platform admin for a whole worker (#278): offices shared by a worker's tests, created once
 * and deleted when the worker ends. Only for offices no test changes (a language, a switch, a
 * member removed): a test that changes its office takes one of its own from `admin`.
 */
export type WorkerAdmin = {
	api: Api;
	request: APIRequestContext;
	createOffice: (label: string) => Promise<Office>;
};

/** Requests that carry the Origin, as `withOrigin` makes them, for a context outside any test. */
function originApi(request: APIRequestContext, origin: string): Api {
	return {
		get: (url, params) => request.get(url, { params }),
		post: (url, data, headers) => request.post(url, { data, headers: { origin, ...headers } }),
	};
}

export const test = base.extend<{ admin: Admin }, { stateProcess: void; workerAdmin: WorkerAdmin }>(
	{
		// This worker's state process boots as the worker starts, not inside its first test's first
		// askState (#278): the boot overlaps the browser's launch and that test's setup.
		stateProcess: [
			// oxlint-disable-next-line no-empty-pattern -- Playwright requires a destructured first argument
			async ({}, use) => {
				startStateProcess();
				await use();
			},
			{ scope: "worker", auto: true },
		],
		workerAdmin: [
			async ({ browser }, use, workerInfo) => {
				// No test is running at worker scope, so nothing here reads test.info(): the project's
				// own baseURL, and a client IP of the worker's own (Better Auth's per-IP rate limit).
				const { baseURL, ignoreHTTPSErrors } = workerInfo.project.use;
				const origin = new URL(baseURL ?? "http://localhost:3000").origin;
				const n = workerInfo.workerIndex;
				const context = await browser.newContext({
					baseURL,
					ignoreHTTPSErrors,
					extraHTTPHeaders: { "x-forwarded-for": `10.254.${(n >> 8) & 255}.${n & 255}` },
				});
				const offices: string[] = [];
				try {
					await signInContext(context, PLATFORM_ADMIN);
					const api = originApi(context.request, origin);
					await use({
						api,
						request: context.request,
						createOffice: async (label) => {
							const name = uniqueName(label);
							const res = await tryCreateOffice(api, name);
							expect(res.status(), "the platform admin creates the worker's office").toBe(200);
							const { id } = (await res.json()) as { id: string };
							offices.push(id);
							return { id, name };
						},
					});
					await Promise.all(offices.map((organizationId) => deleteOffice(api, organizationId)));
				} finally {
					await context.close();
				}
			},
			{ scope: "worker" },
		],
		// Each test is its own client to Better Auth's per-IP rate limit (clientIpHeaders).
		// oxlint-disable-next-line no-empty-pattern -- Playwright requires a destructured first argument
		extraHTTPHeaders: async ({}, use) => {
			await use(clientIpHeaders());
		},
		admin: async ({ browser }, use) => {
			const context: BrowserContext = await browser.newContext({
				extraHTTPHeaders: clientIpHeaders("admin"),
			});
			// Signed in by a minted session (setup, not a flow under test); the page and the API
			// share the context's cookies.
			await signInContext(context, PLATFORM_ADMIN);
			const api = withOrigin(context.request);
			let opened: Promise<Page> | undefined;
			const openPage = () => (opened ??= context.newPage());

			const offices: string[] = [];
			const invitations: { id: string; officeId: string }[] = [];
			const emails: string[] = [];
			/** Each email's offices: those it was invited into, and those it joined. */
			const invitedInto = new Map<string, Set<string>>();
			const joinedInto = new Map<string, Set<string>>();
			const add = (map: Map<string, Set<string>>, email: string, officeId: string) => {
				map.set(email, (map.get(email) ?? new Set()).add(officeId));
			};

			await use({
				openPage,
				api,
				request: context.request,
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
				invite: async (email, officeId = DEMO_OFFICE_ID, role = "member") => {
					const res = await api.post("/api/auth/organization/invite-member", {
						email,
						role,
						organizationId: officeId,
					});
					expect(res.ok(), `the platform admin invites into the office: ${await res.text()}`).toBe(
						true,
					);
					const { id } = (await res.json()) as { id: string };
					invitations.push({ id, officeId });
					add(invitedInto, email, officeId);
					return id;
				},
				joined: (email, officeId) => add(joinedInto, email, officeId),
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
				expectOfficeGone: async (office) => {
					const res = await api.get("/api/auth/organization/get-full-organization", {
						organizationId: office.id,
					});
					// "Not found", not a refusal or a failure: the office is gone, not hidden.
					expect({ status: res.status(), body: await res.json() }, "reading the office").toEqual({
						status: 400,
						body: expect.objectContaining({ code: "ORGANIZATION_NOT_FOUND" }),
					});
					const listed = await api.get("/api/auth/organization/list");
					expect(listed.ok()).toBe(true);
					const ids = ((await listed.json()) as Office[]).map((o) => o.id);
					expect(ids, "the deleted office is not among the platform admin's").not.toContain(
						office.id,
					);
				},
				expectNoAccount: async (email) => {
					const page = await openPage();
					await page.goto("/en/admin/users");
					await page.getByTestId("admin-users-search").fill(email);
					await expect(page.getByTestId("admin-no-results")).toBeVisible(ADMIN_LIST);
					await expect(page.getByText(email)).toHaveCount(0);
				},
				searchOffices: async (name) => {
					const page = await openPage();
					await page.goto("/en/admin/organizations");
					await page.getByTestId("admin-organizations-search").fill(name);
					return page.getByText(name, { exact: true });
				},
			});

			// Round 1, in parallel: the offices are deleted (their invitations go with them: the
			// schema's cascade), and invitations into any other office (the walk office) are cancelled.
			// Accepted invitations cannot be cancelled; that refusal is fine here.
			const created = new Set(offices);
			const cancel = (invitationId: string) =>
				api.post("/api/auth/organization/cancel-invitation", { invitationId });
			const [deletes] = await Promise.all([
				Promise.all(
					offices.map(async (organizationId) => ({
						organizationId,
						ok: (await deleteOffice(api, organizationId)).ok(),
					})),
				),
				Promise.all(invitations.filter((i) => !created.has(i.officeId)).map((i) => cancel(i.id))),
			]);
			const deleted = new Set(deletes.filter((d) => d.ok).map((d) => d.organizationId));
			// Round 2: an office that could not be deleted keeps its invitations; cancel them.
			await Promise.all(
				invitations
					.filter((i) => created.has(i.officeId) && !deleted.has(i.officeId))
					.map((i) => cancel(i.id)),
			);
			// Round 3: the accounts. One that joined only offices deleted above went with them (ADR
			// 0013: no office, no account), unless it was also invited elsewhere; every other email is
			// looked for, and its account removed.
			const endedWithItsOffices = (email: string) => {
				const joined = joinedInto.get(email);
				if (!joined) {
					return false;
				}
				const all = [...joined, ...(invitedInto.get(email) ?? [])];
				return all.every((officeId) => deleted.has(officeId));
			};
			await Promise.all(
				emails
					.filter((email) => !endedWithItsOffices(email))
					.map(async (email) => {
						const res = await api.get("/api/auth/admin/list-users", {
							searchValue: email,
							searchField: "email",
						});
						if (!res.ok()) {
							return;
						}
						const { users } = (await res.json()) as { users: { id: string; email: string }[] };
						await Promise.all(
							users
								.filter((u) => u.email === email)
								.map((user) => api.post("/api/auth/admin/remove-user", { userId: user.id })),
						);
					}),
			);
			await context.close();
		},
	},
);

export { ADMIN_LIST, expect };
