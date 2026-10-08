import type { Browser, Locator, Page, Response } from "@playwright/test";

import type { Admin } from "./support/fixtures";
import { expect, test } from "./support/fixtures";
import { openInboxAsNewAccount } from "./support/invitee";
import type { Office } from "./support/offices";
import { joinOffice } from "./support/operators";
import {
	AGENT,
	AGENT_2,
	MANAGER,
	PLATFORM_ADMIN,
	DEMO_OFFICE_ID,
	officeUrl,
	officeUrlOf,
} from "./support/seed";
import type { Api } from "./support/session";
import { apiAs, withOrigin } from "./support/session";
import { signInContext } from "./support/session-state";

/**
 * Team's words (docs/e2e-scenarios.md "Team"): Nhịp's roles, never member, admin or owner. The
 * Vietnamese copy is the translation-key test's (modules/i18n/lib/translation-keys.test.ts, #278).
 */
const COPY = {
	en: { team: "Team", agent: "Agent", manager: "Manager", logOut: "Log out" },
} as const;

/** "Remove from office" and its confirmation (docs/e2e-scenarios.md Team 4). */
const REMOVE = {
	menuItem: "Remove from office",
	title: (name: string) => `Remove ${name} from the office?`,
	message: (name: string) =>
		`Removing ${name} ends their account. Their guests return to Unassigned.`,
	cancel: "Cancel",
	confirm: "Remove",
} as const;

/** How the platform admin's own row reads in the admin area (docs/e2e-scenarios.md Team 6). */
const PLATFORM_ADMIN_ROLE = { en: "Platform admin", vi: "Quản trị viên nền tảng" } as const;

/** The name every joined operator's account has (support/accounts.ts). */
const JOINED_NAME = "E2E Invitee";

/** The kit's success toast for an invitation, in Nhịp's words. */
const INVITATION_SENT = "Invitation sent";

type Member = { id: string; role: string; userId: string; user: { email: string } };
type Invitation = { id: string; email: string; role: string; status: string };

/** The office's members, roles included, as the platform admin sees them. */
async function membersOf(api: Api, officeId: string): Promise<Member[]> {
	const res = await api.get("/api/auth/organization/get-full-organization", {
		organizationId: officeId,
	});
	expect(res.ok(), "the platform admin reads the office").toBe(true);
	return ((await res.json()) as { members: Member[] }).members;
}

/** The office's address slug, as the platform admin sees it. */
async function slugOf(api: Api, officeId: string): Promise<string> {
	const res = await api.get("/api/auth/organization/get-full-organization", {
		organizationId: officeId,
	});
	expect(res.ok()).toBe(true);
	return ((await res.json()) as { slug: string }).slug;
}

/** Pending invitations to this email in the office, as the platform admin sees them. */
async function pendingInvitationsTo(api: Api, officeId: string, email: string) {
	const res = await api.get("/api/auth/organization/list-invitations", {
		organizationId: officeId,
	});
	expect(res.ok(), "the platform admin lists the office's invitations").toBe(true);
	return ((await res.json()) as Invitation[]).filter(
		(i) => i.email === email && i.status === "pending",
	);
}

/** Cancels whatever pending invitations these emails have in the office (made through the UI or a refused-but-taken call). */
async function cancelInvitationsTo(admin: Admin, officeId: string, emails: string[]) {
	for (const email of emails) {
		for (const invitation of await pendingInvitationsTo(admin.api, officeId, email)) {
			await admin.cancelInvitation(invitation.id);
		}
	}
}

/** The user menu: the ⋯ beside the person's name in the expanded desktop sidebar. */
async function openUserMenu(page: Page) {
	await page.getByRole("button", { name: "User menu" }).click();
}

function teamItem(page: Page) {
	return page.getByRole("menuitem", { name: COPY.en.team, exact: true });
}

/** Team's flow handles (data-test) and the copy under test. */
function team(page: Page) {
	return {
		heading: (name: string) => page.getByRole("heading", { name, exact: true }),
		inviteEmail: page.getByTestId("team-invite-email"),
		inviteRole: page.getByTestId("team-invite-role"),
		inviteSubmit: page.getByTestId("team-invite-submit"),
		pendingTab: page.getByRole("tab", { name: "Pending invitations" }),
		member: (email: string) => page.getByTestId("team-member").filter({ hasText: email }),
		memberRole: (row: Locator) => row.getByTestId("team-member-role"),
		invitation: (email: string) => page.getByTestId("team-invitation").filter({ hasText: email }),
		invitationRole: (row: Locator) => row.getByTestId("team-invitation-role"),
		/** The options of the open role select. */
		options: page.getByRole("listbox").getByRole("option"),
	};
}

/**
 * Asks, as `api`, to invite `email` into the office with `role` (a kit role, or the API's other
 * spellings of one: a comma list); returns the answer's status.
 */
async function tryInvite(api: Api, officeId: string, email: string, role: string) {
	const res = await api.post("/api/auth/organization/invite-member", {
		email,
		role,
		organizationId: officeId,
	});
	return res.status();
}

/**
 * The ways the kit's API can be asked for an owner: the plain role, a comma list with a space
 * (which the kit itself does not trim, so only Nhịp's own guard refuses it for a kit admin), and,
 * for a role change, an array.
 */
const OWNER_INVITE_ROLES = ["owner", "member, owner"] as const;
const OWNER_ROLE_CHANGES: (string | string[])[] = ["owner", "member, owner", ["member", " owner"]];

/**
 * The manager (kit admin or owner) asking to make an owner: inviting with role `owner`, and
 * changing an agent's role to `owner`, in every spelling the API takes. Each is refused (403),
 * nothing is invited, the role stays.
 */
async function expectNoOwnerFrom(
	manager: Api,
	admin: Admin,
	office: Office,
	agentEmail: string,
	who: string,
) {
	for (const role of OWNER_INVITE_ROLES) {
		const invitee = admin.newEmail(`owner-by-${who}`);
		const label = `${who}: invite as ${JSON.stringify(role)}`;
		expect.soft(await tryInvite(manager, office.id, invitee, role), label).toBe(403);
		expect
			.soft(
				await pendingInvitationsTo(admin.api, office.id, invitee),
				`${label}: no invitation made`,
			)
			.toEqual([]);
		await cancelInvitationsTo(admin, office.id, [invitee]);
	}

	const agentMember = (await membersOf(admin.api, office.id)).find(
		(m) => m.user.email === agentEmail,
	);
	expect(agentMember, "the agent is a member of the office").toBeDefined();
	for (const role of OWNER_ROLE_CHANGES) {
		const label = `${who}: change an agent's role to ${JSON.stringify(role)}`;
		const changed = await manager.post("/api/auth/organization/update-member-role", {
			memberId: agentMember?.id,
			role,
			organizationId: office.id,
		});
		expect.soft(changed.status(), label).toBe(403);
		const after = (await membersOf(admin.api, office.id)).find((m) => m.user.email === agentEmail);
		expect.soft(after?.role, `${label}: the agent's role is unchanged`).toBe("member");
	}
}

/** The office's answer that tells the app the operator's role; the menu offers Team only after it. */
function officeAnswered(page: Page) {
	return page.waitForResponse((r) => new URL(r.url()).pathname === "/api/office");
}

// scenario: docs/e2e-scenarios.md Team 1
test.describe("Team 1 — a manager invites an agent from Team", () => {
	test("Team's invite form offers Agent and Manager only, and invites an agent and a manager", async ({
		page,
		context,
		admin,
	}) => {
		await signInContext(context, MANAGER);
		const t = team(page);
		const asAgent = admin.newEmail("team-agent");
		const asManager = admin.newEmail("team-manager");

		try {
			await test.step("the manager's user menu has Team, and it opens the office's Team page", async () => {
				await page.goto("/en/inbox");

				await openUserMenu(page);
				await expect(teamItem(page)).toBeVisible();
				await teamItem(page).click();

				await expect(page).toHaveURL(new RegExp(`${officeUrl("settings/members")}$`));
				await expect(t.heading(COPY.en.team)).toBeVisible();
			});

			// On the Team page the menu opened: the role offers exactly Agent and Manager, with Agent
			// chosen; no Owner.
			await expect(t.inviteRole).toHaveText(COPY.en.agent);
			await t.inviteRole.click();
			await expect(t.options).toHaveText([COPY.en.agent, COPY.en.manager]);
			await expect(page.getByRole("option", { name: "Owner" })).toHaveCount(0);
			await page.keyboard.press("Escape");

			// Invited as Agent (the default).
			await t.inviteEmail.fill(asAgent);
			await t.inviteSubmit.click();
			await expect(page.getByText(INVITATION_SENT, { exact: true })).toBeVisible();

			await t.pendingTab.click();
			await expect(t.invitationRole(t.invitation(asAgent))).toHaveText(COPY.en.agent);

			// Invited as Manager.
			await t.inviteEmail.fill(asManager);
			await t.inviteRole.click();
			await page.getByRole("option", { name: COPY.en.manager, exact: true }).click();
			await t.inviteSubmit.click();
			await expect(t.invitationRole(t.invitation(asManager))).toHaveText(COPY.en.manager);

			// The words are Nhịp's; the office got an agent (the kit's member) and a manager (its admin).
			const [agentInvite] = await pendingInvitationsTo(admin.api, DEMO_OFFICE_ID, asAgent);
			const [managerInvite] = await pendingInvitationsTo(admin.api, DEMO_OFFICE_ID, asManager);
			expect.soft(agentInvite?.role, "Agent is the kit's member").toBe("member");
			expect.soft(managerInvite?.role, "Manager is the kit's admin").toBe("admin");
		} finally {
			await cancelInvitationsTo(admin, DEMO_OFFICE_ID, [asAgent, asManager]);
		}
	});
});

// scenario: docs/e2e-scenarios.md Team 2
test.describe("Team 2 — an agent has no Team", () => {
	test("the agent's user menu has no Team, and Team's address is not found", async ({
		page,
		context,
	}) => {
		await signInContext(context, AGENT);
		// "No Team" is judged once the app knows the agent's role, not before.
		const office = officeAnswered(page);
		await page.goto("/en/inbox");
		expect((await office).ok(), "the office answered").toBe(true);

		await openUserMenu(page);
		await expect(page.getByRole("menuitem", { name: COPY.en.logOut })).toBeVisible();
		await expect.soft(teamItem(page), "no Team in the agent's menu").toHaveCount(0);
		await page.keyboard.press("Escape");

		const res = await page.goto(officeUrl("settings/members"));
		expect.soft(res?.status(), "Team's address answers 404 for an agent").toBe(404);
		await expect.soft(page.getByText("Page not found")).toBeVisible();
		// No member list, no invite form.
		await expect.soft(page.getByText(MANAGER.email)).toHaveCount(0);
		await expect.soft(page.getByText(AGENT_2.email)).toHaveCount(0);
		await expect.soft(team(page).inviteEmail).toHaveCount(0);
		await expect.soft(page.getByRole("button", { name: "Invite" })).toHaveCount(0);
	});

	test("the platform admin's user menu has no Team either", async ({ admin }) => {
		const page = await admin.openPage();
		await page.goto("/en/admin/organizations");
		await expect(page.getByTestId("admin-organizations-search")).toBeVisible();

		await openUserMenu(page);
		await expect(page.getByRole("menuitem", { name: COPY.en.logOut })).toBeVisible();
		await expect(teamItem(page)).toHaveCount(0);
	});

	test("the kit's API refuses the agent: no invitation, no role change, no removal", async ({
		browser,
		admin,
	}) => {
		test.slow();
		// An office of the test's own: were a removal taken, it would cost no seeded login.
		const office = await admin.createOffice("Team 2");
		const [agent, colleague] = await Promise.all([
			joinOffice(admin, browser, office.id, "member", "team2-agent"),
			joinOffice(admin, browser, office.id, "member", "team2-colleague"),
		]);
		const invitees: string[] = [];

		try {
			for (const role of ["member", "admin", "owner"] as const) {
				const invitee = admin.newEmail(`by-agent-${role}`);
				invitees.push(invitee);
				expect
					.soft(await tryInvite(agent.api, office.id, invitee, role), `agent invites as ${role}`)
					.toBe(403);
				expect
					.soft(
						await pendingInvitationsTo(admin.api, office.id, invitee),
						`no invitation made (${role})`,
					)
					.toEqual([]);
			}

			const colleagueMember = (await membersOf(admin.api, office.id)).find(
				(m) => m.user.email === colleague.email,
			);
			expect(colleagueMember, "the colleague is a member").toBeDefined();

			const changed = await agent.api.post("/api/auth/organization/update-member-role", {
				memberId: colleagueMember?.id,
				role: "admin",
				organizationId: office.id,
			});
			expect.soft(changed.status(), "agent changes a colleague's role").toBe(403);
			const afterChange = (await membersOf(admin.api, office.id)).find(
				(m) => m.user.email === colleague.email,
			);
			expect.soft(afterChange?.role, "the colleague's role is unchanged").toBe("member");

			const removed = await agent.api.post("/api/auth/organization/remove-member", {
				memberIdOrEmail: colleagueMember?.id,
				organizationId: office.id,
			});
			expect.soft(removed.ok(), `agent removes a colleague (${removed.status()})`).toBe(false);
			expect
				.soft(
					(await membersOf(admin.api, office.id)).map((m) => m.user.email),
					"the colleague stays",
				)
				.toContain(colleague.email);
		} finally {
			await cancelInvitationsTo(admin, office.id, invitees);
			await agent.close();
			await colleague.close();
		}
	});
});

// scenario: docs/e2e-scenarios.md Team 3
// scenario: docs/e2e-scenarios.md Team 6
test.describe("Team 3 and Team 6 — the walk office's manager on Team: no owner, no Leave, no platform admin, and nothing of the platform admin reaches their browser", () => {
	test("the manager opens Team: no answer the browser gets carries the platform admin, the list shows managers and agents only, and the office read directly lists no platform admin", async ({
		page,
		context,
	}) => {
		// Many independent checks, each waiting its own timeout when it fails.
		test.slow();
		await signInContext(context, MANAGER);

		// First: Team 6 judges what the page's first load carried.
		await test.step("Team 6: neither Team's page nor any /api/auth/ answer it gets carries the platform admin's email", async () => {
			const answers: Promise<{ url: string; document: boolean; body: string | null }>[] = [];
			const listen = (response: Response) => {
				const url = response.url();
				const document = response.request().resourceType() === "document";
				if (!document && !new URL(url).pathname.startsWith("/api/auth/")) {
					return;
				}
				answers.push(
					response.text().then(
						(body) => ({ url, document, body }),
						// A redirect has no body to read.
						() => ({ url, document, body: null }),
					),
				);
			};
			page.on("response", listen);

			await page.goto(officeUrl("settings/members"));
			// The list is rendered, so the answers it was made from have arrived.
			const t = team(page);
			await expect(t.memberRole(t.member(AGENT.email))).toHaveText(COPY.en.agent);
			await expect(t.memberRole(t.member(MANAGER.email))).toHaveText(COPY.en.manager);

			page.off("response", listen);
			const read = await Promise.all(answers);
			expect(
				read.some((a) => a.document && a.body),
				"the page itself was read",
			).toBe(true);
			// The office's members did reach the browser through what was read: the check below has teeth.
			expect(
				read.some((a) => a.body?.includes(AGENT.email)),
				"the members the page lists are in what was read",
			).toBe(true);
			const carrying = read.filter((a) => a.body?.includes(PLATFORM_ADMIN.email)).map((a) => a.url);
			expect(carrying, "answers carrying the platform admin's email").toEqual([]);
		});

		// On the same page: Team 3's list.
		await test.step("Team 3: the manager's Team lists managers and agents only, with no Leave or menu on their own row", async () => {
			const t = team(page);

			// The list is rendered: the manager's own row, as Manager. (In the page's main region: by
			// now the sidebar's user link shows the same email.)
			await expect(page.getByRole("main").getByText(MANAGER.email)).toBeVisible();
			const own = t.member(MANAGER.email);
			await expect.soft(own).toBeVisible();
			await expect.soft(t.memberRole(own)).toHaveText(COPY.en.manager);
			await expect.soft(t.memberRole(t.member(AGENT.email))).toHaveText(COPY.en.agent);
			await expect.soft(t.memberRole(t.member(AGENT_2.email))).toHaveText(COPY.en.agent);

			// Every row reads Agent or Manager; no Owner anywhere.
			const roles = await t.memberRole(page.getByTestId("team-member")).allInnerTexts();
			expect.soft(roles.length, "the member rows carry their role").toBeGreaterThan(0);
			for (const role of roles) {
				expect.soft([COPY.en.agent, COPY.en.manager]).toContain(role.trim());
			}
			await expect.soft(page.getByText("Owner", { exact: true })).toHaveCount(0);

			// The platform admin, the office's inert kit owner, is not listed.
			await expect.soft(t.member(PLATFORM_ADMIN.email)).toHaveCount(0);
			await expect.soft(page.getByText(PLATFORM_ADMIN.email)).toHaveCount(0);

			// Their own row: no Leave, no menu, and their role can't be changed there.
			await expect.soft(own.getByRole("button")).toHaveCount(0);
			await expect.soft(own.getByRole("combobox", { disabled: false })).toHaveCount(0);
			await expect.soft(page.getByText(/Leave/)).toHaveCount(0);

			// An agent's row offers Agent and Manager only.
			await t.memberRole(t.member(AGENT.email)).click();
			await expect(t.options).toHaveText([COPY.en.agent, COPY.en.manager]);
			await page.keyboard.press("Escape");
		});

		await test.step("Team 6: asked directly, the office as the manager reads it lists no platform admin, and list-members counts only whom it lists", async () => {
			const api = withOrigin(page.request);

			const full = await api.get("/api/auth/organization/get-full-organization", {
				organizationId: DEMO_OFFICE_ID,
			});
			expect(full.status(), "the manager reads the office").toBe(200);
			const fullEmails = ((await full.json()) as { members: Member[] }).members.map(
				(m) => m.user.email,
			);
			expect(fullEmails, "get-full-organization lists the office's people").toContain(AGENT.email);
			expect
				.soft(fullEmails, "get-full-organization lists no platform admin")
				.not.toContain(PLATFORM_ADMIN.email);

			const listed = await api.get("/api/auth/organization/list-members", {
				organizationId: DEMO_OFFICE_ID,
			});
			expect(listed.status(), "the manager lists the office's members").toBe(200);
			const { members, total } = (await listed.json()) as { members: Member[]; total: number };
			const listedEmails = members.map((m) => m.user.email);
			expect(listedEmails, "list-members lists the office's people").toContain(AGENT.email);
			expect
				.soft(listedEmails, "list-members lists no platform admin")
				.not.toContain(PLATFORM_ADMIN.email);
			expect
				.soft(total, "list-members' total counts only the members it lists")
				.toBe(members.length);
		});
	});
});

// scenario: docs/e2e-scenarios.md Team 3
test.describe("Team 3 — no owner, no Leave, no platform admin on Team", () => {
	test("a manager (the kit's admin) can't make an owner, by invitation or by role change", async ({
		browser,
		admin,
	}) => {
		test.slow();
		const office = await admin.createOffice("Team 3 admin");
		const [manager, agent] = await Promise.all([
			joinOffice(admin, browser, office.id, "admin", "team3-manager"),
			joinOffice(admin, browser, office.id, "member", "team3-agent"),
		]);

		try {
			await expectNoOwnerFrom(manager.api, admin, office, agent.email, "kit-admin manager");
		} finally {
			await manager.close();
			await agent.close();
		}
	});

	test("a manager holding the kit's owner role sees Team as any manager, and can't make an owner either", async ({
		browser,
		admin,
	}) => {
		test.slow();
		const office = await admin.createOffice("Team 3 owner");
		const [manager, agent] = await Promise.all([
			// A new account, before the kit's first-run step, which it walks below.
			joinOffice(admin, browser, office.id, "owner", "team3-owner", { onboarded: false }),
			joinOffice(admin, browser, office.id, "member", "team3-owner-agent"),
		]);
		try {
			// Team as any manager sees it (before any owner grant is tried).
			const { page } = manager;
			const t = team(page);
			await openInboxAsNewAccount(page);
			await openUserMenu(page);
			await expect.soft(teamItem(page)).toBeVisible();
			await page.keyboard.press("Escape");

			await page.goto(officeUrlOf(await slugOf(admin.api, office.id), "settings/members"));
			const own = t.member(manager.email);
			await expect.soft(own).toBeVisible();
			await expect.soft(t.memberRole(own)).toHaveText(COPY.en.manager);
			await expect.soft(t.memberRole(t.member(agent.email))).toHaveText(COPY.en.agent);
			await expect.soft(page.getByText("Owner", { exact: true })).toHaveCount(0);
			await expect.soft(t.member(PLATFORM_ADMIN.email)).toHaveCount(0);
			await expect.soft(own.getByRole("button")).toHaveCount(0);
			await expect.soft(page.getByText(/Leave/)).toHaveCount(0);

			await expectNoOwnerFrom(manager.api, admin, office, agent.email, "kit-owner manager");
		} finally {
			await manager.close();
			await agent.close();
		}
	});
});

/** Chooses "Remove from office" on a member's row: the row's own menu, then the item. */
async function chooseRemove(page: Page, email: string) {
	await team(page).member(email).getByRole("button").click();
	await page.getByRole("menuitem", { name: REMOVE.menuItem, exact: true }).click();
}

/** The confirmation "Remove from office" opens, for the person named `name`. */
function removeConfirmation(page: Page, name: string) {
	const dialog = page.getByRole("alertdialog", { name: REMOVE.title(name) });
	return {
		dialog,
		message: dialog.getByText(REMOVE.message(name), { exact: true }),
		cancel: dialog.getByRole("button", { name: REMOVE.cancel, exact: true }),
		confirm: dialog.getByRole("button", { name: REMOVE.confirm, exact: true }),
	};
}

/**
 * An office of the test's own with a new manager (the kit's admin), past the first-run step and
 * on its Team page, and an agent; both joined (support/operators.ts).
 */
async function officeWithTeam(browser: Browser, admin: Admin, label: string, tag: string) {
	const office = await admin.createOffice(label);
	const [manager, agent] = await Promise.all([
		joinOffice(admin, browser, office.id, "admin", `${tag}-manager`, { onboarded: false }),
		joinOffice(admin, browser, office.id, "member", `${tag}-agent`),
	]);
	const close = async () => {
		await manager.close();
		await agent.close();
	};
	try {
		await openInboxAsNewAccount(manager.page);
		await manager.page.goto(officeUrlOf(await slugOf(admin.api, office.id), "settings/members"));
		const t = team(manager.page);
		await expect(t.memberRole(t.member(agent.email))).toHaveText(COPY.en.agent);
	} catch (error) {
		await close();
		throw error;
	}
	return { office, manager, agent, close };
}

// scenario: docs/e2e-scenarios.md Team 4
test.describe("Team 4 — removing someone asks first", () => {
	test("Remove from office asks first: Cancel keeps the agent; Remove removes them and their account", async ({
		browser,
		admin,
	}) => {
		test.slow();
		const { office, manager, agent, close } = await officeWithTeam(
			browser,
			admin,
			"Team 4",
			"team4",
		);
		try {
			const { page } = manager;
			const row = team(page).member(agent.email);
			const ask = removeConfirmation(page, JOINED_NAME);

			await chooseRemove(page, agent.email);
			await expect(ask.dialog, "Remove from office asks first").toBeVisible();
			await expect.soft(ask.message).toBeVisible();
			await expect.soft(ask.cancel).toBeVisible();
			await expect.soft(ask.confirm).toBeVisible();

			// Cancel: the dialog closes and the agent stays, on Team and in the office.
			await ask.cancel.click();
			await expect(ask.dialog).toHaveCount(0);
			await expect(row, "Cancel keeps the agent on Team").toBeVisible();
			await page.reload();
			await expect(row, "still on Team after a reload").toBeVisible();
			expect(
				(await membersOf(admin.api, office.id)).map((m) => m.user.email),
				"Cancel keeps the agent in the office",
			).toContain(agent.email);

			// Remove: in that one step, the row leaves Team and the account is gone (ADR 0013).
			await chooseRemove(page, agent.email);
			await expect(ask.dialog).toBeVisible();
			await ask.confirm.click();
			await expect(ask.dialog).toHaveCount(0);
			await expect(row, "the removed agent's row leaves Team").toHaveCount(0);
			await page.reload();
			await expect(team(page).member(manager.email)).toBeVisible();
			await expect(row, "and stays gone after a reload").toHaveCount(0);
			expect(
				(await membersOf(admin.api, office.id)).map((m) => m.user.email),
				"the agent is no longer in the office",
			).not.toContain(agent.email);
			await admin.expectNoAccount(agent.email);
		} finally {
			await close();
		}
	});
});

/** The platform admin's role in the office, read through their own view of it; none once they can't read it. */
async function platformAdminRoleIn(admin: Admin, officeId: string): Promise<string | undefined> {
	const res = await admin.api.get("/api/auth/organization/get-full-organization", {
		organizationId: officeId,
	});
	if (!res.ok()) {
		return undefined;
	}
	const { members } = (await res.json()) as { members: Member[] };
	return members.find((m) => m.user.email === PLATFORM_ADMIN.email)?.role;
}

// scenario: docs/e2e-scenarios.md Team 5
test.describe("Team 5 — the platform admin's membership is theirs alone", () => {
	test("a kit-owner manager and a kit-admin manager can neither change nor remove the platform admin's membership", async ({
		browser,
		admin,
	}) => {
		test.slow();
		// Created by the platform admin: their inert kit `owner` membership is in it.
		const office = await admin.createOffice("Team 5");
		const [ownerManager, adminManager] = await Promise.all([
			joinOffice(admin, browser, office.id, "owner", "team5-owner"),
			joinOffice(admin, browser, office.id, "admin", "team5-admin"),
		]);
		try {
			const self = (await membersOf(admin.api, office.id)).find(
				(m) => m.user.email === PLATFORM_ADMIN.email,
			);
			expect(self?.role, "the platform admin, who created the office, is its kit owner").toBe(
				"owner",
			);
			const memberId = self!.id;
			const owner = { who: "kit-owner manager", api: ownerManager.api };
			const kitAdmin = { who: "kit-admin manager", api: adminManager.api };
			const changeRole = (role: "admin" | "member") => ({
				what: `change the platform admin's role to ${role}`,
				ask: (api: Api) =>
					api.post("/api/auth/organization/update-member-role", {
						memberId,
						role,
						organizationId: office.id,
					}),
			});
			// The same role change with a stray `memberIdOrEmail` beside the real `memberId` (a
			// field the kit ignores here): the refusal reads the field the kit acts on.
			const changeRoleWithDecoy = (decoy: string | number) => ({
				what: `change the platform admin's role to member, with a stray memberIdOrEmail ${JSON.stringify(decoy)}`,
				ask: (api: Api) =>
					api.post("/api/auth/organization/update-member-role", {
						memberId,
						memberIdOrEmail: decoy,
						role: "member",
						organizationId: office.id,
					}),
			});
			const remove = (by: "member id" | "email") => ({
				what: `remove the platform admin by ${by}`,
				ask: (api: Api) =>
					api.post("/api/auth/organization/remove-member", {
						memberIdOrEmail: by === "email" ? PLATFORM_ADMIN.email : memberId,
						organizationId: office.id,
					}),
			});
			// Role changes first, removals last, the kit owner's last of all: a removal taken in a
			// red run leaves nothing for the asks after it to remove.
			const asks = [
				{ ...owner, ...changeRoleWithDecoy("someone") },
				{ ...owner, ...changeRoleWithDecoy(1) },
				{ ...owner, ...changeRole("admin") },
				{ ...kitAdmin, ...changeRole("admin") },
				{ ...owner, ...changeRole("member") },
				{ ...kitAdmin, ...changeRole("member") },
				{ ...kitAdmin, ...remove("member id") },
				{ ...kitAdmin, ...remove("email") },
				{ ...owner, ...remove("email") },
				{ ...owner, ...remove("member id") },
			];

			// Each ask's answer, and the platform admin's role right after it, side by side.
			const answered: Record<string, { status: number; platformAdminRole?: string }> = {};
			const refused: typeof answered = {};
			for (const { who, api, what, ask } of asks) {
				const label = `${who}: ${what}`;
				const status = (await ask(api)).status();
				answered[label] = {
					status,
					platformAdminRole: await platformAdminRoleIn(admin, office.id),
				};
				refused[label] = { status: 403, platformAdminRole: "owner" };
			}
			expect(
				answered,
				"every ask is refused (403), and the platform admin is still in the office, as owner",
			).toEqual(refused);
		} finally {
			await ownerManager.close();
			await adminManager.close();
		}
	});
});

// scenario: docs/e2e-scenarios.md Team 6
test.describe("Team 6 — the platform admin never reaches a manager's browser", () => {
	test("the platform admin's own view of the office lists them as Platform admin, not Manager", async ({
		admin,
	}) => {
		const page = await admin.openPage();
		const t = team(page);
		for (const locale of ["en", "vi"] as const) {
			await page.goto(`/${locale}/admin/organizations/${DEMO_OFFICE_ID}`);
			const own = t.member(PLATFORM_ADMIN.email);
			await expect(own, `(${locale}) the admin area lists the platform admin`).toBeVisible();
			await expect
				.soft(t.memberRole(own), `(${locale}) their own row's role`)
				.toHaveText(PLATFORM_ADMIN_ROLE[locale]);
		}
	});
});

/** A thread's owner as the inbox's API gives it; null while it is Unassigned. */
type ThreadOwner = { id: string; name: string } | null;

/** The thread's owner, as `api` opens it. */
async function ownerOf(api: Api, threadId: string): Promise<ThreadOwner> {
	const res = await api.get(`/api/conversations/${encodeURIComponent(threadId)}`);
	expect(res.status(), "the manager opens the thread").toBe(200);
	return ((await res.json()) as { owner: ThreadOwner }).owner;
}

// scenario: docs/e2e-scenarios.md Team 7
test.describe("Team 7 — no thread goes to the platform admin", () => {
	test("the manager giving a thread to the platform admin answers 400, and the thread's owner is unchanged", async ({
		admin,
	}) => {
		const self = (await membersOf(admin.api, DEMO_OFFICE_ID)).find(
			(m) => m.user.email === PLATFORM_ADMIN.email,
		);
		expect(self?.userId, "the platform admin's view of the office lists them").toBeTruthy();

		const manager = await apiAs(MANAGER);
		try {
			const listed = await manager.get("/api/conversations");
			expect(listed.status(), "the manager lists the office's threads").toBe(200);
			const threads = (await listed.json()) as { id: string }[];
			expect(threads.length, "the walk office has threads").toBeGreaterThan(0);
			// A thread an agent owns (the seed's Minji and Yuki): putting it back is a plain assignment.
			let threadId = threads[0].id;
			let before = await ownerOf(manager, threadId);
			for (const { id } of threads) {
				const owner = await ownerOf(manager, id);
				if (owner) {
					[threadId, before] = [id, owner];
					break;
				}
			}
			const assign = (ownerId: string | null) =>
				manager.post(`/api/conversations/${encodeURIComponent(threadId)}/owner`, { ownerId });

			try {
				const res = await assign(self!.userId);
				expect.soft(res.status(), "giving the thread to the platform admin").toBe(400);
				expect(await ownerOf(manager, threadId), "the thread's owner is unchanged").toEqual(before);
			} finally {
				// A red run may have taken the assignment: put the owner back.
				if ((await ownerOf(manager, threadId))?.id !== before?.id) {
					const back = await assign(before?.id ?? null);
					expect(back.status(), "the original owner is put back").toBe(200);
				}
			}
		} finally {
			await manager.dispose();
		}
	});
});
