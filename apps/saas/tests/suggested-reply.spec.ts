import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import type { APIRequestContext, Locator, Page } from "@playwright/test";

import { assignerAs } from "./support/assign";
import type { Locale } from "./support/copy";
import { expect, test as base } from "./support/fixtures";
import { setNameGuestsSee } from "./support/name-guests-see";
import { setOfficeLanguage } from "./support/office-language";
import { deleteOffice } from "./support/offices";
import type { Joined } from "./support/operators";
import { joinOffice } from "./support/operators";
import { connectZaloOa, releaseZaloOa } from "./support/pipes";
import type { Api } from "./support/session";
import { sendZaloText } from "./support/zalo";

/* ---------------------------------------------------------------- what the scenarios promise */

/** The office every thread here belongs to (docs/e2e-scenarios.md, Suggested reply template). */
const OFFICE_NAME = "Saigon Prime Test";

/**
 * The office's agent and manager, each with an account name and a "name guests see" of their own
 * (Name guests see, #266), so the two are told apart (an invited account is "E2E Invitee"). The
 * template introduces an owner by their name guests see, never by a word of their account name.
 */
const AGENT = { name: "Lan Pham", nameGuestsSee: "Lan" } as const;
const MANAGER = { name: "Minh Tran", nameGuestsSee: "Minh" } as const;

/**
 * The template's intro, as the scenarios' EN copy words it. A Zalo guest has no profile name, so
 * the template greets them with none.
 */
const OFFICE_INTRO = `Hi, this is ${OFFICE_NAME}.`;
const AGENT_INTRO = `Hi, I'm ${AGENT.nameGuestsSee} from ${OFFICE_NAME}.`;

/**
 * The label above the reply box while it holds the template (ADR 0024, "The label"), written out
 * rather than read from saas.json: the wording is the contract. The VI wording is pending #78.
 */
const TEMPLATE_LABEL: Record<Locale, string> = {
	en: "Suggested reply · template",
	vi: "Gợi ý trả lời · mẫu",
};

/** The guest's first message: the auto-reply to it asks for the budget, then move-in. */
const FIRST_MESSAGE = "Hi, we're looking to rent an apartment in Tay Ho";

/** The greeting goes out "within seconds"; a production build under load gets a margin. */
const WITHIN_SECONDS = { timeout: 20_000 };

/** A change the Inbox learns of by its poll: three production polls, for CI's margin. */
const WITHIN_POLLS = { timeout: 30_000 };

/**
 * The reply box's own name, which is how a person finds it, not what a scenario promises
 * (packages/i18n/translations/<locale>/saas.json, `inbox.reply`).
 */
function replyLabel(locale: Locale): string {
	const saas = JSON.parse(
		fs.readFileSync(
			path.resolve(__dirname, `../../../packages/i18n/translations/${locale}/saas.json`),
			"utf8",
		),
	) as { inbox: { reply: string } };
	return saas.inbox.reply;
}

/* ---------------------------------------------------------------- the office and its guests */

type Guest = { id: string; write: (text: string) => Promise<void> };

/** An operator of the office, signed in, with an account name and a name guests see of their own. */
type Operator = Joined & { name: string; nameGuestsSee: string };

/**
 * An office of the test's own named "Saigon Prime Test" (deleted afterwards), with its own Zalo
 * OA (released afterwards), an invited manager (the kit's `admin`) named Minh Tran, whom guests
 * see as Minh, and an invited agent named Lan Pham, whom guests see as Lan. The auto-reply is on,
 * by default.
 */
type TemplateOffice = { manager: Operator; agent: Operator; newGuest: () => Guest };

const test = base.extend<{ office: TemplateOffice }>({
	office: async ({ admin, browser, request }, use) => {
		const created = await admin.api.post("/api/auth/organization/create", {
			name: OFFICE_NAME,
			slug: `e2e-suggest-${randomUUID()}`,
		});
		expect(created.status(), `the platform admin creates "${OFFICE_NAME}"`).toBe(200);
		const { id } = (await created.json()) as { id: string };
		const oaId = uniqueId("oa");
		const joined: Joined[] = [];
		try {
			await connectZaloOa(id, oaId);
			const join = async (
				role: "member" | "admin",
				who: { name: string; nameGuestsSee: string },
			): Promise<Operator> => {
				const operator = await joinOffice(admin, browser, id, role, `suggest-${role}`);
				joined.push(operator);
				const renamed = await operator.api.post("/api/auth/update-user", { name: who.name });
				expect(renamed.ok(), `${who.name} takes their name (${renamed.status()})`).toBe(true);
				// The name the template introduces them by (Name guests see, "How these run").
				await setNameGuestsSee(operator.page.request, who.nameGuestsSee);
				return { ...operator, ...who };
			};
			const [manager, agent] = await Promise.all([join("admin", MANAGER), join("member", AGENT)]);
			await use({ manager, agent, newGuest: () => guestOf(request, oaId) });
		} finally {
			for (const operator of joined) {
				await operator.close();
			}
			await releaseZaloOa(oaId);
			await deleteOffice(admin.api, id);
		}
	},
});

/** A vendor id (OA, guest) no other test, repeat or earlier run uses. */
function uniqueId(kind: string): string {
	return `e2e-suggest-${kind}-${randomUUID()}`;
}

function guestOf(request: APIRequestContext, oaId: string): Guest {
	const id = uniqueId("guest");
	return { id, write: (text) => sendZaloText(request, { guestId: id, oaId, text }) };
}

/* ---------------------------------------------------------------- the thread, through the API */

type Thread = {
	unansweredInboundId: string | null;
	messages: { direction: "in" | "out"; text: string }[];
};

function threadAddress(threadId: string) {
	return `/api/conversations/${encodeURIComponent(threadId)}`;
}

async function readThread(api: Api, threadId: string): Promise<Thread> {
	const res = await api.get(threadAddress(threadId));
	expect(res.status(), "the thread opens").toBe(200);
	return (await res.json()) as Thread;
}

/** The guest writes their first message and the office greets them: their thread's id. */
async function greetedGuest(office: TemplateOffice): Promise<{ guest: Guest; threadId: string }> {
	const guest = office.newGuest();
	await guest.write(FIRST_MESSAGE);
	const threadId = await assignerAs(office.manager.api).threadOf(guest.id);
	await expect
		.poll(
			async () =>
				(await readThread(office.manager.api, threadId)).messages.filter(
					(m) => m.direction === "out",
				).length,
			{ message: "the office greets the guest within seconds", ...WITHIN_SECONDS },
		)
		.toBe(1);
	return { guest, threadId };
}

/** The thread holds this many of the guest's messages: the last one they wrote has arrived. */
async function guestMessagesArrived(api: Api, threadId: string, count: number) {
	await expect
		.poll(
			async () =>
				(await readThread(api, threadId)).messages.filter((m) => m.direction === "in").length,
			{ message: `the thread holds the guest's ${count} messages` },
		)
		.toBe(count);
}

/* ---------------------------------------------------------------- the Inbox */

function openThread(page: Page) {
	return page.getByRole("article");
}

/** The operator opens the thread by its link, its latest guest message showing. */
async function openByLink(page: Page, locale: Locale, threadId: string, latestText: string) {
	await page.goto(`/${locale}/inbox?thread=${encodeURIComponent(threadId)}`);
	await expect(
		openThread(page).getByText(latestText, { exact: true }),
		"the thread shows the guest's latest message",
	).toBeVisible();
}

/**
 * The manager opens the guest's thread from the All view, where it stays listed whoever owns it
 * (under Unassigned, assigning it takes it out of the view, and the open thread with it).
 */
async function openUnderAll(page: Page, guest: Guest, latestText: string) {
	await page.goto("/en/inbox");
	const all = page.getByRole("button", { name: /^All \d+$/ });
	await all.click();
	await expect(all).toHaveAttribute("aria-pressed", "true");
	await page.getByRole("textbox", { name: "Search threads" }).fill(guest.id);
	const row = page
		.getByRole("complementary")
		.getByRole("button", { name: new RegExp(`^${literal(guest.id)}\\b`) });
	await row.click();
	await expect(
		openThread(page).getByText(latestText, { exact: true }),
		"the thread shows the guest's latest message",
	).toBeVisible();
}

/** The open thread's reply box. */
function replyBox(page: Page, locale: Locale = "en") {
	return openThread(page).getByRole("textbox", { name: replyLabel(locale), exact: true });
}

/** The label above the reply box saying it holds the template (spacing around "·" aside). */
function templateLabel(page: Page, locale: Locale): Locator {
	const [what, source] = TEMPLATE_LABEL[locale].split(" · ");
	return openThread(page).getByText(
		new RegExp(`^\\s*${literal(what)}\\s*·\\s*${literal(source)}\\s*$`),
	);
}

/** The reply box's text once it holds a suggestion. */
async function suggestion(box: Locator): Promise<string> {
	await expect(box, "the reply box holds a suggestion").not.toHaveValue("", WITHIN_SECONDS);
	return box.inputValue();
}

/** The text starts with exactly this sentence. */
function startingWith(sentence: string): RegExp {
	return new RegExp(`^${literal(sentence)}`);
}

/** A name guests see, as a word of its own. */
function naming(name: string): RegExp {
	return new RegExp(`(?<![\\p{L}])${literal(name)}(?![\\p{L}])`, "u");
}

function literal(text: string): string {
	return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Picks an option of the open thread's "Assign to…" (the kit's Base UI Select: #248) by the
 * operator's name, once its list offers it; the list closes on the choice.
 */
async function assignInHeader(page: Page, name: string) {
	const select = openThread(page).getByTestId("thread-owner-select");
	await select.click();
	const option = page.getByRole("option", { name, exact: true });
	await expect(option, `Assign to… offers ${name}`).toBeVisible();
	await option.click();
	await expect(option, "the list closes").toBeHidden();
}

// ---------------------------------------------------------------------------------------

test.describe.configure({ timeout: 120_000 });

// scenario: docs/e2e-scenarios.md Suggested reply template 1
test.describe("Suggested reply template 1 — the suggested reply after the auto-reply is the agent's own", () => {
	test(`a greeted guest's thread, assigned to Lan Pham, opens for her with the reply box starting "${AGENT_INTRO}", no thanks and no "a colleague", labelled "${TEMPLATE_LABEL.en}"`, async ({
		office,
	}) => {
		const { manager, agent } = office;
		const { threadId } = await greetedGuest(office);
		await assignerAs(manager.api).assignTo(threadId, agent.userId);

		const { page } = agent;
		await openByLink(page, "en", threadId, FIRST_MESSAGE);
		const box = replyBox(page);
		await expect(
			box,
			"the box introduces the agent by their name guests see, and the office",
		).toHaveValue(startingWith(AGENT_INTRO), WITHIN_SECONDS);
		const text = await box.inputValue();
		expect(text, "it doesn't thank the guest again, after the auto-reply").not.toMatch(/\bthank/i);
		expect(text, 'it doesn\'t say "a colleague": the agent is that colleague').not.toMatch(
			/colleague/i,
		);
		await expect(templateLabel(page, "en"), `labelled "${TEMPLATE_LABEL.en}"`).toBeVisible();
	});
});

// scenario: docs/e2e-scenarios.md Suggested reply template 2
test.describe("Suggested reply template 2 — an unassigned thread names the office only", () => {
	test(`the manager opens an unassigned greeted thread: the reply box starts "${OFFICE_INTRO}" and names no one, neither the manager (Minh) nor the agent (Lan)`, async ({
		office,
	}) => {
		const { manager, agent } = office;
		const { threadId } = await greetedGuest(office);

		const { page } = manager;
		await openByLink(page, "en", threadId, FIRST_MESSAGE);
		const box = replyBox(page);
		await expect(box, "the box names the office").toHaveValue(
			startingWith(OFFICE_INTRO),
			WITHIN_SECONDS,
		);
		const text = await box.inputValue();
		expect(text, "it doesn't name the manager").not.toMatch(naming(manager.nameGuestsSee));
		expect(text, "it doesn't name the office's agent").not.toMatch(naming(agent.nameGuestsSee));
	});
});

// scenario: docs/e2e-scenarios.md Suggested reply template 3
test.describe("Suggested reply template 3 — assigning writes it again in the owner's name", () => {
	test(`the manager, on an unassigned thread whose box starts "${OFFICE_INTRO}", assigns it to Lan Pham from the thread's Assign to… without typing: without a reload the box starts "${AGENT_INTRO}"`, async ({
		office,
	}) => {
		const { manager, agent } = office;
		const { guest } = await greetedGuest(office);

		const { page } = manager;
		await openUnderAll(page, guest, FIRST_MESSAGE);
		const box = replyBox(page);
		await expect(box, "unassigned, the box names the office only").toHaveValue(
			startingWith(OFFICE_INTRO),
			WITHIN_SECONDS,
		);

		await assignInHeader(page, agent.name);
		await expect(
			openThread(page).getByTestId("thread-owner-select"),
			"the thread, still open, is Lan's",
		).toContainText(agent.name);
		await expect(
			box,
			"assigned, the same box, unreloaded, introduces the owner by their name guests see",
		).toHaveValue(startingWith(AGENT_INTRO), WITHIN_POLLS);
	});
});

// scenario: docs/e2e-scenarios.md Suggested reply template 4
test.describe("Suggested reply template 4 — no intro once the office has replied", () => {
	test(`before Lan replies her box starts "${AGENT_INTRO}"; she approves and sends, the guest writes again, and the new suggestion names neither Lan nor the office`, async ({
		office,
	}) => {
		const { manager, agent } = office;
		const { guest, threadId } = await greetedGuest(office);
		await assignerAs(manager.api).assignTo(threadId, agent.userId);

		const { page } = agent;
		await openByLink(page, "en", threadId, FIRST_MESSAGE);
		const box = replyBox(page);
		await expect(box, "before her reply, the box introduces the agent").toHaveValue(
			startingWith(AGENT_INTRO),
			WITHIN_SECONDS,
		);

		await openThread(page).getByTestId("approve-and-send").click();
		await expect
			.poll(async () => (await readThread(agent.api, threadId)).unansweredInboundId, {
				message: "the agent's reply is sent: the guest's message is answered",
			})
			.toBeNull();

		const again = "Great, how many options do you have?";
		await guest.write(again);
		await guestMessagesArrived(agent.api, threadId, 2);
		await openByLink(page, "en", threadId, again);
		const text = await suggestion(box);
		expect(text, "the new suggestion doesn't name the agent").not.toMatch(
			naming(agent.nameGuestsSee),
		);
		expect(text, "the new suggestion doesn't name the office").not.toContain(OFFICE_NAME);
	});
});

// scenario: docs/e2e-scenarios.md Suggested reply template 5
test.describe("Suggested reply template 5 — no repeated question", () => {
	test(`the auto-reply asked the budget and the guest wrote back without one: the box still starts "${OFFICE_INTRO}" and doesn't mention a budget`, async ({
		office,
	}) => {
		const { manager } = office;
		const { guest, threadId } = await greetedGuest(office);
		const greeting = (await readThread(manager.api, threadId)).messages.find(
			(m) => m.direction === "out",
		)!.text;
		expect(greeting, "the auto-reply asked for the budget").toContain(
			"What budget do you have in mind?",
		);

		const noBudget = "Thanks! 2 of us, we'd like a 2-bedroom";
		await guest.write(noBudget);
		await guestMessagesArrived(manager.api, threadId, 2);

		const { page } = manager;
		await openByLink(page, "en", threadId, noBudget);
		const box = replyBox(page);
		await expect(box, "the box still introduces the office").toHaveValue(
			startingWith(OFFICE_INTRO),
			WITHIN_SECONDS,
		);
		const text = await box.inputValue();
		expect(text, "it doesn't ask the budget again").not.toContain(
			"What budget do you have in mind?",
		);
		expect(text, 'no "budget" at all').not.toMatch(/budget/i);
	});
});

// scenario: docs/e2e-scenarios.md Suggested reply template 6
test.describe("Suggested reply template 6 — the label in Vietnamese", () => {
	test(`in a Vietnamese office, in /vi/inbox, the manager's greeted thread labels the reply box "${TEMPLATE_LABEL.vi}"`, async ({
		office,
	}) => {
		const { manager } = office;
		// A member reads Nhịp in the office language (ADR 0025): the manager sets their office, of
		// this test's own, to Vietnamese before the guest writes.
		await setOfficeLanguage(manager.page.request, "vi");
		const { threadId } = await greetedGuest(office);

		const { page } = manager;
		await openByLink(page, "vi", threadId, FIRST_MESSAGE);
		await suggestion(replyBox(page, "vi"));
		await expect(templateLabel(page, "vi"), `labelled "${TEMPLATE_LABEL.vi}"`).toBeVisible();
	});
});
