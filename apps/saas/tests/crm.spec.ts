import { createHash, createHmac, randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import type { APIRequestContext, Browser, Locator, Page } from "@playwright/test";

import type { MockCrmLead } from "./support/crm";
import { connectMockCrm, markInMockCrm, mockCrmLeads } from "./support/crm";
import type { Admin } from "./support/fixtures";
import { expect, test as base } from "./support/fixtures";
import { openInboxAsNewAccount, signUpByInvitationLink } from "./support/invitee";
import { connectZaloOa, releaseZaloOa } from "./support/pipes";
import type { Api } from "./support/session";
import { clientIpHeaders, withOrigin } from "./support/session";

/**
 * The thread's CRM status and turn, as an operator reads them
 * (packages/i18n/translations/en/saas.json, inbox).
 */
const crmCopy = (() => {
	const file = path.resolve(__dirname, "../../../packages/i18n/translations/en/saas.json");
	const saas = JSON.parse(fs.readFileSync(file, "utf8")) as {
		inbox: { yourTurn: string; sent: string; crm: { inCrm: string; won: string; lost: string } };
	};
	return {
		inCrm: (name: string) => saas.inbox.crm.inCrm.replaceAll("{name}", name),
		won: saas.inbox.crm.won,
		lost: saas.inbox.crm.lost,
		yourTurn: saas.inbox.yourTurn,
		sent: saas.inbox.sent,
	};
})();

/**
 * A page learns of a change when it asks again, which the Inbox does about every ten seconds;
 * a change gets three of those rounds to show.
 */
const WITHIN_A_POLL = { timeout: 30_000 };

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

/** The amber number beside Inbox in the sidebar (gone at 0). */
function navCount(page: Page) {
	return page.getByRole("link", { name: /^Inbox\b/ }).getByTestId("nav-your-turn-count");
}

/** A view button of the Inbox (Your turn / Sent / All) with its count. */
function view(page: Page, name: "Your turn" | "Sent" | "All", count: number) {
	return page.getByRole("button", { name: `${name} ${count}`, exact: true });
}

/** A guest's row in the Inbox's thread list, in the view on show. */
function rowOf(page: Page, guest: Guest) {
	return threadList(page).getByRole("button", { name: new RegExp(`^${nameOf(guest)}\\b`) });
}

/** The Inbox's views count these, and the nav's number is its Your turn. */
async function expectQueue(
	page: Page,
	counts: { yourTurn: number; sent: number; all: number },
	options?: { timeout: number },
) {
	await expect(view(page, "Your turn", counts.yourTurn), "the Inbox's Your turn").toBeVisible(
		options,
	);
	await expect(view(page, "Sent", counts.sent), "the Inbox's Sent").toBeVisible(options);
	await expect(view(page, "All", counts.all), "the Inbox's All").toBeVisible(options);
	await expect(navCount(page), "the nav counts Your turn").toHaveText(
		String(counts.yourTurn),
		options,
	);
}

/**
 * On a resolved thread's row, the outcome stands where the turn was: one status badge, saying
 * the outcome, no "Your turn" or "Sent" beside it, and neutral, the tone of the pipe badge on the
 * same row (DESIGN.md, Badges), not the turn's amber or green.
 */
async function expectOutcomeInPlaceOfTheTurn(row: Locator, outcome: string) {
	const status = row.getByTestId("thread-status");
	await expect(status, "one status on the row").toHaveCount(1);
	await expect(status, `the row says ${outcome}`).toHaveText(outcome);
	await expect(row.getByText(crmCopy.yourTurn, { exact: true }), "no Your turn").toHaveCount(0);
	await expect(row.getByText(crmCopy.sent, { exact: true }), "no Sent").toHaveCount(0);
	const pipe = row.getByText("Zalo", { exact: true });
	await expect(pipe, "the row's pipe badge, neutral").toBeVisible();
	expect(await toneOf(status), `${outcome} is neutral, like the pipe badge`).toEqual(
		await toneOf(pipe),
	);
}

async function toneOf(badge: Locator) {
	return badge.evaluate((element) => {
		const style = getComputedStyle(element);
		return { color: style.color, background: style.backgroundColor };
	});
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

/** The guest's lead in the office's CRM, once it is there. */
async function leadOf(officeId: string, guest: Guest): Promise<MockCrmLead> {
	await expectLeadAppears(officeId, guest, `${guest.id} becomes a lead in the CRM`);
	return leadsOf(officeId, guest)[0];
}

/** The office marks the guest's lead in its CRM; the CRM holds it so, and has told Nhịp. */
async function markLead(
	request: APIRequestContext,
	officeId: string,
	guest: Guest,
	lead: MockCrmLead,
	outcome: "won" | "lost",
): Promise<number> {
	const status = await markInMockCrm(request, officeId, lead.id, outcome);
	expect(
		leadsOf(officeId, guest)[0]?.outcome,
		`the CRM holds ${guest.id}'s lead as ${outcome}`,
	).toBe(outcome);
	return status;
}

/** Nhịp took the CRM's notice. */
function expectNoticeTaken(status: number, what: string) {
	expect(status, `Nhịp takes the CRM's notice that ${what} (${status})`).toBeGreaterThanOrEqual(
		200,
	);
	expect(status, `Nhịp takes the CRM's notice that ${what} (${status})`).toBeLessThan(300);
}

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

// scenario: docs/e2e-scenarios.md CRM 3
test.describe("CRM 3 — won or lost leaves the queue, and comes back", () => {
	test("lost: the thread leaves Your turn for Sent with a neutral Lost where the turn was, the nav count drops; the guest writes again and it is back in Your turn, and the CRM telling Nhịp again it is lost does not hide them", async ({
		newOffice,
		request,
	}) => {
		test.setTimeout(240_000);
		const office = await newOffice("CRM 3 lost", { crm: "mock" });
		const { page } = office.agent;

		// Two guests wait on the office's only agent; the second keeps the counts above zero.
		const guest = await office.newGuest();
		const other = await office.newGuest();
		const lead = await leadOf(office.id, guest);
		const otherLead = await leadOf(office.id, other);

		await page.goto("/en/inbox");
		await expectQueue(page, { yourTurn: 2, sent: 0, all: 2 }, WITHIN_A_POLL);
		await expect(rowOf(page, guest), "the guest waits in Your turn").toBeVisible();

		// The office marks the lead lost in its CRM, and the CRM tells Nhịp.
		const lost = await markLead(request, office.id, guest, lead, "lost");

		// The thread leaves Your turn; the nav count drops with it.
		await expect(
			view(page, "Your turn", 1),
			`the lost thread leaves Your turn (the CRM's notice answered ${lost})`,
		).toBeVisible(WITHIN_A_POLL);
		await expectQueue(page, { yourTurn: 1, sent: 1, all: 2 }, WITHIN_A_POLL);
		await expect(rowOf(page, other), "the other guest still waits").toBeVisible();
		await expect(rowOf(page, guest), "the lost guest is not in Your turn").toHaveCount(0);
		expectNoticeTaken(lost, "the lead is lost");

		// Under Sent, with a neutral Lost where the turn was, in the list and the thread header.
		await view(page, "Sent", 1).click();
		const row = rowOf(page, guest);
		await expect(row, "the lost thread is under Sent").toBeVisible();
		await expectOutcomeInPlaceOfTheTurn(row, crmCopy.lost);
		await row.click();
		await expect(openThread(page).getByText(guest.texts[0], { exact: true })).toBeVisible();
		await expect(
			openThread(page).getByTestId("thread-status"),
			"the thread header says Lost",
		).toHaveText(crmCopy.lost);

		// The guest writes again: back in Your turn, the count up again.
		await guest.write(`Is it still available after all? ${randomUUID().slice(0, 8)}`);
		await expectQueue(page, { yourTurn: 2, sent: 0, all: 2 }, WITHIN_A_POLL);
		await view(page, "Your turn", 2).click();
		await expect(
			rowOf(page, guest).getByTestId("thread-status"),
			"the guest who wrote again is Your turn",
		).toHaveText(crmCopy.yourTurn);
		expect(
			leadsOf(office.id, guest)[0].outcome,
			"the CRM still holds the lead as lost: Nhịp does not reopen it",
		).toBe("lost");

		// The CRM tells Nhịp again that the lead is lost (with a newer date of its own): the
		// outcome was already seen before the guest wrote, so the guest stays Your turn. Judged once
		// the other guest's lead, marked won after it, has left Your turn.
		expectNoticeTaken(
			await markLead(request, office.id, guest, lead, "lost"),
			"the lead is lost, again",
		);
		expectNoticeTaken(await markLead(request, office.id, other, otherLead, "won"), "a lead is won");
		await expectQueue(page, { yourTurn: 1, sent: 1, all: 2 }, WITHIN_A_POLL);
		await expect(rowOf(page, other), "the won guest has left Your turn").toHaveCount(0);
		await expect(
			rowOf(page, guest).getByTestId("thread-status"),
			"the guest who wrote after the outcome stays Your turn",
		).toHaveText(crmCopy.yourTurn);
	});

	test("won: the thread leaves Your turn for Sent with a neutral Won where the turn was, in the list and the thread header, and the nav count drops", async ({
		newOffice,
		request,
	}) => {
		test.setTimeout(180_000);
		const office = await newOffice("CRM 3 won", { crm: "mock" });
		const { page } = office.agent;

		const guest = await office.newGuest();
		await office.newGuest();
		const lead = await leadOf(office.id, guest);

		await page.goto("/en/inbox");
		await expectQueue(page, { yourTurn: 2, sent: 0, all: 2 }, WITHIN_A_POLL);
		await expect(rowOf(page, guest), "the guest waits in Your turn").toBeVisible();

		const won = await markLead(request, office.id, guest, lead, "won");

		await expect(
			view(page, "Your turn", 1),
			`the won thread leaves Your turn (the CRM's notice answered ${won})`,
		).toBeVisible(WITHIN_A_POLL);
		await expectQueue(page, { yourTurn: 1, sent: 1, all: 2 }, WITHIN_A_POLL);
		await expect(rowOf(page, guest), "the won guest is not in Your turn").toHaveCount(0);
		expectNoticeTaken(won, "the lead is won");

		await view(page, "Sent", 1).click();
		const row = rowOf(page, guest);
		await expect(row, "the won thread is under Sent").toBeVisible();
		await expectOutcomeInPlaceOfTheTurn(row, crmCopy.won);
		await row.click();
		await expect(openThread(page).getByText(guest.texts[0], { exact: true })).toBeVisible();
		await expect(
			openThread(page).getByTestId("thread-status"),
			"the thread header says Won",
		).toHaveText(crmCopy.won);
	});

	test("a notice signed with the wrong secret, or not signed, is refused", async ({
		newOffice,
		request,
	}) => {
		test.setTimeout(120_000);
		const office = await newOffice("CRM 3 refused", { crm: "mock", agent: false });
		const guest = await office.newGuest();
		const lead = await leadOf(office.id, guest);
		const secret = process.env.MOCK_CRM_WEBHOOK_SECRET;
		if (!secret) throw new Error("MOCK_CRM_WEBHOOK_SECRET comes from the E2E env");

		// A notice naming a real lead of the office, as the mock CRM sends it; only its signature is
		// wrong, or missing.
		const body = JSON.stringify({ officeId: office.id, leadIds: [lead.id] });
		const forged = createHmac("sha256", `${secret}-not-it`).update(body).digest("hex");
		const wrongSecret = await request.post("/webhooks/crm/mock", {
			data: body,
			headers: { "content-type": "application/json", "x-mock-crm-signature": `sha256=${forged}` },
		});
		expect(wrongSecret.status(), "a notice signed with the wrong secret is refused").toBe(401);
		const unsigned = await request.post("/webhooks/crm/mock", {
			data: body,
			headers: { "content-type": "application/json" },
		});
		expect(unsigned.status(), "an unsigned notice is refused").toBe(401);
	});
});
