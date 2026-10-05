import { execFileSync } from "node:child_process";
import { createHmac, randomInt, randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import type { APIRequestContext, Page, Request } from "@playwright/test";

import { assignerAs } from "./support/assign";
import type { MockCrmLead } from "./support/crm";
import { connectMockCrm, mockCrmLeads } from "./support/crm";
import { expect, test as base } from "./support/fixtures";
import type { Joined } from "./support/invitee";
import { joinOffice } from "./support/invitee";
import { AGENT } from "./support/seed";
import { apiAs } from "./support/session";

/** What the Inbox says when a link names no thread the operator can open (inbox.threadNotFound). */
const THREAD_NOT_FOUND = (() => {
	const file = path.resolve(__dirname, "../../../packages/i18n/translations/en/saas.json");
	const saas = JSON.parse(fs.readFileSync(file, "utf8")) as { inbox: { threadNotFound: string } };
	return saas.inbox.threadNotFound;
})();

/** A lead is written in the background, after the guest's message is taken. */
const LEAD_WRITTEN = { timeout: 30_000 };

/** A WhatsApp guest of this test: their phone number is their WhatsApp id (wa_id). */
type Guest = {
	phone: string;
	/** Their WhatsApp profile name, which the Inbox and Home list them by. Never their phone. */
	name: string;
	/** The text they wrote. */
	text: string;
};

/** An office of the test's own, with a WhatsApp number of its own, one agent and a manager. */
type Office = {
	id: string;
	/** The office's only agent, joined through the invitation link, in a browser of their own. */
	agent: Joined;
	/** A new guest writes to the office's WhatsApp number from their phone. */
	guestWrites: () => Promise<Guest>;
	/** The office's manager gives the guest's thread to the agent (ADR 0022). */
	assignToAgent: (guest: Guest) => Promise<void>;
};

/**
 * `newOffice` makes an office of the test's own (deleted afterwards by the `admin` fixture), on
 * the mock CRM or on none, holding a WhatsApp number no other office holds (so it never takes the
 * walk office's number from another spec), with one agent and one manager (the kit's `admin`) who
 * joined through the invitation link; a new guest waits in Unassigned until the manager gives them
 * to the agent (ADR 0022). No other spec writes to it, so its queue is this test's only.
 */
const test = base.extend<{
	newOffice: (label: string, options: { crm: "mock" | "none" }) => Promise<Office>;
}>({
	newOffice: async ({ admin, browser, request }, use) => {
		const contexts: { close: () => Promise<void> }[] = [];
		await use(async (label, { crm }) => {
			const office = await admin.createOffice(label);
			if (crm === "mock") {
				connectMockCrm(office.id);
			}
			const number = `e2e-links-${randomUUID()}`;
			holdWhatsAppNumber(office.id, number);
			const agent = await joinOffice(admin, browser, office.id, "member", "thread-links");
			contexts.push(agent);
			const manager = await joinOffice(admin, browser, office.id, "admin", "thread-links-manager");
			contexts.push(manager);
			return {
				id: office.id,
				agent,
				assignToAgent: (guest) => assignerAs(manager.api).assignGuestTo(guest.phone, agent.userId),
				guestWrites: async () => {
					const guest = newWhatsAppGuest();
					await whatsAppWebhook(request, number, guest);
					return guest;
				},
			};
		});
		for (const context of contexts) {
			await context.close();
		}
	},
});

/**
 * Setup (tests/support/pipe-state.ts, as `connectWhatsAppNumber` runs it): the office holds this
 * WhatsApp number. A number of the test's own, so the walk office keeps the E2E env's.
 */
function holdWhatsAppNumber(officeId: string, phoneNumberId: string) {
	execFileSync(
		"pnpm",
		[
			"exec",
			"tsx",
			"--tsconfig",
			"tsconfig.json",
			"tests/support/pipe-state.ts",
			"connect-whatsapp",
			officeId,
			phoneNumberId,
		],
		{ cwd: path.resolve(__dirname, ".."), stdio: "inherit" },
	);
}

/** A guest with a Vietnamese mobile number no other test, repeat or run uses, and a name of their own. */
function newWhatsAppGuest(): Guest {
	const phone = `849${randomInt(100_000_000, 1_000_000_000)}`;
	const tag = randomUUID().slice(0, 8);
	return { phone, name: `Guest ${tag}`, text: `Hello, is the flat still free? ${tag}` };
}

/** The guest's text as Meta sends and signs it, to the office's number. */
async function whatsAppWebhook(request: APIRequestContext, phoneNumberId: string, guest: Guest) {
	const secret = process.env.WHATSAPP_APP_SECRET;
	if (!secret) throw new Error("WHATSAPP_APP_SECRET comes from the E2E env");
	const body = JSON.stringify({
		entry: [
			{
				changes: [
					{
						value: {
							metadata: { phone_number_id: phoneNumberId },
							contacts: [{ wa_id: guest.phone, profile: { name: guest.name } }],
							messages: [
								{
									from: guest.phone,
									id: `wamid.${randomUUID()}`,
									timestamp: String(Math.floor(Date.now() / 1000)),
									type: "text",
									text: { body: guest.text },
								},
							],
						},
					},
				],
			},
		],
	});
	const signature = createHmac("sha256", secret).update(body).digest("hex");
	const res = await request.post("/webhooks/whatsapp", {
		data: body,
		headers: { "content-type": "application/json", "X-Hub-Signature-256": `sha256=${signature}` },
	});
	expect(res.ok(), `the WhatsApp webhook takes the message (${res.status()})`).toBe(true);
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

/** A guest's row in the Inbox's thread list, by the name they go by. */
function rowOf(page: Page, guest: Guest) {
	return threadList(page).getByRole("button", { name: new RegExp(`^${guest.name}\\b`) });
}

/** The Inbox shows this guest's thread: their message is in the open thread. */
async function expectThreadOpen(page: Page, guest: Guest, message: string) {
	await expect(openThread(page).getByText(guest.text, { exact: true }), message).toBeVisible();
}

/** The agent answers the guest from the Inbox; the reply goes out (a mock send in E2E). */
async function answer(page: Page, guest: Guest): Promise<string> {
	await rowOf(page, guest).click();
	await expectThreadOpen(page, guest, `the agent opens ${guest.name}'s thread`);
	const reply = `Yes, it is free from next month. ${randomUUID().slice(0, 8)}`;
	await page.getByRole("textbox", { name: "Reply" }).fill(reply);
	const sent = page.waitForResponse((r) => r.url().endsWith("/approve"));
	await page.getByTestId("approve-and-send").click();
	expect((await sent).status(), "the reply is sent").toBe(200);
	return reply;
}

/* ---------------------------------------------------------------- addresses */

/** The thread an inbox address names (`/inbox?thread=<id>`). */
function threadParamOf(address: string): string | null {
	return new URL(address, "https://nhip.invalid").searchParams.get("thread");
}

/**
 * The thread id in a request the Inbox makes for one thread (`/api/conversations/<id>`), decoded;
 * null for any other request, the thread list and a thread's own actions included.
 */
function threadRequested(request: Request): string | null {
	const match = /^\/api\/conversations\/([^/]+)$/.exec(new URL(request.url()).pathname);
	return match ? decodeURIComponent(match[1]) : null;
}

/** Every request the page makes for one thread, from now on. */
function watchThreadRequests(page: Page): string[] {
	const addresses: string[] = [];
	page.on("request", (request) => {
		if (threadRequested(request) !== null) {
			addresses.push(request.url());
		}
	});
	return addresses;
}

/** The address carries no trace of the phone number, raw or decoded (`+84…`, `%2B84…`). */
function expectNoPhone(address: string, guest: Guest, where: string) {
	expect
		.soft(address, `${where} never carries the guest's phone number`)
		.not.toContain(guest.phone);
	expect
		.soft(decodeURIComponent(address), `${where}, decoded, never carries the guest's phone number`)
		.not.toContain(guest.phone);
}

/** The guest's lead in the office's mock CRM, once it is written. */
async function leadOf(officeId: string, guest: Guest): Promise<MockCrmLead> {
	const find = () => mockCrmLeads(officeId).find((lead) => lead.name === guest.name);
	await expect
		.poll(() => find() !== undefined, { message: `${guest.name} becomes a lead`, ...LEAD_WRITTEN })
		.toBe(true);
	return find()!;
}

/**
 * The agent follows an inbox link naming `thread`, and the Inbox has loaded: the list shows the
 * office's guests.
 */
async function followInboxLink(page: Page, thread: string, guests: Guest[]) {
	await page.goto(`/en/inbox?thread=${encodeURIComponent(thread)}`);
	for (const guest of guests) {
		await expect(rowOf(page, guest), `the list still shows ${guest.name}`).toBeVisible();
	}
}

/**
 * The Inbox says the conversation isn't here and shows no one's thread: no guest's message in
 * the open thread, and nothing to answer. Soft, so every link is judged in one run: the notice
 * is waited for first, so a thread opened in its place has had time to show.
 */
async function expectNotFound(page: Page, guests: Guest[], link: string) {
	const notFound = page.getByTestId("thread-not-found");
	await expect.soft(notFound, `${link}: the Inbox says the conversation isn't here`).toBeVisible();
	// The notice also carries a way back to the list (for a phone), so the words are part of it.
	await expect.soft(notFound, `${link}: in words`).toContainText(THREAD_NOT_FOUND);
	for (const guest of guests) {
		await expect
			.soft(
				openThread(page).getByText(guest.text, { exact: true }),
				`${link}: ${guest.name}'s thread is not opened`,
			)
			.toHaveCount(0);
	}
	await expect
		.soft(page.getByRole("textbox", { name: "Reply" }), `${link}: no thread to answer`)
		.toHaveCount(0);
	await expect
		.soft(page.getByTestId("approve-and-send"), `${link}: nothing to send`)
		.toHaveCount(0);
}

// ---------------------------------------------------------------------------------------

// scenario: docs/e2e-scenarios.md Thread links 1
test.describe("Thread links 1 — a thread's address names no guest", () => {
	test("a WhatsApp guest's thread is reached by an id that is never their phone: Home's Waiting now link, the inbox's request for the thread and the link on their CRM lead all carry the same id, and the links open their thread", async ({
		newOffice,
	}) => {
		test.setTimeout(180_000);
		const office = await newOffice("Thread links 1", { crm: "mock" });
		const { page } = office.agent;

		// Two guests wait; the first in the queue is the other one, so opening the right thread is
		// the link's doing.
		const first = await office.guestWrites();
		const guest = await office.guestWrites();
		await office.assignToAgent(first);
		await office.assignToAgent(guest);
		const requests = watchThreadRequests(page);

		// Home's Waiting now links to the guest's thread by its id, not their phone.
		await page.goto("/en/home");
		await expect(page.getByRole("heading", { name: "Waiting now" })).toBeVisible();
		const waiting = page.getByRole("link").filter({ hasText: guest.name });
		await expect(waiting, `Waiting now lists ${guest.name}`).toHaveCount(1);
		const href = await waiting.getAttribute("href");
		expect(href, "the Waiting now entry is a link").toBeTruthy();
		expect(new URL(href!, "https://nhip.invalid").pathname, "it opens the Inbox").toMatch(
			/^(\/(en|vi))?\/inbox\/?$/,
		);
		const id = threadParamOf(href!);
		expect(id, "the link names the guest's thread").toBeTruthy();
		expectNoPhone(href!, guest, "Home's Waiting now link");

		// Following it opens the guest's thread; the Inbox asks for that thread by the same id.
		const asked = page.waitForRequest((r) => threadRequested(r) === id);
		await waiting.click();
		await asked;
		await expectThreadOpen(page, guest, "Waiting now's link opens the guest's thread");
		await expect(
			openThread(page).getByText(first.text, { exact: true }),
			"not the first guest in the queue",
		).toHaveCount(0);

		// The link on the guest's lead in the office's CRM names the same thread.
		const lead = await leadOf(office.id, guest);
		expect(threadParamOf(lead.threadUrl), "the CRM's link names the same thread").toBe(id);
		expectNoPhone(lead.threadUrl, guest, "the link on the guest's CRM lead");

		// And it opens the guest's thread.
		await page.goto(lead.threadUrl);
		await expectThreadOpen(page, guest, "the CRM lead's link opens the guest's thread");
		await expect(
			openThread(page).getByText(first.text, { exact: true }),
			"not the first guest in the queue",
		).toHaveCount(0);

		// No request the Inbox made for a thread named either guest's phone.
		expect(requests.length, "the Inbox asked for threads").toBeGreaterThan(0);
		for (const address of requests) {
			expectNoPhone(address, guest, `the Inbox's request ${new URL(address).pathname}`);
			expectNoPhone(address, first, `the Inbox's request ${new URL(address).pathname}`);
		}
	});
});

// scenario: docs/e2e-scenarios.md Thread links 2
test.describe("Thread links 2 — a stale or unknown link opens no one's thread", () => {
	test("a made-up id, an old link that named the guest's phone, and another office's thread each show that the conversation isn't here and no one's thread; the list still shows the agent's guests and choosing one opens it", async ({
		newOffice,
	}) => {
		test.setTimeout(240_000);
		const office = await newOffice("Thread links 2", { crm: "none" });
		const { page } = office.agent;
		const first = await office.guestWrites();
		const guest = await office.guestWrites();
		const guests = [first, guest];
		for (const g of guests) {
			await office.assignToAgent(g);
		}

		// A thread of another office: the walk office's agent has threads of their own.
		const walkAgent = await apiAs(AGENT);
		const walkThreads = await walkAgent.get("/api/conversations");
		expect(walkThreads.status(), "the walk office's agent lists their threads").toBe(200);
		const [otherOffices] = (await walkThreads.json()) as { id: string }[];
		await walkAgent.dispose();
		expect(otherOffices, "the walk office has a thread").toBeDefined();

		const links: [string, string][] = [
			["a made-up id", randomUUID()],
			// Before ADR 0010's opaque ids, a thread's id was <office>:<pipe>:<guest id>.
			["an old link naming the guest's phone", `${office.id}:whatsapp:${guest.phone}`],
			["another office's thread", otherOffices.id],
		];
		for (const [link, thread] of links) {
			await followInboxLink(page, thread, guests);
			await expectNotFound(page, guests, link);

			// The list is usable beside it: choosing a guest opens their thread.
			await rowOf(page, guest).click();
			await expectThreadOpen(page, guest, `${link}: choosing ${guest.name} opens their thread`);
			await expect(
				page.getByTestId("thread-not-found"),
				`${link}: the notice goes once a thread is chosen`,
			).toHaveCount(0);
		}
	});
});

// scenario: docs/e2e-scenarios.md Thread links 3
test.describe("Thread links 3 — a link to an answered thread opens that thread", () => {
	test("the CRM's link to a guest the agent already answered (under Sent, not Your turn) opens that guest's thread with the reply, not the guest waiting first", async ({
		newOffice,
	}) => {
		test.setTimeout(180_000);
		const office = await newOffice("Thread links 3", { crm: "mock" });
		const { page } = office.agent;
		const answered = await office.guestWrites();
		const waiting = await office.guestWrites();
		await office.assignToAgent(answered);
		await office.assignToAgent(waiting);

		// The agent answers the first guest; the other is still waiting, first in Your turn.
		await page.reload();
		const reply = await answer(page, answered);
		await expect(
			page.getByRole("button", { name: "Your turn 1", exact: true }),
			"one guest still waits",
		).toBeVisible();
		await expect(
			page.getByRole("button", { name: "Sent 1", exact: true }),
			"the answered guest is under Sent",
		).toBeVisible();

		// The link on the answered guest's lead in the office's CRM opens their thread.
		const lead = await leadOf(office.id, answered);
		const id = threadParamOf(lead.threadUrl);
		expect(id, "the CRM's link names the guest's thread").toBeTruthy();
		const asked = page.waitForRequest((r) => threadRequested(r) === id);
		await page.goto(lead.threadUrl);
		await asked;
		await expectThreadOpen(page, answered, "the link opens the answered guest's thread");
		await expect(
			openThread(page).getByText(reply, { exact: true }),
			"with the agent's reply in it",
		).toBeVisible();
		await expect(
			openThread(page).getByText(waiting.text, { exact: true }),
			"not the guest waiting first",
		).toHaveCount(0);
		await expect(page.getByTestId("thread-not-found"), "the thread is there").toHaveCount(0);
	});
});
