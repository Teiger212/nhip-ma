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
import { clientIpHeaders, withOrigin } from "./support/session";

/** The thread header's CRM status (packages/i18n/translations/en/saas.json, inbox.crm). */
const crmCopy = (() => {
	const file = path.resolve(__dirname, "../../../packages/i18n/translations/en/saas.json");
	const saas = JSON.parse(fs.readFileSync(file, "utf8")) as {
		inbox: { crm: { inCrm: string } };
	};
	return { inCrm: (name: string) => saas.inbox.crm.inCrm.replaceAll("{name}", name) };
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

/** An agent of an office, signed in in a browser of their own, on their Inbox. */
type Agent = { page: Page; api: Api };

/** An office of the test's own, with a Zalo OA of its own. */
type TestOffice = {
	id: string;
	name: string;
	/** A new guest writes to the office for the first time. */
	newGuest: () => Promise<Guest>;
	/** The office's invited agent (only when asked for). */
	agent: Agent;
};

/**
 * `newOffice` makes an office of the test's own (the platform admin creates it; it is deleted
 * afterwards), on the mock CRM or on none, with a Zalo OA of its own (released afterwards, even
 * when the test failed) and, when asked, an agent who joined it through the invitation link.
 * No other spec writes to it, so its leads are this test's leads only.
 */
const test = base.extend<{
	newOffice: (
		label: string,
		options: { crm: "mock" | "none"; agent?: boolean },
	) => Promise<TestOffice>;
}>({
	newOffice: async ({ admin, browser, request }, use) => {
		const oaIds: string[] = [];
		const contexts: { close: () => Promise<void> }[] = [];
		await use(async (label, { crm, agent = true }) => {
			const office = await admin.createOffice(label);
			if (crm === "mock") {
				connectMockCrm(office.id);
			}
			const oaId = uniqueId("oa");
			oaIds.push(oaId);
			connectZaloOa(office.id, oaId);
			let joined: Agent | undefined;
			if (agent) {
				const newcomer = await newAgentOf(admin, browser, office.id);
				contexts.push(newcomer);
				joined = newcomer;
			}
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
				get agent(): Agent {
					if (!joined) throw new Error(`${label} was made without an agent`);
					return joined;
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

/** A newly joined agent of `officeId`, signed up through the invitation link, on their Inbox. */
async function newAgentOf(admin: Admin, browser: Browser, officeId: string) {
	const email = admin.newEmail("crm-agent");
	const invitationId = await admin.invite(email, officeId);
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

// ---------------------------------------------------------------------------------------

// scenario: docs/e2e-scenarios.md CRM 1
test.describe("CRM 1 — a new guest becomes a lead in the CRM", () => {
	test("on the mock CRM: the thread header says In CRM with the guest's name, and the CRM holds one lead with their Zalo id, pipe and thread link, and no message text, even after they write again", async ({
		newOffice,
	}) => {
		test.setTimeout(150_000);
		const office = await newOffice("CRM 1 mock", { crm: "mock" });
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
