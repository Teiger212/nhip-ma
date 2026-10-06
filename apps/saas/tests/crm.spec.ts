import { createHash, createHmac, randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import type { APIRequestContext, APIResponse, Locator, Page } from "@playwright/test";

import { assignerAs } from "./support/assign";
import type { MockCrmLead } from "./support/crm";
import {
	bringMockCrmBack,
	connectMockCrm,
	markInMockCrm,
	mockCrmLeads,
	passCrmRetryWait,
	takeMockCrmDown,
} from "./support/crm";
import type { Admin } from "./support/fixtures";
import { expect, test as base } from "./support/fixtures";
import type { Joined } from "./support/operators";
import { joinOffice } from "./support/operators";
import { connectZaloOa, releaseZaloOa } from "./support/pipes";
import type { Api } from "./support/session";
import { appOrigin } from "./support/session";

/**
 * The thread's CRM status and turn, as an operator reads them (inbox), and the platform admin's
 * CRM setting on an office's Connections card (admin.connections.crm), from
 * packages/i18n/translations/en/saas.json.
 */
const crmCopy = (() => {
	const file = path.resolve(__dirname, "../../../packages/i18n/translations/en/saas.json");
	const saas = JSON.parse(fs.readFileSync(file, "utf8")) as {
		inbox: {
			yourTurn: string;
			sent: string;
			crm: { inCrm: string; notInCrmYet: string; won: string; lost: string };
		};
		admin: {
			connections: {
				crm: {
					label: string;
					none: string;
					mock: string;
					saved: string;
					hubspot: string;
					token: string;
					tokenHint: string;
					save: string;
					tokenSet: string;
					tokenRequired: string;
				};
			};
		};
	};
	return {
		inCrm: (name: string) => saas.inbox.crm.inCrm.replaceAll("{name}", name),
		notInCrmYet: saas.inbox.crm.notInCrmYet,
		won: saas.inbox.crm.won,
		lost: saas.inbox.crm.lost,
		yourTurn: saas.inbox.yourTurn,
		sent: saas.inbox.sent,
		setting: saas.admin.connections.crm,
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
type Operator = Joined;

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
	/** The manager gives the guest's thread to the agent (ADR 0022), before the agent acts on it. */
	assignToAgent: (guest: Guest) => Promise<void>;
};

/**
 * `newOffice` makes an office of the test's own (the platform admin creates it; it is deleted
 * afterwards), on the mock CRM or on none, with a Zalo OA of its own (released afterwards, even
 * when the test failed) and, when asked, an agent and a manager who accepted their
 * invitations into it. A new guest waits in Unassigned until the manager assigns them (ADR 0022), so
 * an office whose agent opens or counts a guest asks for a manager too. No other spec writes to
 * it, so its leads are this test's leads only.
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
				await connectMockCrm(office.id);
			}
			const oaId = uniqueId("oa");
			oaIds.push(oaId);
			await connectZaloOa(office.id, oaId);
			const join = async (role: "member" | "admin") => {
				const newcomer = await joinOffice(
					admin,
					browser,
					office.id,
					role,
					role === "admin" ? "crm-manager" : "crm-agent",
				);
				contexts.push(newcomer);
				return newcomer;
			};
			const joinedAgent = agent ? await join("member") : undefined;
			const joinedManager = manager ? await join("admin") : undefined;
			const assigner = joinedManager && assignerAs(joinedManager.api);
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
				assignToAgent: async (guest) => {
					if (!joinedAgent || !assigner) {
						throw new Error(`${label} needs an agent and a manager to assign a guest`);
					}
					await assigner.assignGuestTo(guest.id, joinedAgent.userId);
				},
			};
		});
		for (const context of contexts) {
			await context.close();
		}
		for (const oaId of oaIds) {
			await releaseZaloOa(oaId);
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
 * The name the guest goes by: the one the operator sees, which is the pipe's name for the guest
 * or, without one, their id. Zalo's webhook carries no name, so a Zalo guest goes by their Zalo
 * id (as the Inbox lists them, Assign 1), in the CRM status and in the lead alike.
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

/**
 * The agent opens the Inbox and, in it, the guest's thread (their first message showing). A
 * manager's Inbox opens on Unassigned (ADR 0022), so a manager looks under All.
 */
async function openThreadOf(page: Page, guest: Guest, { all = false } = {}) {
	await page.goto(all ? "/en/inbox?view=all" : "/en/inbox");
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

async function leadsOf(officeId: string, guest: Guest): Promise<MockCrmLead[]> {
	return (await mockCrmLeads(officeId)).filter((lead) => lead.zaloUserId === guest.id);
}

/**
 * Waits until the office's CRM holds a lead for the guest. Leads are written after the webhook
 * answers, so this is also the sign that the office's background work has caught up.
 */
async function expectLeadAppears(officeId: string, guest: Guest, message: string) {
	await expect
		.poll(async () => (await leadsOf(officeId, guest)).length, { message, timeout: 30_000 })
		.toBeGreaterThan(0);
}

/** The guest's lead in the office's CRM, once it is there. */
async function leadOf(officeId: string, guest: Guest): Promise<MockCrmLead> {
	await expectLeadAppears(officeId, guest, `${guest.id} becomes a lead in the CRM`);
	return (await leadsOf(officeId, guest))[0];
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
		(await leadsOf(officeId, guest))[0]?.outcome,
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

/** The open thread's header. */
function threadHeader(page: Page) {
	return openThread(page).locator("header");
}

/** The CRM status in the open thread's header: "In CRM: <name>" or "Not in CRM yet". */
function crmStatus(page: Page) {
	return openThread(page).getByTestId("crm-status");
}

/**
 * The open thread's header says the guest is not in the CRM yet (#211), within a poll, and says
 * it neutrally: the tone of the pipe badge in the same header (DESIGN.md, Badges), never red.
 */
async function expectNotInCrmYet(page: Page, who: string) {
	const status = crmStatus(page);
	await expect(status, `${who}'s thread header says Not in CRM yet`).toHaveText(
		crmCopy.notInCrmYet,
		WITHIN_A_POLL,
	);
	const pipe = threadHeader(page).getByText("Zalo", { exact: true });
	await expect(pipe, "the header's pipe badge, neutral").toBeVisible();
	expect(await toneOf(status), "Not in CRM yet is neutral, like the pipe badge, never red").toEqual(
		await toneOf(pipe),
	);
}

/** The open thread says nothing about a CRM: no status, neither Not in CRM yet nor In CRM. */
async function expectNoCrmStatus(page: Page, who: string, guest: Guest) {
	await expect(crmStatus(page), `${who} sees no CRM status`).toHaveCount(0);
	await expect(
		openThread(page).getByText(crmCopy.notInCrmYet, { exact: true }),
		`${who} sees no Not in CRM yet`,
	).toHaveCount(0);
	await expect(
		openThread(page).getByText(crmCopy.inCrm(nameOf(guest)), { exact: true }),
		`${who} sees no In CRM`,
	).toHaveCount(0);
}

/* ---------------------------------------------------------------- the office's CRM setting */

/** The CRMs the setting offers, by their copy key. */
type CrmChoice = "none" | "mock" | "hubspot";
const CRM_CHOICES: readonly CrmChoice[] = ["none", "mock", "hubspot"];

/** The platform admin's CRM setting, on the office's Connections card (Admin → Organizations). */
async function openCrmSetting(admin: Admin, officeId: string) {
	const { page } = admin;
	await page.goto(`/en/admin/organizations/${officeId}`);
	const card = page.getByTestId("office-connections");
	await expect(card, "the platform admin sees the office's Connections card").toBeVisible();
	const crm = card.getByTestId("connection-crm");
	const kind = crm.getByTestId("crm-kind");
	await expect(kind, "the office's Connections card has a CRM setting").toBeVisible();
	await expect(kind, "the setting is the office's CRM").toHaveAccessibleName(crmCopy.setting.label);
	/**
	 * The setting shows this choice as the office's CRM, and none of the others. The trigger also
	 * holds its dropdown arrow, so the choice is judged within its text, not as all of it.
	 */
	const shows = async (choice: CrmChoice, message?: string) => {
		await expect(kind, message).toContainText(crmCopy.setting[choice]);
		for (const other of CRM_CHOICES.filter((c) => c !== choice)) {
			await expect(kind, message).not.toContainText(crmCopy.setting[other]);
		}
	};
	/** The admin picks a CRM in the setting's list (whether that saves depends on the CRM). */
	const pick = async (choice: CrmChoice) => {
		await kind.click();
		const option = page.getByRole("option", { name: crmCopy.setting[choice], exact: true });
		await expect(option, `the setting offers ${crmCopy.setting[choice]}`).toBeVisible();
		await option.click();
	};
	/** The HubSpot access token field, and the button that saves it, in the CRM setting. */
	const token = crm.getByTestId("crm-token");
	const save = crm.getByRole("button", { name: crmCopy.setting.save, exact: true });
	return {
		shows,
		token,
		save,
		/** Said in the CRM setting (a token set, a token required). */
		says: (text: string) => crm.getByText(text, { exact: true }),
		/** The admin chooses the office's CRM; it saves at once. */
		choose: async (choice: "none" | "mock") => {
			await pick(choice);
			await expect(
				page.getByText(crmCopy.setting.saved, { exact: true }),
				"CRM saved.",
			).toBeVisible();
			await shows(choice);
		},
		/**
		 * The admin chooses HubSpot: nothing is saved yet; the setting asks for the office's HubSpot
		 * access token, in a password field named for it, with a button to save it.
		 */
		chooseHubSpot: async () => {
			await pick("hubspot");
			await expect(token, "choosing HubSpot asks for the access token").toBeVisible();
			await expect(token, "the token field is named for the token").toHaveAccessibleName(
				crmCopy.setting.token,
			);
			await expect(token, "the token is typed into a password field").toHaveAttribute(
				"type",
				"password",
			);
			await expect(save, "a button saves the token").toBeVisible();
		},
		/** The admin enters a token and saves it: CRM saved. */
		saveToken: async (value: string) => {
			await token.fill(value);
			await save.click();
			await expect(
				page.getByText(crmCopy.setting.saved, { exact: true }),
				"CRM saved.",
			).toBeVisible();
		},
	};
}

/** The office's CRM through the API behind the setting. */
const crmConnection = {
	address: (officeId: string) => `/api/crm/connection?officeId=${encodeURIComponent(officeId)}`,
	/**
	 * Sets it, sent as the app's own calls are (with the Origin), so a refusal is about who asks.
	 * HubSpot takes the office's access token; without `token`, the body carries none.
	 */
	put: (
		request: APIRequestContext,
		officeId: string,
		kind: "mock" | "hubspot" | null,
		token?: string,
	) =>
		request.put("/api/crm/connection", {
			data: token === undefined ? { officeId, kind } : { officeId, kind, token },
			headers: { origin: appOrigin() },
			maxRedirects: 0,
		}),
};

/** The office's CRM in a `GET /api/crm/connection` answer (it also lists the kinds on offer). */
async function officeCrmIn(res: APIResponse): Promise<"mock" | "hubspot" | null> {
	return ((await res.json()) as { kind: "mock" | "hubspot" | null }).kind;
}

/** A HubSpot access token of the test's own, shaped like one; nothing ever sends it to HubSpot. */
function fakeHubSpotToken(): string {
	return `pat-eu1-e2e-${randomUUID()}`;
}

/**
 * The platform admin reads the office's CRM through the API: on HubSpot, with a token set, and
 * none of these tokens anywhere in the raw answer.
 */
async function expectHubSpotWithTokenUnseen(admin: Admin, officeId: string, tokens: string[]) {
	const res = await admin.api.get(crmConnection.address(officeId));
	expect(res.status(), "the platform admin reads the office's CRM").toBe(200);
	const raw = await res.text();
	for (const token of tokens) {
		expect(raw, "the API's answer never carries the token").not.toContain(token);
	}
	expect(JSON.parse(raw), "the office is on HubSpot, with a token set").toMatchObject({
		kind: "hubspot",
		tokenSet: true,
	});
}

/**
 * The platform admin reloads the office's Connections card: it shows HubSpot with a token set, the
 * token field is empty, and none of these tokens is anywhere in the page (its HTML and the data
 * inlined in it included).
 */
async function expectCardShowsTokenSetNeverToken(admin: Admin, officeId: string, tokens: string[]) {
	const setting = await openCrmSetting(admin, officeId);
	await setting.shows("hubspot", "the office's CRM is saved as HubSpot");
	await expect(
		setting.says(crmCopy.setting.tokenSet),
		"the card says a token is set",
	).toBeVisible();
	await expect(setting.token, "the token field is empty").toHaveValue("");
	const html = await admin.page.content();
	for (const token of tokens) {
		expect(html, "the token is nowhere in the page").not.toContain(token);
	}
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
		await office.assignToAgent(guest);

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
		await openThreadOf(manager, guest, { all: true });
		await expect(
			manager.getByTestId("owner-filter"),
			"they are the office's manager (only a manager filters by owner, Assign 9)",
		).toBeVisible();
		await expect(
			openThread(manager).getByText(crmCopy.inCrm(nameOf(guest)), { exact: true }),
			"the manager's thread header says the guest is in the CRM",
		).toBeVisible();

		// In the CRM: exactly one lead for the guest, theirs, linked to the thread, with no
		// message text in it.
		const threadId = await threadIdOf(api, guest);
		const [lead, ...more] = await leadsOf(office.id, guest);
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
		const leads = await leadsOf(office.id, guest);
		expect(leads, "the guest writing again makes no second lead").toHaveLength(1);
		expect(leads[0].id, "it is the same lead").toBe(lead.id);
		for (const text of guest.texts) {
			expect(JSON.stringify(leads[0]), "no message text in the lead").not.toContain(text);
		}
		expect(
			(await mockCrmLeads(office.id)).map((l) => l.zaloUserId),
			"the office's CRM holds one lead per guest",
		).toEqual([guest.id, later.id]);
	});

	test("with no CRM: a new guest's thread header says nothing about a CRM, and no lead is made", async ({
		newOffice,
	}) => {
		test.setTimeout(150_000);
		const office = await newOffice("CRM 1 none", { crm: "none", manager: true });
		// A second office, on the mock CRM, only as a clock: once its guest's lead is in, lead
		// writing has had its chance for the guest who wrote to the office with no CRM before it.
		const clock = await newOffice("CRM 1 clock", { crm: "mock", agent: false });
		const { page } = office.agent;

		const guest = await office.newGuest();
		await office.assignToAgent(guest);
		const clockGuest = await clock.newGuest();
		await expectLeadAppears(
			clock.id,
			clockGuest,
			"lead writing ran: the guest of an office on the mock CRM became a lead",
		);

		await openThreadOf(page, guest);
		// The header only: the office's auto-reply below it names the office (ADR 0021), and this
		// office's name has CRM in it.
		const header = openThread(page).locator("header");
		await expect(header, "the thread header is showing").toBeVisible();
		await expect(
			header.getByText(/\bCRM\b/),
			"the thread header says nothing about a CRM",
		).toHaveCount(0);
		await expect(openThread(page).getByTestId("crm-status"), "no CRM status at all").toHaveCount(0);
		expect(await mockCrmLeads(office.id), "no lead is made for an office with no CRM").toEqual([]);
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
		const office = await newOffice("CRM 2 mock", { crm: "none", manager: true });

		const setting = await openCrmSetting(admin, office.id);
		await setting.shows("none", "a new office has no CRM");
		await setting.choose("mock");

		// It stays chosen.
		const reopened = await openCrmSetting(admin, office.id);
		await reopened.shows("mock", "the office's CRM is saved as Mock");

		// A new guest writes: they become a lead in the mock CRM, and the agent sees it.
		const guest = await office.newGuest();
		await office.assignToAgent(guest);
		await expectInCrmOnThread(office.agent.page, guest);
		const leads = await leadsOf(office.id, guest);
		expect(leads, "the office's CRM holds one lead for the guest").toHaveLength(1);
		expect(leads[0].name, "the lead carries the guest's name").toBe(nameOf(guest));
	});

	test("choosing None takes the thread's In CRM status away", async ({ admin, newOffice }) => {
		test.setTimeout(150_000);
		const office = await newOffice("CRM 2 none", { crm: "none", manager: true });
		const { page } = office.agent;

		// On the mock CRM through the setting, a new guest's thread is In CRM.
		await (await openCrmSetting(admin, office.id)).choose("mock");
		const guest = await office.newGuest();
		await office.assignToAgent(guest);
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
		expect(await officeCrmIn(asAdmin)).toBeNull();

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
		expect(await officeCrmIn(after), "the refused requests changed nothing").toBeNull();
		await (await openCrmSetting(admin, office.id)).shows("none", "the admin still sees None");

		// The same request from the platform admin is taken: the refusals were about who asked.
		const byAdmin = await crmConnection.put(admin.page.request, office.id, "mock");
		expect(byAdmin.status(), "the platform admin sets the office's CRM").toBe(200);
		expect(await officeCrmIn(await admin.api.get(address)), "the office is on Mock").toBe("mock");
	});
});

// scenario: docs/e2e-scenarios.md CRM 3
test.describe("CRM 3 — won or lost leaves the queue, and comes back", () => {
	test("lost: the thread leaves Your turn for Sent with a neutral Lost where the turn was, the nav count drops; the guest writes again and it is back in Your turn, and the CRM telling Nhịp again it is lost does not hide them", async ({
		newOffice,
		request,
	}) => {
		test.setTimeout(240_000);
		const office = await newOffice("CRM 3 lost", { crm: "mock", manager: true });
		const { page } = office.agent;

		// Two guests wait on the office's only agent, the manager having given both to them; the
		// second keeps the counts above zero.
		const guest = await office.newGuest();
		const other = await office.newGuest();
		await office.assignToAgent(guest);
		await office.assignToAgent(other);
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
		// A second office on the mock CRM, only as a clock: once its guest, who writes after this
		// one, is a lead, the background work for this guest's message has had its chance.
		const clock = await newOffice("CRM 3 lost clock", { crm: "mock", agent: false });
		const clockGuest = await clock.newGuest();
		await expectLeadAppears(
			clock.id,
			clockGuest,
			"lead writing ran: a later guest of another office became a lead",
		);
		expect(
			(await leadsOf(office.id, guest))[0].outcome,
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
		const office = await newOffice("CRM 3 won", { crm: "mock", manager: true });
		const { page } = office.agent;

		const guest = await office.newGuest();
		await office.assignToAgent(guest);
		await office.assignToAgent(await office.newGuest());
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

// scenario: docs/e2e-scenarios.md CRM 4a
test.describe("CRM 4a — a missing lead says so, and heals when the thread is opened", () => {
	test("with the CRM down when a new guest writes: the message still arrives in Your turn, the agent and the manager both see a neutral Not in CRM yet in the thread header, and no lead is in the CRM", async ({
		newOffice,
	}) => {
		test.setTimeout(150_000);
		const office = await newOffice("CRM 4a down", { crm: "mock", manager: true });
		const { page } = office.agent;
		await takeMockCrmDown(office.id);

		const guest = await office.newGuest();
		await office.assignToAgent(guest);

		// The message still arrives: the guest waits on the agent, in Your turn.
		await page.goto("/en/inbox");
		await expectQueue(page, { yourTurn: 1, sent: 0, all: 1 }, WITHIN_A_POLL);
		await expect(
			rowOf(page, guest).getByTestId("thread-status"),
			"the guest is Your turn",
		).toHaveText(crmCopy.yourTurn);

		// The agent opens the thread: its header says the guest is not in the CRM yet.
		await openThreadOf(page, guest);
		await expectNotInCrmYet(page, "the agent");

		// The manager sees the same on that thread.
		const manager = office.manager.page;
		await openThreadOf(manager, guest, { all: true });
		await expect(
			manager.getByTestId("owner-filter"),
			"they are the office's manager (only a manager filters by owner, Assign 9)",
		).toBeVisible();
		await expectNotInCrmYet(manager, "the manager");

		expect(await leadsOf(office.id, guest), "no lead is in the CRM").toEqual([]);
	});

	test("once the CRM works again and the wait before trying again has passed, opening the thread makes it In CRM with the guest's name, and the CRM holds exactly one lead for the guest", async ({
		newOffice,
	}) => {
		test.setTimeout(180_000);
		const office = await newOffice("CRM 4a heals", { crm: "mock", manager: true });
		const { page } = office.agent;
		await takeMockCrmDown(office.id);

		const guest = await office.newGuest();
		await office.assignToAgent(guest);

		// First the lead is missing, and the thread says so.
		await openThreadOf(page, guest);
		await expect(
			crmStatus(page),
			"with the CRM down, the thread header says Not in CRM yet",
		).toHaveText(crmCopy.notInCrmYet, WITHIN_A_POLL);
		// The agent leaves the thread for the list.
		await page.goto("/en/inbox");
		await expect(rowOf(page, guest), "the agent is back on the thread list").toBeVisible();

		// The CRM works again, and Nhịp's wait before trying again is over.
		await bringMockCrmBack(office.id);
		await passCrmRetryWait(office.id);

		// The agent opens the thread: within a poll, its header says the guest is in the CRM.
		await openThreadOf(page, guest);
		await expect(
			crmStatus(page),
			"opening the thread writes the lead: the header says In CRM: <the guest's name>",
		).toHaveText(crmCopy.inCrm(nameOf(guest)), WITHIN_A_POLL);

		// Exactly one lead for the guest, judged once a later guest's lead has arrived.
		const later = await office.newGuest();
		await expectLeadAppears(office.id, later, "a later guest's lead arrives in the CRM");
		const leads = await leadsOf(office.id, guest);
		expect(leads, "the CRM holds exactly one lead for the guest").toHaveLength(1);
		expect(leads[0].name, "the lead carries the guest's name").toBe(nameOf(guest));
	});

	test("an office with no CRM: a new guest's thread shows no CRM status, neither Not in CRM yet nor In CRM, to the agent or the manager", async ({
		newOffice,
	}) => {
		test.setTimeout(150_000);
		const office = await newOffice("CRM 4a none", { crm: "none", manager: true });
		const guest = await office.newGuest();
		await office.assignToAgent(guest);

		for (const [who, operator, all] of [
			["the agent", office.agent, false],
			["the manager", office.manager, true],
		] as const) {
			const { page } = operator;
			await openThreadOf(page, guest, { all });
			// Judged once the open thread has asked again: the guest writes, and it shows.
			const again = await guest.write(`Still available? ${randomUUID().slice(0, 8)}`);
			await expect(
				openThread(page).getByText(again, { exact: true }),
				`${who}'s open thread shows the guest's new message`,
			).toBeVisible(WITHIN_A_POLL);
			await expectNoCrmStatus(page, who, guest);
		}
	});
});

// scenario: docs/e2e-scenarios.md CRM 8
test.describe("CRM 8 — the admin connects an office to HubSpot", () => {
	// No guest writes on a HubSpot office here and nothing calls HubSpot: the adapter is held to its
	// contract by Vitest on recorded HubSpot HTTP (spec #59). The tokens are fakes of the test's own.

	test("the platform admin chooses HubSpot, enters the office's access token and saves: nothing is saved before that, and after a reload the card shows HubSpot with a token set, the token field empty and the token nowhere in the page or the API's answer", async ({
		admin,
		newOffice,
	}) => {
		test.setTimeout(120_000);
		const office = await newOffice("CRM 8 hubspot", { crm: "none", agent: false });
		const token = fakeHubSpotToken();

		const setting = await openCrmSetting(admin, office.id);
		await setting.shows("none", "a new office has no CRM");
		await setting.chooseHubSpot();

		// Choosing HubSpot alone saves nothing: the office is still on no CRM.
		const before = await admin.api.get(crmConnection.address(office.id));
		expect(before.status()).toBe(200);
		expect(await officeCrmIn(before), "choosing HubSpot does not save it").toBeNull();

		await setting.saveToken(token);

		await expectCardShowsTokenSetNeverToken(admin, office.id, [token]);
		await expectHubSpotWithTokenUnseen(admin, office.id, [token]);
	});

	test("HubSpot with no token is not saved: the setting asks for the token, and the office stays on None", async ({
		admin,
		newOffice,
	}) => {
		test.setTimeout(120_000);
		const office = await newOffice("CRM 8 no token", { crm: "none", agent: false });

		const setting = await openCrmSetting(admin, office.id);
		await setting.shows("none", "a new office has no CRM");
		await setting.chooseHubSpot();
		await setting.save.click();
		await expect(
			setting.says(crmCopy.setting.tokenRequired),
			"the setting asks for the HubSpot access token",
		).toBeVisible();
		await expect(
			admin.page.getByText(crmCopy.setting.saved, { exact: true }),
			"no CRM saved.",
		).toHaveCount(0);

		const res = await admin.api.get(crmConnection.address(office.id));
		expect(res.status()).toBe(200);
		expect(await officeCrmIn(res), "the office is still on no CRM").toBeNull();
		await (await openCrmSetting(admin, office.id)).shows("none", "the admin still sees None");
	});

	test("saving a new token replaces the old one, and neither is shown afterwards, on the card or through the API", async ({
		admin,
		newOffice,
	}) => {
		test.setTimeout(120_000);
		const office = await newOffice("CRM 8 replace", { crm: "none", agent: false });
		const first = fakeHubSpotToken();
		const second = fakeHubSpotToken();

		const setting = await openCrmSetting(admin, office.id);
		await setting.chooseHubSpot();
		await setting.saveToken(first);

		// On the reloaded card (HubSpot, a token set), the admin enters a new token and saves it.
		await expectCardShowsTokenSetNeverToken(admin, office.id, [first]);
		const reopened = await openCrmSetting(admin, office.id);
		await reopened.saveToken(second);

		await expectCardShowsTokenSetNeverToken(admin, office.id, [first, second]);
		await expectHubSpotWithTokenUnseen(admin, office.id, [first, second]);
	});

	test("through the API: HubSpot with a token is saved and read back as a token set, never the token; HubSpot without a token answers 400 and the office stays as it was", async ({
		admin,
		newOffice,
	}) => {
		test.setTimeout(120_000);
		const office = await newOffice("CRM 8 api", { crm: "none", agent: false });
		const address = crmConnection.address(office.id);
		const { request } = admin.page;
		const first = fakeHubSpotToken();
		const second = fakeHubSpotToken();

		// HubSpot without a token is refused, and changes nothing.
		const tokenless = await crmConnection.put(request, office.id, "hubspot");
		expect(tokenless.status(), "HubSpot without a token is refused").toBe(400);
		expect(await officeCrmIn(await admin.api.get(address)), "the office stays on None").toBeNull();

		// The same request with the office's token is taken, and its answer does not echo the token
		// (stored write-only, ADR 0003).
		const saved = await crmConnection.put(request, office.id, "hubspot", first);
		expect(saved.status(), "HubSpot with a token is saved").toBe(200);
		expect(await saved.text(), "the answer does not echo the token").not.toContain(first);
		await expectHubSpotWithTokenUnseen(admin, office.id, [first]);

		// A new token replaces it: still HubSpot, still a token set, neither token readable.
		const replaced = await crmConnection.put(request, office.id, "hubspot", second);
		expect(replaced.status(), "a new token is saved").toBe(200);
		expect(await replaced.text(), "the answer does not echo the token").not.toContain(second);
		await expectHubSpotWithTokenUnseen(admin, office.id, [first, second]);
	});

	test("a non-admin is refused: the office's agent and manager find no CRM setting and get 403 from the API, anyone signed out 401, and the office's CRM is unchanged", async ({
		admin,
		newOffice,
		request,
	}) => {
		test.setTimeout(150_000);
		const office = await newOffice("CRM 8 refused", { crm: "none", manager: true });
		const address = crmConnection.address(office.id);
		const token = fakeHubSpotToken();

		const refusedBy = async (who: string, page: Page) => {
			await page.goto(`/en/admin/organizations/${office.id}`);
			// Judge on a rendered page, not an empty one.
			await expect(page.getByRole("main")).toBeVisible();
			await expect(page.getByTestId("crm-kind"), `${who} sees no CRM setting`).toHaveCount(0);
			await expect(page.getByTestId("crm-token"), `${who} sees no token field`).toHaveCount(0);

			const read = await page.request.get(address, { maxRedirects: 0 });
			expect(read.status(), `${who} cannot read the office's CRM`).toBe(403);
			expect(await read.text(), `${who} is not shown the token`).not.toContain(token);
			const write = await crmConnection.put(page.request, office.id, "hubspot", fakeHubSpotToken());
			expect(write.status(), `${who} cannot connect the office to HubSpot`).toBe(403);
		};

		// On no CRM, the office's own agent and manager are refused, and so is anyone signed out.
		for (const [who, operator] of [
			["the agent", office.agent],
			["the manager", office.manager],
		] as const) {
			await refusedBy(who, operator.page);
		}
		const signedOutRead = await request.get(address, { maxRedirects: 0 });
		expect(signedOutRead.status(), "nobody signed in cannot read it").toBe(401);
		const signedOutWrite = await crmConnection.put(request, office.id, "hubspot", token);
		expect(signedOutWrite.status(), "nobody signed in cannot set it").toBe(401);
		expect(
			await officeCrmIn(await admin.api.get(address)),
			"the refused requests changed nothing",
		).toBeNull();

		// The same request from the platform admin is taken: the refusals were about who asked.
		const byAdmin = await crmConnection.put(admin.page.request, office.id, "hubspot", token);
		expect(byAdmin.status(), "the platform admin connects the office to HubSpot").toBe(200);

		// With a token set, the agent and manager still read nothing and change nothing.
		for (const [who, operator] of [
			["the agent", office.agent],
			["the manager", office.manager],
		] as const) {
			await refusedBy(who, operator.page);
		}
		const signedOutAgain = await request.get(address, { maxRedirects: 0 });
		expect(signedOutAgain.status(), "nobody signed in cannot read it").toBe(401);
		expect(await signedOutAgain.text(), "nor see the token").not.toContain(token);
		await expectHubSpotWithTokenUnseen(admin, office.id, [token]);
	});
});
