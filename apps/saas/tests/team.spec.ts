import type { Browser, Locator, Page } from "@playwright/test";

import type { Admin } from "./support/fixtures";
import { expect, test } from "./support/fixtures";
import { openInboxAsNewAccount, signUpByInvitationLink } from "./support/invitee";
import type { Office } from "./support/offices";
import { AGENT, AGENT_2, MANAGER, PLATFORM_ADMIN, WALK_OFFICE_ID } from "./support/seed";
import type { Api } from "./support/session";
import { clientIpHeaders, withOrigin } from "./support/session";
import { signInContext } from "./support/session-state";

/** Team's words (docs/e2e-scenarios.md "Team"): Nhịp's roles, never member, admin or owner. */
const COPY = {
	en: { team: "Team", agent: "Agent", manager: "Manager", logOut: "Log out" },
	vi: { team: "Nhóm", agent: "Nhân viên", manager: "Quản lý", logOut: "Đăng xuất" },
} as const;

/** The kit's success toast for an invitation, in Nhịp's words. */
const INVITATION_SENT = "Invitation sent";

type KitRole = "member" | "admin" | "owner";
type Member = { id: string; role: string; user: { email: string } };
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

function teamItem(page: Page, locale: keyof typeof COPY = "en") {
	return page.getByRole("menuitem", { name: COPY[locale].team, exact: true });
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
 * A newcomer invited into an office by the platform admin, signed up through the invitation
 * link in a browser context of their own (its own client IP: sign-ups are rate limited).
 */
async function newcomer(
	browser: Browser,
	admin: Admin,
	office: Office,
	tag: string,
	role: KitRole,
	ownerInvitations: string[],
) {
	const email = admin.newEmail(tag);
	let invitationId: string;
	if (role === "owner") {
		// The fixture's invite knows agents and managers only; an owner is setup here.
		const res = await admin.api.post("/api/auth/organization/invite-member", {
			email,
			role,
			organizationId: office.id,
		});
		expect(res.ok(), `the platform admin invites an owner: ${await res.text()}`).toBe(true);
		invitationId = ((await res.json()) as { id: string }).id;
		ownerInvitations.push(invitationId);
	} else {
		invitationId = await admin.invite(email, office.id, role);
	}
	const context = await browser.newContext({ extraHTTPHeaders: clientIpHeaders(tag) });
	const page = await context.newPage();
	await signUpByInvitationLink(page, invitationId, email);
	return { email, page, api: withOrigin(page.request), close: () => context.close() };
}

/** Asks, as `api`, to invite `email` into the office with `role`; returns the answer's status. */
async function tryInvite(api: Api, officeId: string, email: string, role: KitRole) {
	const res = await api.post("/api/auth/organization/invite-member", {
		email,
		role,
		organizationId: officeId,
	});
	return res.status();
}

/**
 * The manager (kit admin or owner) asking to make an owner: inviting with role `owner`, and
 * changing an agent's role to `owner`. Both are refused, nothing is invited, the role stays.
 */
async function expectNoOwnerFrom(
	manager: Api,
	admin: Admin,
	office: Office,
	agentEmail: string,
	who: string,
) {
	const invitee = admin.newEmail(`owner-by-${who}`);
	expect
		.soft(await tryInvite(manager, office.id, invitee, "owner"), `${who}: invite as owner`)
		.toBe(403);
	expect
		.soft(await pendingInvitationsTo(admin.api, office.id, invitee), `${who}: no invitation made`)
		.toEqual([]);
	await cancelInvitationsTo(admin, office.id, [invitee]);

	const agentMember = (await membersOf(admin.api, office.id)).find(
		(m) => m.user.email === agentEmail,
	);
	expect(agentMember, "the agent is a member of the office").toBeDefined();
	const changed = await manager.post("/api/auth/organization/update-member-role", {
		memberId: agentMember?.id,
		role: "owner",
		organizationId: office.id,
	});
	expect.soft(changed.status(), `${who}: change an agent's role to owner`).toBe(403);
	const after = (await membersOf(admin.api, office.id)).find((m) => m.user.email === agentEmail);
	expect.soft(after?.role, `${who}: the agent's role is unchanged`).toBe("member");
}

// scenario: docs/e2e-scenarios.md Team 1
test.describe("Team 1 — a manager invites an agent from Team", () => {
	test("the manager's user menu has Team, and it opens the office's Team page", async ({
		page,
		context,
	}) => {
		await signInContext(context, MANAGER);
		await page.goto("/en/inbox");

		await openUserMenu(page);
		await expect(teamItem(page)).toBeVisible();
		await teamItem(page).click();

		await expect(page).toHaveURL(/\/en\/walk\/settings\/members$/);
		await expect(team(page).heading(COPY.en.team)).toBeVisible();
	});

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
			await page.goto("/en/walk/settings/members");
			await expect(t.heading(COPY.en.team)).toBeVisible();

			// The role offers exactly Agent and Manager, with Agent chosen; no Owner.
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
			const [agentInvite] = await pendingInvitationsTo(admin.api, WALK_OFFICE_ID, asAgent);
			const [managerInvite] = await pendingInvitationsTo(admin.api, WALK_OFFICE_ID, asManager);
			expect.soft(agentInvite?.role, "Agent is the kit's member").toBe("member");
			expect.soft(managerInvite?.role, "Manager is the kit's admin").toBe("admin");
		} finally {
			await cancelInvitationsTo(admin, WALK_OFFICE_ID, [asAgent, asManager]);
		}
	});

	test("in Vietnamese the menu item, the title and the roles are Nhóm, Nhân viên and Quản lý", async ({
		page,
		context,
	}) => {
		await signInContext(context, MANAGER);
		const t = team(page);

		await page.goto("/vi/inbox");
		await openUserMenu(page);
		await expect.soft(teamItem(page, "vi")).toBeVisible();
		await page.keyboard.press("Escape");

		await page.goto("/vi/walk/settings/members");
		await expect.soft(t.heading(COPY.vi.team)).toBeVisible();
		await expect(t.inviteRole).toHaveText(COPY.vi.agent);
		await t.inviteRole.click();
		await expect(t.options).toHaveText([COPY.vi.agent, COPY.vi.manager]);
	});
});

// scenario: docs/e2e-scenarios.md Team 2
test.describe("Team 2 — an agent has no Team", () => {
	test("the agent's user menu has no Team, and Team's address is not found", async ({
		page,
		context,
	}) => {
		await signInContext(context, AGENT);
		await page.goto("/en/inbox");

		await openUserMenu(page);
		await expect(page.getByRole("menuitem", { name: COPY.en.logOut })).toBeVisible();
		await expect.soft(teamItem(page), "no Team in the agent's menu").toHaveCount(0);
		await page.keyboard.press("Escape");

		const res = await page.goto("/en/walk/settings/members");
		expect.soft(res?.status(), "Team's address answers 404 for an agent").toBe(404);
		await expect.soft(page.getByText("Page not found")).toBeVisible();
		// No member list, no invite form.
		await expect.soft(page.getByText(MANAGER.email)).toHaveCount(0);
		await expect.soft(page.getByText(AGENT_2.email)).toHaveCount(0);
		await expect.soft(team(page).inviteEmail).toHaveCount(0);
		await expect.soft(page.getByRole("button", { name: "Invite" })).toHaveCount(0);
	});

	test("the platform admin's user menu has no Team either", async ({ admin }) => {
		const { page } = admin;
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
		const owners: string[] = [];
		const [agent, colleague] = await Promise.all([
			newcomer(browser, admin, office, "team2-agent", "member", owners),
			newcomer(browser, admin, office, "team2-colleague", "member", owners),
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
test.describe("Team 3 — no owner, no Leave, no platform admin on Team", () => {
	test("the manager's Team lists managers and agents only, with no Leave or menu on their own row", async ({
		page,
		context,
	}) => {
		// Many independent checks, each waiting its own timeout when it fails.
		test.slow();
		await signInContext(context, MANAGER);
		const t = team(page);
		await page.goto("/en/walk/settings/members");

		// The list is rendered: the manager's own row, as Manager.
		await expect(page.getByText(MANAGER.email)).toBeVisible();
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

	test("a manager (the kit's admin) can't make an owner, by invitation or by role change", async ({
		browser,
		admin,
	}) => {
		test.slow();
		const office = await admin.createOffice("Team 3 admin");
		const owners: string[] = [];
		const [manager, agent] = await Promise.all([
			newcomer(browser, admin, office, "team3-manager", "admin", owners),
			newcomer(browser, admin, office, "team3-agent", "member", owners),
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
		const owners: string[] = [];
		try {
			const [manager, agent] = await Promise.all([
				newcomer(browser, admin, office, "team3-owner", "owner", owners),
				newcomer(browser, admin, office, "team3-owner-agent", "member", owners),
			]);
			try {
				// Team as any manager sees it (before any owner grant is tried).
				const { page } = manager;
				const t = team(page);
				await openInboxAsNewAccount(page);
				await openUserMenu(page);
				await expect.soft(teamItem(page)).toBeVisible();
				await page.keyboard.press("Escape");

				await page.goto(`/en/${await slugOf(admin.api, office.id)}/settings/members`);
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
		} finally {
			for (const invitationId of owners) {
				await admin.cancelInvitation(invitationId);
			}
		}
	});
});
