import { createHash, randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import type { APIRequestContext, Page } from "@playwright/test";

import { expect, test as base } from "./support/fixtures";
import { deleteOffice } from "./support/offices";
import type { Joined } from "./support/operators";
import { joinOffice } from "./support/operators";
import { connectWhatsAppNumber, connectZaloOa, releaseZaloOa } from "./support/pipes";
import type { Api } from "./support/session";
import { appOrigin } from "./support/session";
import { newWhatsAppGuest, newWhatsAppNumber, sendWhatsAppText } from "./support/whatsapp";
import { deliverZalo, signedZaloText } from "./support/zalo";

/**
 * The Inbox's and Home's copy, from packages/i18n/translations/en/saas.json: the auto-reply's
 * meta line (inbox.source.autoReply, inbox.autoReply.template, inbox.mock), the office's own
 * app reply (inbox.source.oaEcho), the reply box (inbox.reply), and Home's funnel and response
 * time.
 */
const saas = JSON.parse(
	fs.readFileSync(
		path.resolve(__dirname, "../../../packages/i18n/translations/en/saas.json"),
		"utf8",
	),
) as {
	inbox: {
		mock: string;
		reply: string;
		searchAria: string;
		source: { autoReply: string; oaEcho: string };
		autoReply: { template: string };
	};
	home: {
		waitingNow: string;
		funnel: { title: string; leadsIn: string; engaged: string; inConversation: string };
		responseTime: string;
		noResponseTime: string;
		answered: string;
		spread: { under5m: string; from15to60m: string };
	};
};

/** The first-reply template's opening (ADR 0021, Context): "Thanks for writing …". */
const FIRST_REPLY_TEMPLATE = /Thanks for writing/i;

/** The office every greeting here signs as (ADR 0021, R7: the label names the office). */
const OFFICE_NAME = "Saigon Prime Test";

/** The English label: the greeting's last line (ADR 0021, R7). */
const EN_LABEL = `Auto-reply from ${OFFICE_NAME}: a colleague will continue with you right here.`;

/**
 * The greeting goes out in the background "within seconds" of the guest's first message; a
 * production build under parallel load gets a margin on that.
 */
const WITHIN_SECONDS = { timeout: 20_000 };

/* ---------------------------------------------------------------- the office and its guests */

/** A guest writing on Zalo to one of the office's OAs; a nameless Zalo guest goes by their id. */
type Guest = {
	id: string;
	/** Every text the guest sent, in order. */
	texts: string[];
	/** The guest writes; resolves with the text. */
	write: (text?: string) => Promise<string>;
	/** Zalo delivers the office's own message to this guest (an `oa_send_text` echo). */
	echoFromOffice: (text: string, msgId?: string) => Promise<void>;
	/** The same guest's message, signed but not yet delivered (to deliver at one moment). */
	signed: (text: string) => ReturnType<typeof signedZaloText>;
};

/**
 * An office of the test's own named exactly "Saigon Prime Test" (a slug of its own, so parallel
 * tests never collide; deleted afterwards), with a manager (the kit's `admin`) who accepted their
 * invitation and reads every thread, and Zalo OAs of its own (released afterwards).
 */
type GreetingOffice = {
	id: string;
	/** The office's address slug: its settings are at `/{locale}/{slug}/settings/general`. */
	slug: string;
	manager: Joined;
	/** A new OA of the office: connected, or already disconnected. */
	newOa: (state?: "disconnected") => Promise<string>;
	/** A guest who has not written yet, on this OA (the office's first OA unless given one). */
	newGuest: (oaId?: string) => Guest;
};

const test = base.extend<{ office: GreetingOffice }>({
	office: async ({ admin, browser, request }, use) => {
		const slug = `e2e-greeting-${randomUUID()}`;
		const created = await admin.api.post("/api/auth/organization/create", {
			name: OFFICE_NAME,
			slug,
		});
		expect(created.status(), `the platform admin creates "${OFFICE_NAME}"`).toBe(200);
		const { id } = (await created.json()) as { id: string };
		const oaIds: string[] = [];
		let manager: Joined | undefined;
		try {
			const newOa = async (state?: "disconnected") => {
				const oaId = uniqueId("oa");
				await connectZaloOa(id, oaId, state);
				oaIds.push(oaId);
				return oaId;
			};
			const firstOa = await newOa();
			manager = await joinOffice(admin, browser, id, "admin", "greeting-manager");
			await use({
				id,
				slug,
				manager,
				newOa,
				newGuest: (oaId = firstOa) => guestOf(request, oaId),
			});
		} finally {
			await manager?.close();
			for (const oaId of oaIds) {
				await releaseZaloOa(oaId);
			}
			await deleteOffice(admin.api, id);
		}
	},
});

/** A vendor id (OA, guest) no other test, repeat or earlier run uses. */
function uniqueId(kind: string): string {
	return `e2e-greeting-${kind}-${randomUUID()}`;
}

function guestOf(request: APIRequestContext, oaId: string): Guest {
	const id = uniqueId("guest");
	const guest: Guest = {
		id,
		texts: [],
		signed: (text) => signedZaloText({ guestId: id, oaId, text }),
		write: async (text = `Hello from ${id}`) => {
			await deliverZalo(request, guest.signed(text));
			guest.texts.push(text);
			return text;
		},
		echoFromOffice: (text, msgId = randomUUID()) =>
			deliverZalo(request, signedZaloEcho({ oaId, guestId: id, text, msgId })),
	};
	return guest;
}

/** The office's own message to a guest, echoed by Zalo as it signs it (`oa_send_text`). */
function signedZaloEcho(message: { oaId: string; guestId: string; text: string; msgId: string }) {
	const appId = process.env.ZALO_APP_ID;
	const secret = process.env.ZALO_OA_SECRET_KEY;
	if (!appId || !secret)
		throw new Error("ZALO_APP_ID and ZALO_OA_SECRET_KEY come from the E2E env");
	const timestamp = String(Date.now());
	const body = JSON.stringify({
		app_id: appId,
		event_name: "oa_send_text",
		timestamp,
		sender: { id: message.oaId },
		recipient: { id: message.guestId },
		message: { text: message.text, msg_id: message.msgId },
	});
	const mac = createHash("sha256")
		.update(appId + body + timestamp + secret)
		.digest("hex");
	return {
		body,
		headers: { "content-type": "application/json", "X-ZEvent-Signature": `mac=${mac}` },
	};
}

/* ---------------------------------------------------------------- the thread, as the manager reads it */

type ListedThread = {
	id: string;
	guestId: string;
	owner: unknown;
	unansweredInboundId: string | null;
};
type Message = { direction: "in" | "out"; text: string };

function threadAddress(threadId: string) {
	return `/api/conversations/${encodeURIComponent(threadId)}`;
}

/** Who a thread is with, as the conversations API knows them: a Zalo id, or a WhatsApp number. */
type GuestRef = Pick<Guest, "id">;

/** The guest's thread as the manager's conversations API lists it, once it is there. */
async function threadOf(manager: Api, guest: GuestRef): Promise<ListedThread> {
	let thread: ListedThread | undefined;
	await expect(async () => {
		const res = await manager.get("/api/conversations");
		expect(res.status(), "the manager lists the office's threads").toBe(200);
		thread = ((await res.json()) as ListedThread[]).find((t) => t.guestId === guest.id);
		expect(thread, `the manager lists ${guest.id}`).toBeDefined();
	}).toPass({ timeout: 10_000 });
	return thread!;
}

/** Every message of the thread, in order, as the manager opens it. */
async function messagesOf(manager: Api, threadId: string): Promise<Message[]> {
	const res = await manager.get(threadAddress(threadId));
	expect(res.status(), "the manager opens the thread").toBe(200);
	return ((await res.json()) as { messages: Message[] }).messages;
}

/** The office's messages in the thread (no human replies in these flows: the greeting, or an echo). */
async function officeMessages(manager: Api, threadId: string): Promise<Message[]> {
	return (await messagesOf(manager, threadId)).filter((m) => m.direction === "out");
}

/** The office greets the guest within seconds: the thread's one office message, once it is there. */
async function greetingOf(manager: Api, guest: GuestRef): Promise<Message> {
	const { id } = await threadOf(manager, guest);
	await expect
		.poll(async () => (await officeMessages(manager, id)).length, {
			message: `the office greets ${guest.id} within seconds of their first message`,
			...WITHIN_SECONDS,
		})
		.toBeGreaterThan(0);
	return (await officeMessages(manager, id))[0];
}

/** The thread holds this many of the guest's messages: the last one they wrote has arrived. */
async function guestMessagesArrived(manager: Api, threadId: string, count: number) {
	await expect
		.poll(
			async () => (await messagesOf(manager, threadId)).filter((m) => m.direction === "in").length,
			{ message: `the thread holds the guest's ${count} messages` },
		)
		.toBe(count);
}

/** The manager approves a reply to the guest's waiting message (a mock send in E2E). */
async function approveAsManager(manager: Api, guest: GuestRef, reply: string) {
	const thread = await threadOf(manager, guest);
	expect(thread.unansweredInboundId, "a message of the guest's waits on a reply").not.toBeNull();
	const res = await manager.post(`${threadAddress(thread.id)}/approve`, {
		inboundId: thread.unansweredInboundId,
		reply,
	});
	expect(res.status(), "the manager's reply is sent").toBe(200);
}

function lastLine(text: string): string {
	return text.trim().split("\n").at(-1)!.trim();
}

/* ---------------------------------------------------------------- the Inbox */

function threadList(page: Page) {
	return page.getByRole("complementary");
}

function openThread(page: Page) {
	return page.getByRole("article");
}

function rowOf(page: Page, guest: Guest) {
	return threadList(page).getByRole("button", { name: new RegExp(`^${guest.id}\\b`) });
}

/**
 * A view button of the Inbox (Your turn, which a manager's names Waiting (#210) / Sent / All),
 * with its count when given.
 */
function view(page: Page, name: "Your turn" | "Waiting" | "Sent" | "All", count?: number) {
	return page.getByRole("button", {
		name: count === undefined ? new RegExp(`^${name} \\d+$`) : `${name} ${count}`,
		exact: count !== undefined,
	});
}

/** The amber number beside Inbox in the sidebar. */
function navCount(page: Page) {
	return page.getByRole("link", { name: /^Inbox\b/ }).getByTestId("nav-your-turn-count");
}

/** The Inbox, with its threads loaded. */
async function openInbox(page: Page) {
	await page.goto("/en/inbox");
	await expect(
		// An empty Inbox shows both its view buttons and the empty text: either one will do.
		threadList(page).getByRole("button").or(page.getByTestId("inbox-empty")).first(),
	).toBeVisible();
}

/** The manager opens the guest's thread from the Inbox (under All), their first message showing. */
async function openThreadOf(page: Page, guest: Guest) {
	await openInbox(page);
	await view(page, "All").click();
	await expect(view(page, "All")).toHaveAttribute("aria-pressed", "true");
	await page.getByRole("textbox", { name: saas.inbox.searchAria }).fill(guest.id);
	await expect(rowOf(page, guest), `the manager has ${guest.id}'s thread`).toBeVisible();
	await rowOf(page, guest).click();
	await expect(openThread(page).getByText(guest.texts[0], { exact: true })).toBeVisible();
}

/** Messages in the open thread whose meta line says where they came from (exactly this). */
function sourced(page: Page, source: string) {
	return openThread(page)
		.getByTestId("message-source")
		.filter({ hasText: new RegExp(`^${source}$`) });
}

/** The reply box of the open thread: what the manager would send. */
function replyBox(page: Page) {
	return openThread(page).getByRole("textbox", { name: saas.inbox.reply, exact: true });
}

/**
 * Home, read afresh, as the manager reads it: the funnel by stage, and the Response time
 * section as read aloud (how many leads were answered, and each band with its count).
 */
async function readHome(page: Page): Promise<{
	funnel: Record<string, number>;
	responseTime: string;
}> {
	await page.goto("/en/home");
	const main = page.getByRole("main");
	await expect(main.getByRole("heading", { name: saas.home.waitingNow })).toBeVisible();
	const funnelList = main.getByRole("list", { name: saas.home.funnel.title });
	await expect(funnelList).toBeVisible();
	const said = await funnelList.ariaSnapshot();
	const funnel: Record<string, number> = {};
	for (const match of said.matchAll(/paragraph: \d+ (.+)\n\s*- paragraph: "(\d+)"/g)) {
		funnel[match[1]] = Number(match[2]);
	}
	const allSaid = await main.ariaSnapshot();
	const responseAt = allSaid.indexOf(`heading "${saas.home.responseTime}"`);
	expect(responseAt, "Home shows Response time").toBeGreaterThanOrEqual(0);
	return { funnel, responseTime: allSaid.slice(responseAt) };
}

/** Home's funnel, read afresh, by stage (as the manager reads it). */
async function funnelOnHome(page: Page): Promise<Record<string, number>> {
	return (await readHome(page)).funnel;
}

/** "1 lead answered", as Home words the count of answered leads. */
function answeredLeads(count: number): string {
	return saas.home.answered.replace(
		/\{count, plural, one \{([^}]*)\} other \{([^}]*)\}\}/,
		(_, one: string, other: string) => (count === 1 ? one : other).replaceAll("#", String(count)),
	);
}

// ---------------------------------------------------------------------------------------

test.describe.configure({ timeout: 120_000 });

// scenario: docs/e2e-scenarios.md First greeting 1
test.describe("First greeting 1 — a new guest is greeted at once, and it's still their turn", () => {
	test("a guest writing in English to rent in Tay Ho gets one office message within seconds: it acknowledges renting in Tây Hồ, asks about budget then move-in, has no digit, ends with the office's auto-reply label and is marked Auto-reply · Template · Demo send; the thread is still Your turn with no owner, the nav counts it and Sent is 0", async ({
		office,
	}) => {
		const { manager } = office;
		const guest = office.newGuest();
		await guest.write("Hi, we're looking to rent an apartment in Tay Ho");

		const greeting = await greetingOf(manager.api, guest);
		const { id: threadId } = await threadOf(manager.api, guest);
		expect(await messagesOf(manager.api, threadId), "the thread holds two messages").toHaveLength(
			2,
		);

		// What it says.
		const { text } = greeting;
		expect(text, "it thanks the guest").toMatch(/thank/i);
		expect(text, "it acknowledges renting").toMatch(/\brent/i);
		expect(text, "it acknowledges Tây Hồ").toContain("Tây Hồ");
		const budget = text.indexOf("What budget do you have in mind?");
		const moveIn = text.indexOf("When would you like to move in?");
		expect(budget, "it asks about budget").toBeGreaterThanOrEqual(0);
		expect(moveIn, "it asks about move-in").toBeGreaterThan(budget);
		expect(text.match(/[?？]/g) ?? [], "two questions at most").toHaveLength(2);
		expect(text, "no digit of any script").not.toMatch(/\p{Nd}/u);
		expect(lastLine(text), "its last line is the office's label").toBe(EN_LABEL);

		// The queue doesn't move.
		const listed = await threadOf(manager.api, guest);
		expect(listed.unansweredInboundId, "still the guest's turn").not.toBeNull();
		expect(listed.owner, "no owner").toBeNull();

		const { page } = manager;
		await openInbox(page);
		await expect(view(page, "Waiting", 1), "the manager's Waiting counts it").toBeVisible();
		await expect(view(page, "Sent", 0), "nothing is Sent").toBeVisible();
		await expect(navCount(page), "the nav counts it").toHaveText("1");
		await expect(rowOf(page, guest).getByTestId("thread-owner")).toHaveAttribute(
			"data-owner",
			"unassigned",
		);

		// In the thread: the office's message, marked Auto-reply, Template and the mock badge.
		await openThreadOf(page, guest);
		await expect(sourced(page, saas.inbox.source.autoReply)).toHaveCount(1);
		await expect(
			openThread(page).getByText(saas.inbox.autoReply.template, { exact: true }),
		).toHaveCount(1);
		await expect(openThread(page).getByText(saas.inbox.mock, { exact: true })).toHaveCount(1);
		await expect(openThread(page).getByText(EN_LABEL)).toBeVisible();
	});
});

// scenario: docs/e2e-scenarios.md First greeting 2
test.describe("First greeting 2 — only the first message is greeted", () => {
	test("the guest writes again after the greeting: no second auto-reply (judged once a later guest has been greeted)", async ({
		office,
	}) => {
		const { manager } = office;
		const guest = office.newGuest();
		await guest.write("Hi, we're looking to rent an apartment in Tay Ho");
		await greetingOf(manager.api, guest);

		await guest.write("Also, is parking included?");
		const { id: threadId } = await threadOf(manager.api, guest);
		await expect
			.poll(async () => (await messagesOf(manager.api, threadId)).length)
			.toBeGreaterThanOrEqual(3);

		// A later guest's greeting has arrived, so one for the second message would have too.
		const later = office.newGuest();
		await later.write();
		await greetingOf(manager.api, later);

		const messages = await messagesOf(manager.api, threadId);
		expect(
			messages.filter((m) => m.direction === "in"),
			"both guest messages",
		).toHaveLength(2);
		expect(
			messages.filter((m) => m.direction === "out"),
			"exactly one auto-reply",
		).toHaveLength(1);
		await openThreadOf(manager.page, guest);
		await expect(sourced(manager.page, saas.inbox.source.autoReply)).toHaveCount(1);
	});

	test("a new guest's first two messages delivered at the same moment get one auto-reply", async ({
		office,
	}) => {
		const { manager } = office;
		const guest = office.newGuest();
		const [first, second] = ["Hello, I'm looking for an apartment", "to rent in Tay Ho"];
		await Promise.all([
			deliverZalo(manager.page.request, guest.signed(first)),
			deliverZalo(manager.page.request, guest.signed(second)),
		]);
		guest.texts.push(first, second);

		await greetingOf(manager.api, guest);
		const later = office.newGuest();
		await later.write();
		await greetingOf(manager.api, later);

		const { id: threadId } = await threadOf(manager.api, guest);
		const messages = await messagesOf(manager.api, threadId);
		expect(
			messages.filter((m) => m.direction === "in").map((m) => m.text),
			"both of the guest's messages arrived",
		).toEqual(expect.arrayContaining([first, second]));
		expect(
			messages.filter((m) => m.direction === "out"),
			"exactly one auto-reply",
		).toHaveLength(1);
	});

	test("a thread whose first message is the office's own app message (an oa_send_text echo) gets no auto-reply when the guest then writes", async ({
		office,
	}) => {
		const { manager } = office;
		const guest = office.newGuest();
		const fromApp = `Hello from the office's Zalo app, ${guest.id}`;
		await guest.echoFromOffice(fromApp);

		// The thread begins with the office's message.
		const { id: threadId } = await threadOf(manager.api, guest);
		expect(
			await messagesOf(manager.api, threadId),
			"the thread starts with the office's message",
		).toEqual([expect.objectContaining({ direction: "out", text: fromApp })]);

		await guest.write("Hi, we're looking to rent an apartment in Tay Ho");
		// A later guest's greeting has arrived, so one for this guest would have too.
		const later = office.newGuest();
		await later.write();
		await greetingOf(manager.api, later);

		const messages = await messagesOf(manager.api, threadId);
		expect(
			messages.filter((m) => m.direction === "in"),
			"the guest's message arrived",
		).toHaveLength(1);
		expect(
			messages.filter((m) => m.direction === "out").map((m) => m.text),
			"no auto-reply: the office's own message is its only one",
		).toEqual([fromApp]);
		await openThreadOf(manager.page, guest);
		await expect(sourced(manager.page, saas.inbox.source.autoReply)).toHaveCount(0);
	});
});

// scenario: docs/e2e-scenarios.md First greeting 3
test.describe("First greeting 3 — the greeting counts nowhere in the funnel", () => {
	test("after the auto-reply Home reads Leads in 1, Engaged 0, In conversation 0 and no answered lead; the guest writing back before a human reply leaves In conversation 0; the manager's reply makes Engaged 1, its response time timed from the guest's first message (20 minutes earlier: the 15–60 min band, not under 5 min); the guest writing again makes In conversation 1", async ({
		office,
		request,
	}) => {
		test.setTimeout(180_000);
		const { manager } = office;
		const { page } = manager;

		// A WhatsApp guest, so their first message can be written 20 minutes before the reply:
		// a response time timed from their later message, or to the auto-reply, then reads
		// differently (Zalo's signature refuses a backdated message).
		const phoneNumberId = newWhatsAppNumber("greeting");
		await connectWhatsAppNumber(office.id, phoneNumberId);
		const whatsAppGuest = newWhatsAppGuest();
		const guest: GuestRef = { id: whatsAppGuest.phone };
		const write = (text: string, at?: Date) =>
			sendWhatsAppText(request, { phoneNumberId, guest: whatsAppGuest, text, at });

		await write(
			"Hi, we're looking to rent an apartment in Tay Ho",
			new Date(Date.now() - 20 * 60_000),
		);
		await greetingOf(manager.api, guest);
		const { id: threadId } = await threadOf(manager.api, guest);

		// After the auto-reply: one lead, nobody engaged, no answered lead.
		const greeted = await readHome(page);
		expect(
			greeted.funnel,
			"after the auto-reply: one lead in, none engaged or in conversation",
		).toMatchObject({
			[saas.home.funnel.leadsIn]: 1,
			[saas.home.funnel.engaged]: 0,
			[saas.home.funnel.inConversation]: 0,
		});
		expect(greeted.responseTime, "no lead answered under Response time").toContain(
			saas.home.noResponseTime,
		);

		// The guest writes back before any human reply: not a conversation yet.
		await write("Also, is parking included?");
		await guestMessagesArrived(manager.api, threadId, 2);
		const wroteBack = await readHome(page);
		expect(
			wroteBack.funnel,
			"the guest wrote back to the auto-reply only: still In conversation 0",
		).toMatchObject({
			[saas.home.funnel.leadsIn]: 1,
			[saas.home.funnel.engaged]: 0,
			[saas.home.funnel.inConversation]: 0,
		});
		expect(wroteBack.responseTime, "still no lead answered").toContain(saas.home.noResponseTime);

		// The manager approves a reply: engaged, answered about 20 minutes after the first message.
		await approveAsManager(
			manager.api,
			guest,
			"Parking is something a colleague will check for you.",
		);
		const repliedAt = Date.now();
		const replied = await readHome(page);
		expect(replied.funnel, "a human reply: Engaged 1, not yet In conversation").toMatchObject({
			[saas.home.funnel.leadsIn]: 1,
			[saas.home.funnel.engaged]: 1,
			[saas.home.funnel.inConversation]: 0,
		});
		expect(replied.responseTime, "one lead answered").toContain(answeredLeads(1));
		expect(
			replied.responseTime,
			`answered 15–60 minutes after the guest's first message:\n${replied.responseTime}`,
		).toContain(`${saas.home.spread.from15to60m} 1100%`);
		expect(
			replied.responseTime,
			`not under 5 minutes, as timed from the guest's later message:\n${replied.responseTime}`,
		).toContain(`${saas.home.spread.under5m} 00%`);

		// The guest writes again after the human reply: In conversation. WhatsApp times a message
		// in whole seconds, so they write once the reply's second is over (else it reads as
		// written before the reply).
		await expect
			.poll(() => Date.now(), { message: "the reply's second is over" })
			.toBeGreaterThan(repliedAt + 1_000);
		await write("Great, when could we see it?");
		await guestMessagesArrived(manager.api, threadId, 3);
		const again = await readHome(page);
		expect(again.funnel, "the guest wrote after the human reply: In conversation 1").toMatchObject({
			[saas.home.funnel.leadsIn]: 1,
			[saas.home.funnel.engaged]: 1,
			[saas.home.funnel.inConversation]: 1,
		});
	});
});

/** A letter only Vietnamese uses (ADR 0021, R4): ă â đ ơ ư, a hook above or a dot below, ẽ ĩ ũ ỹ, a tone on ă â ê ô ơ ư. */
const VIETNAMESE_ONLY = /[ăâđơưảẻỉỏủỷạẹịọụỵẽĩũỹắằẳẵặấầẩẫậếềểễệốồổỗộớờởỡợứừửữự]/iu;
const KANA = /[\p{Script=Hiragana}\p{Script=Katakana}]/u;
const HANGUL = /\p{Script=Hangul}/u;
const CYRILLIC = /\p{Script=Cyrillic}/u;

// scenario: docs/e2e-scenarios.md First greeting 4
test.describe("First greeting 4 — the guest's language picks the greeting", () => {
	test("Vietnamese, Japanese, Korean and Russian guests are greeted in their language, label included; French and Spanish guests get the English greeting", async ({
		office,
	}) => {
		const { manager } = office;
		const cases = [
			{
				language: "Vietnamese",
				text: "Chào anh, tôi muốn thuê căn hộ ở Tây Hồ",
				script: VIETNAMESE_ONLY,
			},
			{ language: "Japanese", text: "こんにちは、タイホーでアパートを借りたいです", script: KANA },
			{
				language: "Korean",
				text: "안녕하세요, 떠이호에서 아파트를 임대하고 싶어요",
				script: HANGUL,
			},
			{
				language: "Russian",
				text: "Здравствуйте, мы хотим снять квартиру в Тайхо",
				script: CYRILLIC,
			},
			{ language: "French", text: "Bonjour, je cherche un appartement à louer", script: null },
			{ language: "Spanish", text: "Hola, busco un apartamento, está disponible?", script: null },
		] as const;
		const guests = cases.map((c) => ({ ...c, guest: office.newGuest() }));
		for (const { guest, text } of guests) {
			await guest.write(text);
		}

		for (const { language, guest, script } of guests) {
			await test.step(`${language}`, async () => {
				const { text } = await greetingOf(manager.api, guest);
				const label = lastLine(text);
				if (script) {
					expect.soft(text, `the ${language} greeting is in ${language}`).toMatch(script);
					expect.soft(label, `the ${language} label is in ${language}`).toMatch(script);
					expect.soft(label, `the ${language} label names the office`).toContain(OFFICE_NAME);
					expect.soft(label, `the ${language} label is not the English one`).not.toBe(EN_LABEL);
				} else {
					expect.soft(label, `the ${language} guest is greeted in English`).toBe(EN_LABEL);
					expect
						.soft(text, `the ${language} greeting has no Vietnamese-only letter`)
						.not.toMatch(VIETNAMESE_ONLY);
				}
			});
		}
	});
});

/* ---------------------------------------------------------------- the auto-reply switch (First greeting 5) */

/** The user menu's way to the office's settings (decided 2026-10-06, #167), beside "Team". */
const OFFICE_SETTINGS = "Office settings";

/** The switch's label on the office's settings, General tab (#167). */
const AUTO_REPLY_SWITCH = "Auto-reply to a new guest's first message";

/** Today's first-reply template, as the reply box holds it for a thread with no auto-reply. */
const FIRST_REPLY_TEMPLATE_START = /^Thanks for writing\b/;

/** The office's settings, General tab, where a manager finds the switch. */
function settingsAddress(office: GreetingOffice) {
	return `/en/${office.slug}/settings/general`;
}

function autoReplySwitch(page: Page) {
	return page.getByRole("switch", { name: AUTO_REPLY_SWITCH });
}

function replyBoxOnPage(page: Page) {
	return page.getByRole("textbox", { name: saas.inbox.reply });
}

function officeSettingsItem(page: Page) {
	return page.getByRole("menuitem", { name: OFFICE_SETTINGS, exact: true });
}

/** The user menu (the ⋯ beside the person's name in the sidebar), open, its items listed. */
async function openUserMenu(page: Page) {
	await page.getByRole("button", { name: "User menu" }).click();
	await expect(page.getByRole("menuitem", { name: "Log out" })).toBeVisible();
}

/**
 * The manager flips the switch on the office's settings page: it saves at once, with no Save
 * button, and a reload shows the saved state.
 */
async function switchAutoReply(page: Page, on: boolean) {
	const toggle = autoReplySwitch(page);
	await expect(
		toggle,
		`the switch is ${on ? "off" : "on"} before the manager flips it`,
	).toBeChecked({ checked: !on });
	const saved = page.waitForResponse(
		(r) => r.url().endsWith("/api/office/auto-reply") && r.request().method() === "PUT",
		{ timeout: 10_000 },
	);
	await toggle.click();
	expect((await saved).status(), "flipping the switch saves it at once").toBe(200);
	await expect(toggle).toBeChecked({ checked: on });
	await page.reload();
	await expect(autoReplySwitch(page), `a reload shows it ${on ? "on" : "off"}`).toBeChecked({
		checked: on,
	});
}

/** `PUT /api/office/auto-reply` as whoever `request` is signed in as, with the app's Origin. */
function putAutoReply(request: APIRequestContext, on: boolean) {
	return request.put("/api/office/auto-reply", {
		data: { on },
		headers: { origin: appOrigin() },
	});
}

// scenario: docs/e2e-scenarios.md First greeting 5
test.describe("First greeting 5 — a manager turns the auto-reply off", () => {
	test("the manager switches the auto-reply off from Office settings: a new guest gets no auto-reply and the reply box holds the first-reply template; switched back on, the next new guest is greeted, and the guest who wrote while it was off writes again and is still not greeted (S1)", async ({
		office,
	}) => {
		const { manager } = office;
		const { page } = manager;

		await test.step("the manager reaches the switch from the user menu: on by default", async () => {
			await openInbox(page);
			await openUserMenu(page);
			await expect(officeSettingsItem(page), "the user menu offers Office settings").toBeVisible();
			await officeSettingsItem(page).click();
			await expect(page).toHaveURL(new RegExp(`/en/${office.slug}/settings/general$`));
			await expect(autoReplySwitch(page), "the auto-reply is on by default").toBeChecked();
		});

		await test.step("switched off", () => switchAutoReply(page, false));

		const offGuest = office.newGuest();
		await test.step("a new guest writes while it is off: the reply box holds the first-reply template", async () => {
			await offGuest.write("Hi, we're looking to rent an apartment in Tay Ho");
			await threadOf(manager.api, offGuest);
			await openThreadOf(page, offGuest);
			await expect(replyBoxOnPage(page), "the reply box holds today's first reply").toHaveValue(
				FIRST_REPLY_TEMPLATE_START,
			);
		});

		await test.step("switched back on", async () => {
			await page.goto(settingsAddress(office));
			await switchAutoReply(page, true);
		});

		const { id: offThreadId } = await threadOf(manager.api, offGuest);
		await test.step("the guest whose thread began while it was off writes again (S1)", async () => {
			await offGuest.write("Also, is parking included?");
			await expect
				.poll(
					async () =>
						(await messagesOf(manager.api, offThreadId)).filter((m) => m.direction === "in").length,
					{ message: "both of the off guest's messages arrived" },
				)
				.toBe(2);
		});

		await test.step("the next new guest is greeted", async () => {
			const next = office.newGuest();
			await next.write("Hi, we're looking to rent an apartment in Tay Ho");
			const greeting = await greetingOf(manager.api, next);
			expect(lastLine(greeting.text), "the office's auto-reply").toBe(EN_LABEL);
		});

		// The next guest's greeting has arrived, so one for either of the off guest's messages
		// would have too.
		await test.step("the guest who wrote while it was off has no auto-reply", async () => {
			expect(
				await officeMessages(manager.api, offThreadId),
				"no auto-reply: not while it was off, nor after it came back on (S1)",
			).toEqual([]);
			await openThreadOf(page, offGuest);
			await expect(sourced(page, saas.inbox.source.autoReply)).toHaveCount(0);
		});
	});

	test("an agent has no Office settings in the user menu and no switch on the office's settings page, where the manager has both", async ({
		office,
		admin,
		browser,
	}) => {
		const agent = await joinOffice(admin, browser, office.id, "member", "greeting-agent");
		try {
			// The agent first: each absence judged once the menu, or the page, has shown.
			await openUserMenu(agent.page);
			await expect(officeSettingsItem(agent.page), "no Office settings for an agent").toHaveCount(
				0,
			);
			await agent.page.goto(settingsAddress(office));
			await expect(agent.page.getByRole("heading").first()).toBeVisible();
			await expect(autoReplySwitch(agent.page), "no switch for an agent").toHaveCount(0);
			await expect(agent.page.getByTestId("auto-reply-switch")).toHaveCount(0);

			// The manager of the same office, on the same page: both are there.
			const { page } = office.manager;
			await openInbox(page);
			await openUserMenu(page);
			await expect(officeSettingsItem(page), "the manager's user menu offers it").toBeVisible();
			await page.goto(settingsAddress(office));
			await expect(autoReplySwitch(page), "the manager has the switch").toBeVisible();
			await expect(page.getByTestId("auto-reply-switch")).toBeVisible();
		} finally {
			await agent.close();
		}
	});

	test("PUT /api/office/auto-reply refuses a signed-out caller (401) and an agent (403), and a new guest is still greeted; the manager's turns it off (200 { on: false }), as the settings page then shows, and an agent can't turn it back on", async ({
		office,
		admin,
		browser,
		request,
	}) => {
		const { manager } = office;
		const agent = await joinOffice(admin, browser, office.id, "member", "greeting-agent");
		try {
			const signedOut = await putAutoReply(request, false);
			expect.soft(signedOut.status(), "signed out, the API refuses").toBe(401);
			const byAgent = await putAutoReply(agent.page.request, false);
			expect.soft(byAgent.status(), "an agent is refused").toBe(403);

			// Refused, so nothing changed: a new guest is still greeted.
			const guest = office.newGuest();
			await guest.write();
			await greetingOf(manager.api, guest);

			const byManager = await putAutoReply(manager.page.request, false);
			expect(byManager.status(), "the manager turns it off").toBe(200);
			expect(await byManager.json()).toMatchObject({ on: false });
			await manager.page.goto(settingsAddress(office));
			await expect(autoReplySwitch(manager.page), "the settings page shows it off").toBeChecked({
				checked: false,
			});

			const agentOn = await putAutoReply(agent.page.request, true);
			expect(agentOn.status(), "an agent can't turn it back on").toBe(403);
			await manager.page.reload();
			await expect(autoReplySwitch(manager.page), "still off").toBeChecked({ checked: false });
		} finally {
			await agent.close();
		}
	});
});

// scenario: docs/e2e-scenarios.md First greeting 6
test.describe("First greeting 6 — no greeting on a disconnected pipe", () => {
	test("with one of the office's Zalo OAs disconnected, a new guest's first message on it arrives and is Your turn, with no auto-reply (judged once a guest on the office's connected OA has been greeted)", async ({
		office,
	}) => {
		const { manager } = office;
		const downOa = await office.newOa("disconnected");
		const guest = office.newGuest(downOa);
		await guest.write("Hi, we're looking to rent an apartment in Tay Ho");

		// The message arrives, and it is the guest's turn.
		const thread = await threadOf(manager.api, guest);
		expect(thread.unansweredInboundId, "the guest's message waits on a reply").not.toBeNull();

		// A guest on the office's connected OA is greeted, so this one would have been by now.
		const later = office.newGuest();
		await later.write();
		await greetingOf(manager.api, later);

		expect(
			await officeMessages(manager.api, thread.id),
			"no auto-reply on the disconnected OA",
		).toEqual([]);
		expect(
			(await threadOf(manager.api, guest)).unansweredInboundId,
			"still Your turn",
		).not.toBeNull();
		await openThreadOf(manager.page, guest);
		await expect(sourced(manager.page, saas.inbox.source.autoReply)).toHaveCount(0);
	});
});

// scenario: docs/e2e-scenarios.md First greeting 7
test.describe("First greeting 7 — the greeting's echo is not a reply", () => {
	test("Zalo echoes the auto-reply back with its message id: the thread still holds one auto-reply and no app reply, stays Your turn, and Home's Engaged stays 0", async ({
		office,
	}) => {
		const { manager } = office;
		const guest = office.newGuest();
		await guest.write("Hi, we're looking to rent an apartment in Tay Ho");
		const greeting = await greetingOf(manager.api, guest);
		const { id: threadId } = await threadOf(manager.api, guest);

		// In a mock deployment the auto-reply's vendor message id is mock-auto-reply-<thread id>.
		await guest.echoFromOffice(greeting.text, `mock-auto-reply-${threadId}`);

		expect(
			await officeMessages(manager.api, threadId),
			"still one office message: the greeting",
		).toHaveLength(1);
		expect(
			(await threadOf(manager.api, guest)).unansweredInboundId,
			"still Your turn",
		).not.toBeNull();

		const { page } = manager;
		await openThreadOf(page, guest);
		await expect(sourced(page, saas.inbox.source.autoReply), "one auto-reply").toHaveCount(1);
		await expect(sourced(page, saas.inbox.source.oaEcho), "no app reply").toHaveCount(0);
		await openInbox(page);
		await expect(view(page, "Waiting", 1)).toBeVisible();
		await expect(view(page, "Sent", 0)).toBeVisible();

		const funnel = await funnelOnHome(page);
		expect(funnel[saas.home.funnel.leadsIn], "one lead in").toBe(1);
		expect(funnel[saas.home.funnel.engaged], "Engaged stays 0").toBe(0);
	});
});

// scenario: docs/e2e-scenarios.md First greeting 8
test.describe("First greeting 8 — after the greeting, the reply box doesn't greet again", () => {
	test("the manager opens a greeted guest's thread: the reply box holds the follow-up template (as on a thread a human already answered), never the first-reply template's \"Thanks for writing\"; the guest writes again and the box still holds the follow-up template", async ({
		office,
	}) => {
		test.setTimeout(180_000);
		const { manager } = office;
		const { page } = manager;
		const first = "Hi, we're looking to rent an apartment in Tay Ho";
		const again = "Are you there?";

		// The follow-up template, as the reply box shows it where nobody disputes it is a follow-up:
		// a guest who wrote the same, was greeted, got a human reply and wrote the same again.
		const answered = office.newGuest();
		await answered.write(first);
		await greetingOf(manager.api, answered);
		await approveAsManager(manager.api, answered, "A colleague will be with you shortly.");
		const { id: answeredThread } = await threadOf(manager.api, answered);
		await answered.write(again);
		await guestMessagesArrived(manager.api, answeredThread, 2);
		await openThreadOf(page, answered);
		await expect(
			replyBox(page),
			"the answered guest's reply box holds a suggestion",
		).not.toHaveValue("");
		const followUpTemplate = await replyBox(page).inputValue();
		expect(followUpTemplate, "the follow-up template is not the first-reply template").not.toMatch(
			FIRST_REPLY_TEMPLATE,
		);

		// A new guest, greeted: the reply box takes the follow-up path at once.
		const guest = office.newGuest();
		await guest.write(first);
		await greetingOf(manager.api, guest);
		const { id: threadId } = await threadOf(manager.api, guest);
		await openThreadOf(page, guest);
		await expect(
			replyBox(page),
			"after the greeting, the box holds the follow-up template",
		).toHaveValue(followUpTemplate, WITHIN_SECONDS);
		await expect(replyBox(page), "after the greeting, the box doesn't greet again").not.toHaveValue(
			FIRST_REPLY_TEMPLATE,
		);

		// The guest writes again before anyone answers: still the follow-up template.
		await guest.write(again);
		await guestMessagesArrived(manager.api, threadId, 2);
		await openThreadOf(page, guest);
		await expect(
			openThread(page).getByText(again, { exact: true }),
			"the guest's second message is in the thread",
		).toBeVisible();
		await expect(replyBox(page), "the box still holds the follow-up template").toHaveValue(
			followUpTemplate,
			WITHIN_SECONDS,
		);
		await expect(replyBox(page), "the box still doesn't greet").not.toHaveValue(
			FIRST_REPLY_TEMPLATE,
		);
	});
});
