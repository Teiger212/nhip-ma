import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import type { APIRequestContext, Page } from "@playwright/test";

import type { Locale } from "./support/copy";
import { expect, test as base } from "./support/fixtures";
import { setOfficeLanguage } from "./support/office-language";
import { deleteOffice } from "./support/offices";
import type { Joined } from "./support/operators";
import { joinOffice } from "./support/operators";
import { connectZaloOa, releaseZaloOa } from "./support/pipes";
import type { Api } from "./support/session";
import { deliverZalo, signedZaloText } from "./support/zalo";

/* ---------------------------------------------------------------- what the scenario promises */

/**
 * The scenario's own words (docs/e2e-scenarios.md, Guest language), written out rather than read
 * from saas.json: they are the contract the thread must meet. The VI copy is pending a native read
 * (#78); its language names are lowercase, as the VI interface writes them.
 */
const FRENCH = {
	en: {
		/** French, as the interface names the language. */
		name: "French",
		/** English, which the thread read as before ADR 0021 R4's amendment. */
		english: "English",
		/** The details' Language row. */
		languageRow: "French · not supported, replies in English",
		/** Under each of the guest's messages, where a translation would sit. */
		noTranslation: "French isn't supported: no translation",
		/** The operator note, one line beside the reply box (#248). */
		operatorNote: "in English · French isn't supported · don't interview",
	},
	vi: {
		name: "tiếng Pháp",
		english: "tiếng Anh",
		languageRow: "tiếng Pháp · chưa hỗ trợ, trả lời bằng tiếng Anh",
		noTranslation: "Chưa hỗ trợ tiếng Pháp: không dịch",
		operatorNote: "bằng tiếng Anh · chưa hỗ trợ tiếng Pháp · đừng hỏi thêm kiểu phỏng vấn",
	},
} as const;

/** The Korean guest's operator note (Guest language 2). */
const KOREAN_OPERATOR_NOTE = "in Korean · don't interview";

/** The French guest's two messages: the second mixes French and English. */
const FRENCH_FIRST =
	"Bonjour, je suis française. Je cherche un 3 bedroom to rent à Ba Dinh, budget $3000/month.";
const FRENCH_MIXED = "Oui, merci ! Photos please, and is a viewing possible this Saturday?";

/** The Korean guest's message. */
const KOREAN_FIRST = "안녕하세요, 서호에서 방 두 개짜리 아파트를 월세로 찾고 있어요.";

/** The office every greeting here signs as (ADR 0021, R7: the label names the office). */
const OFFICE_NAME = "Saigon Prime Test";

/** The English auto-reply's last line, its label (ADR 0021, R7). */
const EN_LABEL = `Auto-reply from ${OFFICE_NAME}: a colleague will continue with you right here.`;

/** The English first-reply template's opening (ADR 0021, Context). */
const EN_GREETING_START = /^Thanks for writing\b/;

/** The English follow-up template, as the reply box holds it after the greeting (no draft in E2E). */
const EN_FOLLOW_UP = "Thanks for your message. A colleague will get back to you here shortly.";

/** Any "isn't supported" note or row, in either interface language. */
const NOT_SUPPORTED = /isn't supported|not supported|chưa hỗ trợ/i;

const HANGUL = /\p{Script=Hangul}/u;

/**
 * A wide thread pane, where the guest's details sit in a rail beside the conversation, and a
 * narrow one, where they fold into a strip under the header (#248; Thread layout 1 and 2).
 */
const PANES = [
	{ pane: "wide", size: { width: 1563, height: 784 } },
	{ pane: "narrow", size: { width: 1366, height: 768 } },
] as const;

/**
 * The interface's own labels, which are how a person finds things and not what the scenario
 * promises (packages/i18n/translations/<locale>/saas.json): the details' Language term, the
 * operator note's label, a translation's label, the reply box, the auto-reply's meta line.
 */
type Labels = {
	inbox: {
		reply: string;
		forYou: string;
		translation: string;
		fields: { language: string };
		autoReply: { template: string };
	};
	home: { waitingNow: string };
};

function labels(locale: Locale): Labels {
	return JSON.parse(
		fs.readFileSync(
			path.resolve(__dirname, `../../../packages/i18n/translations/${locale}/saas.json`),
			"utf8",
		),
	) as Labels;
}

/** The greeting goes out "within seconds"; a production build under load gets a margin. */
const WITHIN_SECONDS = { timeout: 20_000 };

/* ---------------------------------------------------------------- the office and its guests */

type Guest = { id: string; write: (text: string) => Promise<void> };

/**
 * An office of the test's own named "Saigon Prime Test" (deleted afterwards), its own Zalo OA
 * (released afterwards), and a manager (the kit's `admin`) who reads every thread, Unassigned ones
 * included.
 */
type LanguageOffice = { manager: Joined; newGuest: () => Guest };

const test = base.extend<{ office: LanguageOffice }>({
	office: async ({ admin, browser, request }, use) => {
		const created = await admin.api.post("/api/auth/organization/create", {
			name: OFFICE_NAME,
			slug: `e2e-language-${randomUUID()}`,
		});
		expect(created.status(), `the platform admin creates "${OFFICE_NAME}"`).toBe(200);
		const { id } = (await created.json()) as { id: string };
		const oaId = uniqueId("oa");
		let manager: Joined | undefined;
		try {
			await connectZaloOa(id, oaId);
			manager = await joinOffice(admin, browser, id, "admin", "language-manager");
			await use({ manager, newGuest: () => guestOf(request, oaId) });
		} finally {
			await manager?.close();
			await releaseZaloOa(oaId);
			await deleteOffice(admin.api, id);
		}
	},
});

/** A vendor id (OA, guest) no other test, repeat or earlier run uses. */
function uniqueId(kind: string): string {
	return `e2e-language-${kind}-${randomUUID()}`;
}

function guestOf(request: APIRequestContext, oaId: string): Guest {
	const id = uniqueId("guest");
	return {
		id,
		write: (text) => deliverZalo(request, signedZaloText({ guestId: id, oaId, text })),
	};
}

/* ---------------------------------------------------------------- the thread, as the manager's API reads it */

type ListedThread = { id: string; guestId: string };
type Message = { direction: "in" | "out"; text: string };

/** The guest's thread id, once the manager's conversations API lists it. */
async function threadIdOf(manager: Api, guest: Guest): Promise<string> {
	let thread: ListedThread | undefined;
	await expect(async () => {
		const res = await manager.get("/api/conversations");
		expect(res.status(), "the manager lists the office's threads").toBe(200);
		thread = ((await res.json()) as ListedThread[]).find((t) => t.guestId === guest.id);
		expect(thread, `the manager lists ${guest.id}`).toBeDefined();
	}).toPass({ timeout: 10_000 });
	return thread!.id;
}

async function messagesOf(manager: Api, threadId: string): Promise<Message[]> {
	const res = await manager.get(`/api/conversations/${encodeURIComponent(threadId)}`);
	expect(res.status(), "the manager opens the thread").toBe(200);
	return ((await res.json()) as { messages: Message[] }).messages;
}

/** The office's auto-reply to the guest, once it has gone out (within seconds). */
async function greetingIn(manager: Api, threadId: string): Promise<string> {
	await expect
		.poll(
			async () => (await messagesOf(manager, threadId)).filter((m) => m.direction === "out").length,
			{
				message: "the office greets the guest within seconds of their first message",
				...WITHIN_SECONDS,
			},
		)
		.toBeGreaterThan(0);
	return (await messagesOf(manager, threadId)).find((m) => m.direction === "out")!.text;
}

function lastLine(text: string): string {
	return text.trim().split("\n").at(-1)!.trim();
}

/* ---------------------------------------------------------------- the Inbox, as the manager reads it */

function openThread(page: Page) {
	return page.getByRole("article");
}

/** The open thread's messages, top to bottom: each is one bubble. */
function bubbles(page: Page) {
	return openThread(page).getByTestId("message");
}

/** The bubble holding this text. */
function bubbleSaying(page: Page, text: string) {
	return bubbles(page).filter({ hasText: text });
}

/** The guest's details, wherever they sit: the rail beside the conversation, or the strip. */
function details(page: Page) {
	return page.getByTestId("thread-details");
}

/** The manager opens the thread by its link, in the given interface language. */
async function openThreadByLink(page: Page, locale: Locale, threadId: string, latestText: string) {
	await page.goto(`/${locale}/inbox?thread=${encodeURIComponent(threadId)}`);
	await expect(bubbleSaying(page, latestText), "the thread holds the guest's message").toHaveCount(
		1,
	);
}

/**
 * A row of the guest's details, as read: the value beside the term (each detail is a term and
 * its value). Undefined while the term isn't shown.
 */
async function detailRow(page: Page, term: string): Promise<string | undefined> {
	const terms = (await details(page).getByRole("term").allInnerTexts()).map(collapse);
	const values = (await details(page).getByRole("definition").allInnerTexts()).map(collapse);
	if (terms.length !== values.length) {
		return `(${terms.length} details but ${values.length} values)`;
	}
	const at = terms.indexOf(term);
	return at < 0 ? undefined : values[at];
}

function collapse(text: string): string {
	return text.replace(/\s+/g, " ").trim();
}

/** A bubble's text, top to bottom, as read. */
async function bubbleText(page: Page, text: string): Promise<string> {
	return collapse(await bubbleSaying(page, text).innerText());
}

/** Which of `marks` the text holds in this order, each after the one before (as far as it goes). */
function inOrder(text: string, marks: string[]): string[] {
	const found: string[] = [];
	let from = 0;
	for (const mark of marks) {
		const at = text.indexOf(mark, from);
		if (at < 0) break;
		found.push(mark);
		from = at + mark.length;
	}
	return found;
}

/**
 * The operator note: the open thread's one line labelled as it ("Operator note"), however its
 * label is shown.
 */
function operatorNote(page: Page, locale: Locale) {
	return (
		openThread(page)
			.getByRole("paragraph")
			// Not `\b`: it never falls after a Vietnamese letter such as the "ộ" of "Ghi chú nội bộ".
			.filter({ hasText: new RegExp(`^${literal(labels(locale).inbox.forYou)}(?:[:\\s]|$)`) })
	);
}

/** The operator note reads exactly `note`, after its label. */
function noteReading(locale: Locale, note: string): RegExp {
	return new RegExp(`^${literal(labels(locale).inbox.forYou)}:?\\s*${literal(note)}$`);
}

function literal(text: string): string {
	return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** The open thread's reply box. */
function replyBox(page: Page, locale: Locale) {
	return openThread(page).getByRole("textbox", { name: labels(locale).inbox.reply, exact: true });
}

/** The guest's entry in Home's Waiting now, on Home loaded afresh. */
async function waitingNowEntry(page: Page, locale: Locale, guest: Guest) {
	await page.goto(`/${locale}/home`);
	const main = page.getByRole("main");
	await expect(main.getByRole("heading", { name: labels(locale).home.waitingNow })).toBeVisible();
	const entry = main.getByRole("link", { name: new RegExp(`^${literal(guest.id)}\\b`) });
	await expect(entry, `Waiting now lists ${guest.id}`).toBeVisible();
	return entry;
}

// ---------------------------------------------------------------------------------------

test.describe.configure({ timeout: 120_000 });

// scenario: docs/e2e-scenarios.md Guest language 1
test.describe("Guest language 1 — a guest writes in French: the thread names French and says it isn't supported", () => {
	for (const locale of ["en", "vi"] as const) {
		test(`${locale.toUpperCase()} interface: the Language row reads "${FRENCH[locale].languageRow}" (never English alone) in the rail and the strip; each of the guest's messages, the mixed second one included, has "${FRENCH[locale].noTranslation}" under its text and no translation, and the auto-reply has no note; the operator note reads "${FRENCH[locale].operatorNote}"; the guest gets the English greeting and the reply box the English follow-up; Home's Waiting now names ${FRENCH[locale].name}, not ${FRENCH[locale].english}`, async ({
			office,
		}) => {
			const { manager } = office;
			const { page } = manager;
			const copy = FRENCH[locale];
			const ui = labels(locale);
			// What the guest gets is unchanged, so it is checked first and stops the test; every check
			// of what the thread says about French is reported, not only the first to fail.
			const check = expect.configure({ soft: true });
			// A member reads Nhịp in the office language (ADR 0025): the VI pass is a Vietnamese office.
			if (locale === "vi") {
				await setOfficeLanguage(page.request, "vi");
			}

			const guest = office.newGuest();
			await guest.write(FRENCH_FIRST);
			const threadId = await threadIdOf(manager.api, guest);

			await test.step("what the guest gets is English: the English greeting, label included", async () => {
				const greeting = await greetingIn(manager.api, threadId);
				expect(greeting, "the auto-reply is the English first-reply template").toMatch(
					EN_GREETING_START,
				);
				expect(lastLine(greeting), "its label is the English one").toBe(EN_LABEL);
			});

			await page.setViewportSize(PANES[0].size);
			await openThreadByLink(page, locale, threadId, FRENCH_FIRST);

			await test.step("the auto-reply shows as the template, and the reply box holds the English follow-up", async () => {
				await expect(bubbleSaying(page, EN_LABEL), "the English label shows").toHaveCount(1);
				await expect(
					openThread(page).getByText(ui.inbox.autoReply.template, { exact: true }),
					"the auto-reply is marked Template",
				).toHaveCount(1);
				await expect(
					replyBox(page, locale),
					"the reply box holds the English follow-up",
				).toHaveValue(EN_FOLLOW_UP, WITHIN_SECONDS);
			});

			await test.step("the operator note is one line: the reply is in English, French isn't supported", async () => {
				await check(operatorNote(page, locale), "one operator note").toHaveCount(1);
				await check(operatorNote(page, locale), "the operator note's line").toHaveText(
					noteReading(locale, copy.operatorNote),
				);
			});

			await test.step("the message says French isn't supported, under its text, and isn't translated", async () => {
				await check
					.poll(
						async () =>
							inOrder(await bubbleText(page, FRENCH_FIRST), [FRENCH_FIRST, copy.noTranslation]),
						{
							message: "the note sits in the guest's bubble, under their text",
						},
					)
					.toEqual([FRENCH_FIRST, copy.noTranslation]);
				await check(
					bubbleSaying(page, FRENCH_FIRST),
					"the guest's message is not translated",
				).not.toContainText(ui.inbox.translation);
				await check(
					bubbleSaying(page, EN_LABEL),
					"the auto-reply carries no note",
				).not.toContainText(copy.noTranslation);
			});

			await test.step("a mixed second message has the note too: the thread's language decides", async () => {
				await guest.write(FRENCH_MIXED);
				await expect(bubbleSaying(page, FRENCH_MIXED), "the mixed message arrives").toHaveCount(1);
				await check
					.poll(
						async () =>
							inOrder(await bubbleText(page, FRENCH_MIXED), [FRENCH_MIXED, copy.noTranslation]),
						{
							message: "the note sits in the mixed message's bubble, under its text",
						},
					)
					.toEqual([FRENCH_MIXED, copy.noTranslation]);
				await check(
					bubbleSaying(page, FRENCH_MIXED),
					"the mixed message is not translated",
				).not.toContainText(ui.inbox.translation);
				await check(
					bubbles(page).filter({ hasText: copy.noTranslation }),
					"one note per guest message: the first and the mixed one",
				).toHaveCount(2);
			});

			for (const { pane, size } of PANES) {
				await test.step(`the Language row names French and says it isn't supported (${pane} pane)`, async () => {
					await page.setViewportSize(size);
					await check
						.poll(() => detailRow(page, ui.inbox.fields.language), {
							message: `the Language row reads "${copy.languageRow}" on a ${pane} pane`,
						})
						.toBe(copy.languageRow);
				});
			}

			await test.step("Home's Waiting now names French, not English", async () => {
				const entry = await waitingNowEntry(page, locale, guest);
				await check(entry, `the entry names ${copy.name}`).toHaveAccessibleName(
					new RegExp(literal(copy.name)),
				);
				await check(entry, `the entry doesn't name ${copy.english}`).not.toHaveAccessibleName(
					new RegExp(literal(copy.english)),
				);
			});
		});
	}
});

// scenario: docs/e2e-scenarios.md Guest language 2
test.describe("Guest language 2 — a guest writes in Korean: the thread reads as before", () => {
	test(`the Language row reads "Korean" with no note, no message says "isn't supported", the operator note reads "${KOREAN_OPERATOR_NOTE}", the auto-reply is in Hangul and Home's Waiting now names Korean`, async ({
		office,
	}) => {
		const { manager } = office;
		const { page } = manager;
		const ui = labels("en");
		const check = expect.configure({ soft: true });

		const guest = office.newGuest();
		await guest.write(KOREAN_FIRST);
		const threadId = await threadIdOf(manager.api, guest);

		const greeting = await greetingIn(manager.api, threadId);
		check(greeting, "the auto-reply is in Hangul").toMatch(HANGUL);
		check(lastLine(greeting), "its label is in Hangul").toMatch(HANGUL);
		check(lastLine(greeting), "its label is not the English one").not.toBe(EN_LABEL);

		await openThreadByLink(page, "en", threadId, KOREAN_FIRST);
		await check
			.poll(() => detailRow(page, ui.inbox.fields.language), {
				message: 'the Language row reads "Korean", with no note',
			})
			.toBe("Korean");
		await check(operatorNote(page, "en"), "the operator note's line").toHaveText(
			noteReading("en", KOREAN_OPERATOR_NOTE),
		);
		// Judged once the row has read Korean and the operator note has shown.
		check(
			collapse(await openThread(page).innerText()),
			'nothing in the thread says "isn\'t supported"',
		).not.toMatch(NOT_SUPPORTED);

		const entry = await waitingNowEntry(page, "en", guest);
		await check(entry, "the entry names Korean").toHaveAccessibleName(/\bKorean\b/);
		await check(entry, "the entry doesn't name English").not.toHaveAccessibleName(/\bEnglish\b/);
	});
});
