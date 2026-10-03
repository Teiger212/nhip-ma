import { createHash, randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import type { APIRequestContext, Browser, Page } from "@playwright/test";

import type { MockCrmLead } from "./support/crm";
import { connectMockCrm, mockCrmLeads } from "./support/crm";
import type { Admin } from "./support/fixtures";
import { expect, test as base } from "./support/fixtures";
import { openInboxAsNewAccount, signUpByInvitationLink } from "./support/invitee";
import { connectZaloOa, releaseZaloOa } from "./support/pipes";
import type { Api } from "./support/session";
import { appOrigin, clientIpHeaders, withOrigin } from "./support/session";

/**
 * The thread header's CRM status (inbox.crm) and the platform admin's CRM setting on an office's
 * Connections card (admin.connections.crm), from packages/i18n/translations/en/saas.json.
 */
const crmCopy = (() => {
	const file = path.resolve(__dirname, "../../../packages/i18n/translations/en/saas.json");
	const saas = JSON.parse(fs.readFileSync(file, "utf8")) as {
		inbox: { crm: { inCrm: string } };
		admin: {
			connections: { crm: { label: string; none: string; mock: string; saved: string } };
		};
	};
	return {
		inCrm: (name: string) => saas.inbox.crm.inCrm.replaceAll("{name}", name),
		setting: saas.admin.connections.crm,
	};
})();

/** A guest of this test, writing on Zalo to one office's OA. */
type Guest = {
	/** Zalo's id for the guest. */
	id: string;
	/** Every text the guest sent, in order. */
	texts: string[];
	/** The guest writes (again); resolves with the text. */
	write: (text?: string) => Promise<string>;
};

/** An operator of an office, signed in in a browser of their own, on their Inbox. */
type Operator = { page: Page; api: Api };

/** An office of the test's own, with a Zalo OA of its own. */
type TestOffice = {
	id: string;
	name: string;
	/** A new guest writes to the office for the first time. */
	newGuest: () => Promise<Guest>;
	/** The office's invited agent (only when asked for). */
	agent: Operator;
	/** The office's invited manager (only when asked for). */
	manager: Operator;
};

/**
 * `newOffice` makes an office of the test's own (the platform admin creates it; it is deleted
 * afterwards), on the mock CRM or on none, with a Zalo OA of its own (released afterwards, even
 * when the test failed) and, when asked, an agent and a manager who joined it through the
 * invitation link. No other spec writes to it, so its leads are this test's leads only.
 */
const test = base.extend<{
	newOffice: (
		label: string,
		options: { crm: "mock" | "none"; agent?: boolean; manager?: boolean },
	) => Promise<TestOffice>;
}>({
	newOffice: async ({ admin, browser, request }, use) => {
		const oaIds: string[] = [];
		const contexts: { close: () => Promise<void> }[] = [];
		await use(async (label, { crm, agent = true, manager = false }) => {
			const office = await admin.createOffice(label);
			if (crm === "mock") {
				connectMockCrm(office.id);
			}
			const oaId = uniqueId("oa");
			oaIds.push(oaId);
			connectZaloOa(office.id, oaId);
			const join = async (role: "member" | "admin") => {
				const newcomer = await newOperatorOf(admin, browser, office.id, role);
				contexts.push(newcomer);
				return newcomer;
			};
			const joinedAgent = agent ? await join("member") : undefined;
			const joinedManager = manager ? await join("admin") : undefined;
			return {
				...office,
				newGuest: async () => {
					const id = uniqueId("guest");
					const guest: Guest = {
						id,
						texts: [],
						write: async (text = `Hello from ${id}, ${randomUUID().slice(0, 8)}`) => {
							await zaloWebhook(request, { from: id, to: oaId, text });
							guest.texts.push(text);
							return text;
						},
					};
					await guest.write();
					return guest;
				},
				get agent(): Operator {
					if (!joinedAgent) throw new Error(`${label} was made without an agent`);
					return joinedAgent;
				},
				get manager(): Operator {
					if (!joinedManager) throw new Error(`${label} was made without a manager`);
					return joinedManager;
				},
			};
		});
		for (const context of contexts) {
			await context.close();
		}
		for (const oaId of oaIds) {
			releaseZaloOa(oaId);
		}
	},
});

/** A vendor id (OA, guest) no other test, repeat or earlier run uses. */
function uniqueId(kind: string): string {
	return `e2e-crm-${kind}-${randomUUID()}`;
}

/** A guest's text as Zalo sends and signs it (the E2E env's app and secret). */
async function zaloWebhook(
	request: APIRequestContext,
	message: { from: string; to: string; text: string },
) {
	const appId = process.env.ZALO_APP_ID;
	const secret = process.env.ZALO_OA_SECRET_KEY;
	if (!appId || !secret)
		throw new Error("ZALO_APP_ID and ZALO_OA_SECRET_KEY come from the E2E env");
	const timestamp = String(Date.now());
	const body = JSON.stringify({
		app_id: appId,
		event_name: "user_send_text",
		timestamp,
		sender: { id: message.from },
		recipient: { id: message.to },
		message: { text: message.text, msg_id: randomUUID() },
	});
	const mac = createHash("sha256")
		.update(appId + body + timestamp + secret)
		.digest("hex");
	const res = await request.post("/webhooks/zalo", {
		data: body,
		headers: { "content-type": "application/json", "X-ZEvent-Signature": `mac=${mac}` },
	});
	expect(res.ok(), `the Zalo webhook is taken (${res.status()})`).toBe(true);
}

/**
 * A newly joined operator of `officeId`, signed up through the invitation link, on their Inbox:
 * an agent (the kit's `member`) or a manager (the kit's `admin`).
 */
async function newOperatorOf(
	admin: Admin,
	browser: Browser,
	officeId: string,
	role: "member" | "admin",
) {
	const email = admin.newEmail(role === "admin" ? "crm-manager" : "crm-agent");
	const invitationId = await admin.invite(email, officeId, role);
	const context = await browser.newContext({ extraHTTPHeaders: clientIpHeaders(email) });
	const page = await context.newPage();
	await signUpByInvitationLink(page, invitationId, email);
	await openInboxAsNewAccount(page);
	return { page, api: withOrigin(context.request), close: () => context.close() };
}

/**
 * The name the guest goes by: the one the operator sees, which is the pipe's name for the guest
 * or, without one, their id. Zalo's webhook carries no name, so a Zalo guest goes by their Zalo
 * id (as the Inbox lists them, Pool 1), in the CRM status and in the lead alike.
 */
function nameOf(guest: Guest): string {
	return guest.id;
}

/* ---------------------------------------------------------------- what a person sees */

/** The thread list (not the open thread). */
function threadList(page: Page) {
	return page.getByRole("complementary");
}

/** The open thread, its header included. */
function openThread(page: Page) {
	return page.getByRole("article");
}

/** The agent opens the Inbox and, in it, the guest's thread (their first message showing). */
async function openThreadOf(page: Page, guest: Guest) {
	await page.goto("/en/inbox");
	const row = threadList(page).getByRole("button", { name: new RegExp(`^${nameOf(guest)}\\b`) });
	await expect(row, `the agent has ${guest.id}'s thread`).toBeVisible();
	await row.click();
	await expect(openThread(page).getByText(guest.texts[0], { exact: true })).toBeVisible();
}

/** The guest's thread id, as the agent's conversations API lists it. */
async function threadIdOf(api: Api, guest: Guest): Promise<string> {
	const res = await api.get("/api/conversations");
	expect(res.status()).toBe(200);
	const thread = ((await res.json()) as { id: string; guestId: string }[]).find(
		(t) => t.guestId === guest.id,
	);
	expect(thread, `${guest.id} is listed`).toBeDefined();
	return thread!.id;
}

/* ---------------------------------------------------------------- in the CRM itself */

function leadsOf(officeId: string, guest: Guest): MockCrmLead[] {
	return mockCrmLeads(officeId).filter((lead) => lead.zaloUserId === guest.id);
}

/**
 * Waits until the office's CRM holds a lead for the guest. Leads are written after the webhook
 * answers, so this is also the sign that the office's background work has caught up.
 */
async function expectLeadAppears(officeId: string, guest: Guest, message: string) {
	await expect
		.poll(() => leadsOf(officeId, guest).length, { message, timeout: 30_000 })
		.toBeGreaterThan(0);
}

/**
 * The agent opens the guest's thread until its header says the guest is in the CRM, by name.
 * The lead is written in the background, after the guest's message is taken.
 */
async function expectInCrmOnThread(page: Page, guest: Guest) {
	await expect(async () => {
		await openThreadOf(page, guest);
		await expect(
			openThread(page).getByText(crmCopy.inCrm(nameOf(guest)), { exact: true }),
			"the thread header says the guest is in the CRM",
		).toBeVisible({ timeout: 3_000 });
	}, "the thread header says In CRM: <the guest's name>").toPass({ timeout: 45_000 });
}

/* ---------------------------------------------------------------- the office's CRM setting */

/** The platform admin's CRM setting, on the office's Connections card (Admin → Organizations). */
async function openCrmSetting(admin: Admin, officeId: string) {
	const { page } = admin;
	await page.goto(`/en/admin/organizations/${officeId}`);
	const card = page.getByTestId("office-connections");
	await expect(card, "the platform admin sees the office's Connections card").toBeVisible();
	const kind = card.getByTestId("connection-crm").getByTestId("crm-kind");
	await expect(kind, "the office's Connections card has a CRM setting").toBeVisible();
	await expect(kind, "the setting is the office's CRM").toHaveAccessibleName(crmCopy.setting.label);
	/**
	 * The setting shows this choice as the office's CRM, and not the other one. The trigger also
	 * holds its dropdown arrow, so the choice is judged within its text, not as all of it.
	 */
	const shows = async (choice: "none" | "mock", message?: string) => {
		const other = choice === "none" ? "mock" : "none";
		await expect(kind, message).toContainText(crmCopy.setting[choice]);
		await expect(kind, message).not.toContainText(crmCopy.setting[other]);
	};
	return {
		shows,
		/** The admin chooses the office's CRM; it saves at once. */
		choose: async (choice: "none" | "mock") => {
			await kind.click();
			await page.getByRole("option", { name: crmCopy.setting[choice], exact: true }).click();
			await expect(
				page.getByText(crmCopy.setting.saved, { exact: true }),
				"CRM saved.",
			).toBeVisible();
			await shows(choice);
		},
	};
}

/** The office's CRM through the API behind the setting. */
const crmConnection = {
	address: (officeId: string) => `/api/crm/connection?officeId=${encodeURIComponent(officeId)}`,
	/** Sets it, sent as the app's own calls are (with the Origin), so a refusal is about who asks. */
	put: (request: APIRequestContext, officeId: string, kind: "mock" | null) =>
		request.put("/api/crm/connection", {
			data: { officeId, kind },
			headers: { origin: appOrigin() },
			maxRedirects: 0,
		}),
};

// ---------------------------------------------------------------------------------------

// scenario: docs/e2e-scenarios.md CRM 1
test.describe("CRM 1 — a new guest becomes a lead in the CRM", () => {
	test("on the mock CRM: the thread header says In CRM with the guest's name to the agent and the manager, and the CRM holds one lead with their Zalo id, pipe and thread link, and no message text, even after they write again", async ({
		newOffice,
	}) => {
		test.setTimeout(150_000);
		const office = await newOffice("CRM 1 mock", { crm: "mock", manager: true });
		const { page, api } = office.agent;

		const guest = await office.newGuest();

		// The agent opens the thread: its header says the guest is in the CRM, by name. The lead
		// is written in the background, so the agent opens it again until it shows.
		await expect(async () => {
			await openThreadOf(page, guest);
			await expect(
				openThread(page).getByText(crmCopy.inCrm(nameOf(guest)), { exact: true }),
				"the thread header says the guest is in the CRM",
			).toBeVisible({ timeout: 3_000 });
		}, "the thread header says In CRM: <the guest's name>").toPass({ timeout: 45_000 });

		// The manager sees it too, on the same thread.
		const manager = office.manager.page;
		await openThreadOf(manager, guest);
		await expect(
			manager.getByTestId("owner-filter"),
			"they are the office's manager (only a manager filters by owner, Pool 9)",
		).toBeVisible();
		await expect(
			openThread(manager).getByText(crmCopy.inCrm(nameOf(guest)), { exact: true }),
			"the manager's thread header says the guest is in the CRM",
		).toBeVisible();

		// In the CRM: exactly one lead for the guest, theirs, linked to the thread, with no
		// message text in it.
		const threadId = await threadIdOf(api, guest);
		const [lead, ...more] = leadsOf(office.id, guest);
		expect(lead, "the CRM holds a lead for the guest").toBeDefined();
		expect(more, "and only one").toHaveLength(0);
		expect(lead.name, "the lead carries the guest's name").toBe(nameOf(guest));
		expect(lead.zaloUserId, "the lead carries the guest's Zalo user id").toBe(guest.id);
		expect(lead.pipe, "the lead says the guest came on Zalo").toBe("zalo");
		const link = new URL(lead.threadUrl);
		expect(link.pathname, "the lead links to the Inbox").toMatch(/^(\/(en|vi))?\/inbox\/?$/);
		expect(link.searchParams.get("thread"), "the link names the guest's thread").toBe(threadId);
		for (const text of guest.texts) {
			expect(JSON.stringify(lead), "no message text in the lead").not.toContain(text);
		}

		// The link opens the guest's thread.
		await page.goto(lead.threadUrl);
		await expect(
			openThread(page).getByText(guest.texts[0], { exact: true }),
			"the lead's link opens the guest's thread",
		).toBeVisible();

		// The guest writes again; once a later guest's lead is in (the office's background work
		// has caught up), the first guest still has exactly one lead, still without message text.
		await guest.write(`Is it still available? ${randomUUID().slice(0, 8)}`);
		const later = await office.newGuest();
		await expectLeadAppears(office.id, later, "a later guest's lead arrives in the CRM");
		const leads = leadsOf(office.id, guest);
		expect(leads, "the guest writing again makes no second lead").toHaveLength(1);
		expect(leads[0].id, "it is the same lead").toBe(lead.id);
		for (const text of guest.texts) {
			expect(JSON.stringify(leads[0]), "no message text in the lead").not.toContain(text);
		}
		expect(
			mockCrmLeads(office.id).map((l) => l.zaloUserId),
			"the office's CRM holds one lead per guest",
		).toEqual([guest.id, later.id]);
	});

	test("with no CRM: a new guest's thread header says nothing about a CRM, and no lead is made", async ({
		newOffice,
	}) => {
		test.setTimeout(150_000);
		const office = await newOffice("CRM 1 none", { crm: "none" });
		// A second office, on the mock CRM, only as a clock: once its guest's lead is in, lead
		// writing has had its chance for the guest who wrote to the office with no CRM before it.
		const clock = await newOffice("CRM 1 clock", { crm: "mock", agent: false });
		const { page } = office.agent;

		const guest = await office.newGuest();
		const clockGuest = await clock.newGuest();
		await expectLeadAppears(
			clock.id,
			clockGuest,
			"lead writing ran: the guest of an office on the mock CRM became a lead",
		);

		await openThreadOf(page, guest);
		await expect(
			openThread(page).getByText(/\bCRM\b/),
			"the thread header says nothing about a CRM",
		).toHaveCount(0);
		await expect(openThread(page).getByTestId("crm-status"), "no CRM status at all").toHaveCount(0);
		expect(mockCrmLeads(office.id), "no lead is made for an office with no CRM").toEqual([]);
	});
});

// scenario: docs/e2e-scenarios.md CRM 2
test.describe("CRM 2 — the admin sets an office's CRM", () => {
	test("the platform admin chooses Mock on the office's Connections card: it is saved, and a new guest becomes a lead the agent sees In CRM", async ({
		admin,
		newOffice,
	}) => {
		test.setTimeout(150_000);
		// An office on no CRM: only the admin's setting puts it on the mock CRM.
		const office = await newOffice("CRM 2 mock", { crm: "none" });

		const setting = await openCrmSetting(admin, office.id);
		await setting.shows("none", "a new office has no CRM");
		await setting.choose("mock");

		// It stays chosen.
		const reopened = await openCrmSetting(admin, office.id);
		await reopened.shows("mock", "the office's CRM is saved as Mock");

		// A new guest writes: they become a lead in the mock CRM, and the agent sees it.
		const guest = await office.newGuest();
		await expectInCrmOnThread(office.agent.page, guest);
		const leads = leadsOf(office.id, guest);
		expect(leads, "the office's CRM holds one lead for the guest").toHaveLength(1);
		expect(leads[0].name, "the lead carries the guest's name").toBe(nameOf(guest));
	});

	test("choosing None takes the thread's In CRM status away", async ({ admin, newOffice }) => {
		test.setTimeout(150_000);
		const office = await newOffice("CRM 2 none", { crm: "none" });
		const { page } = office.agent;

		// On the mock CRM through the setting, a new guest's thread is In CRM.
		await (await openCrmSetting(admin, office.id)).choose("mock");
		const guest = await office.newGuest();
		await expectInCrmOnThread(page, guest);

		// The admin chooses None (a fresh page, so the earlier "CRM saved." is gone).
		await (await openCrmSetting(admin, office.id)).choose("none");
		const reopened = await openCrmSetting(admin, office.id);
		await reopened.shows("none", "the office's CRM is saved as None");

		// The agent opens the thread afresh: nothing about a CRM in it any more.
		await openThreadOf(page, guest);
		await expect(
			openThread(page).getByText(crmCopy.inCrm(nameOf(guest)), { exact: true }),
			"the thread no longer says the guest is in the CRM",
		).toHaveCount(0);
		await expect(openThread(page).getByTestId("crm-status"), "no CRM status at all").toHaveCount(0);
	});

	test("a non-admin is refused: the office's agent and manager find no CRM setting, the API answers them 403 and anyone signed out 401, and the office's CRM stays None", async ({
		admin,
		newOffice,
		request,
	}) => {
		test.setTimeout(150_000);
		const office = await newOffice("CRM 2 refused", { crm: "none", manager: true });
		const address = crmConnection.address(office.id);

		// The platform admin has the setting, and the API answers them: the office has no CRM.
		const setting = await openCrmSetting(admin, office.id);
		await setting.shows("none", "the office has no CRM");
		const asAdmin = await admin.api.get(address);
		expect(asAdmin.status(), "the platform admin reads the office's CRM").toBe(200);
		expect(await asAdmin.json()).toEqual({ kind: null });

		// The office's own agent and manager: no Connections, no CRM setting, and the API refuses.
		for (const [who, operator] of [
			["the agent", office.agent],
			["the manager", office.manager],
		] as const) {
			const { page } = operator;
			await page.goto(`/en/admin/organizations/${office.id}`);
			// Judge on a rendered page, not an empty one.
			await expect(page.getByRole("main")).toBeVisible();
			await expect(
				page.getByTestId("office-connections"),
				`${who} sees no Connections`,
			).toHaveCount(0);
			await expect(page.getByTestId("crm-kind"), `${who} sees no CRM setting`).toHaveCount(0);

			const read = await page.request.get(address, { maxRedirects: 0 });
			expect(read.status(), `${who} cannot read the office's CRM`).toBe(403);
			const write = await crmConnection.put(page.request, office.id, "mock");
			expect(write.status(), `${who} cannot set the office's CRM`).toBe(403);
		}

		// Signed out: refused too.
		const signedOutRead = await request.get(address, { maxRedirects: 0 });
		expect(signedOutRead.status(), "nobody signed in cannot read it").toBe(401);
		const signedOutWrite = await crmConnection.put(request, office.id, "mock");
		expect(signedOutWrite.status(), "nobody signed in cannot set it").toBe(401);

		// Nothing changed: the office is still on no CRM.
		const after = await admin.api.get(address);
		expect(await after.json(), "the refused requests changed nothing").toEqual({ kind: null });
		await (await openCrmSetting(admin, office.id)).shows("none", "the admin still sees None");

		// The same request from the platform admin is taken: the refusals were about who asked.
		const byAdmin = await crmConnection.put(admin.page.request, office.id, "mock");
		expect(byAdmin.status(), "the platform admin sets the office's CRM").toBe(200);
		expect(await (await admin.api.get(address)).json()).toEqual({ kind: "mock" });
	});
});
