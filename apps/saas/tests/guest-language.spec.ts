import fs from "node:fs";
import path from "node:path";

import type { Page } from "@playwright/test";

import { expect, test as base } from "./support/fixtures";
import type { Guest, OwnOffice } from "./support/own-office";
import {
	greetingIn,
	literal,
	threadIdOf,
	threadLink,
	WITHIN_SECONDS,
	withOwnOffice,
} from "./support/own-office";

/* ---------------------------------------------------------------- what the scenario promises */

/**
 * The scenario's own words (docs/e2e-scenarios.md, Guest language), written out rather than read
 * from saas.json: they are the contract the thread must meet.
 */
const FRENCH = {
	/** French, as the interface names the language. */
	name: "French",
	/** English, which the thread read as before ADR 0021 R4's amendment. */
	english: "English",
	/** The details' Language row. */
	languageRow: "French · not supported, replies in English",
	/** Under each of the guest's messages, where a translation would sit. */
	noTranslation: "French isn't supported: no translation",
	/** The operator note, one line beside the reply box (#248). */
	operatorNote: "in English · French isn't supported",
} as const;

/** The French guest's two messages: the second mixes French and English. */
const FRENCH_FIRST =
	"Bonjour, je suis française. Je cherche un 3 bedroom to rent à Ba Dinh, budget $3000/month.";
const FRENCH_MIXED = "Oui, merci ! Photos please, and is a viewing possible this Saturday?";

/** The office every greeting here signs as (ADR 0021, R7: the label names the office). */
const OFFICE_NAME = "Saigon Prime Test";

/** The English auto-reply's last line, its label (ADR 0021, R7). */
const EN_LABEL = `Auto-reply from ${OFFICE_NAME}: a colleague will continue with you right here.`;

/** The English first-reply template's opening (ADR 0021, Context). */
const EN_GREETING_START = /^Thanks for writing\b/;

/**
 * The English template suggested reply's opening on an unassigned thread (ADR 0024; docs/e2e-scenarios.md,
 * Suggested reply template): it names the office, and a Zalo guest has no name to greet.
 */
const EN_TEMPLATE_START = `Hi, this is ${OFFICE_NAME}.`;

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
 * promises (packages/i18n/translations/en/saas.json): the details' Language term, the operator
 * note's label, a translation's label, the reply box, the auto-reply's meta line.
 */
const UI = JSON.parse(
	fs.readFileSync(
		path.resolve(__dirname, "../../../packages/i18n/translations/en/saas.json"),
		"utf8",
	),
) as {
	inbox: {
		reply: string;
		forYou: string;
		translation: string;
		fields: { language: string };
		source: { autoReply: string };
	};
	home: { waitingNow: string };
};

/* ---------------------------------------------------------------- the office and its guests */

/**
 * An office of the test's own named "Saigon Prime Test" (deleted afterwards), its own Zalo OA
 * (released afterwards), and a manager (the kit's `admin`) who reads every thread, Unassigned ones
 * included.
 */
const test = base.extend<{ office: OwnOffice }>({
	office: ({ admin, browser, request }, use) =>
		withOwnOffice({ admin, browser, request }, { tag: "language", name: OFFICE_NAME }, use),
});

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

/** The manager opens the thread by its link. */
async function openThreadByLink(page: Page, threadId: string, latestText: string) {
	await page.goto(threadLink(threadId));
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
function operatorNote(page: Page) {
	return openThread(page)
		.getByRole("paragraph")
		.filter({ hasText: new RegExp(`^${literal(UI.inbox.forYou)}(?:[:\\s]|$)`) });
}

/** The operator note reads exactly `note`, after its label. */
function noteReading(note: string): RegExp {
	return new RegExp(`^${literal(UI.inbox.forYou)}:?\\s*${literal(note)}$`);
}

/** The open thread's reply box. */
function replyBox(page: Page) {
	return openThread(page).getByRole("textbox", { name: UI.inbox.reply, exact: true });
}

/** The guest's entry in Home's Waiting now, on Home loaded afresh. */
async function waitingNowEntry(page: Page, guest: Guest) {
	await page.goto("/en/home");
	const main = page.getByRole("main");
	await expect(main.getByRole("heading", { name: UI.home.waitingNow })).toBeVisible();
	const entry = main.getByRole("link", { name: new RegExp(`^${literal(guest.id)}\\b`) });
	await expect(entry, `Waiting now lists ${guest.id}`).toBeVisible();
	return entry;
}

// ---------------------------------------------------------------------------------------

test.describe.configure({ timeout: 120_000 });

// scenario: docs/e2e-scenarios.md Guest language 1
test.describe("Guest language 1 — a guest writes in French: the thread names French and says it isn't supported", () => {
	test(`EN interface: the Language row reads "${FRENCH.languageRow}" (never English alone) in the rail and the strip; each of the guest's messages, the mixed second one included, has "${FRENCH.noTranslation}" under its text and no translation, and the auto-reply has no note; the operator note reads "${FRENCH.operatorNote}"; the guest gets the English greeting and the reply box the English template, starting "${EN_TEMPLATE_START}" with no "a colleague"; Home's Waiting now names ${FRENCH.name}, not ${FRENCH.english}`, async ({
		office,
	}) => {
		const { manager } = office;
		const { page } = manager;
		const copy = FRENCH;
		// What the guest gets is unchanged, so it is checked first and stops the test; every check
		// of what the thread says about French is reported, not only the first to fail.
		const check = expect.configure({ soft: true });

		const guest = office.newGuest();
		await guest.write(FRENCH_FIRST);
		const threadId = await threadIdOf(manager.api, guest.id);

		await test.step("what the guest gets is English: the English greeting, label included", async () => {
			const greeting = await greetingIn(manager.api, threadId);
			expect(greeting, "the auto-reply is the English first-reply template").toMatch(
				EN_GREETING_START,
			);
			expect(lastLine(greeting), "its label is the English one").toBe(EN_LABEL);
		});

		await page.setViewportSize(PANES[0].size);
		await openThreadByLink(page, threadId, FRENCH_FIRST);

		await test.step("the auto-reply is written by the template, and the reply box holds the English template suggested reply", async () => {
			await expect(bubbleSaying(page, EN_LABEL), "the English label shows").toHaveCount(1);
			await expect(
				openThread(page)
					.getByTestId("message-source")
					.filter({ hasText: UI.inbox.source.autoReply }),
				"the auto-reply is written by the template",
			).toHaveAttribute("data-writer", "template");
			await expect(
				replyBox(page),
				`the reply box holds the English template, starting "${EN_TEMPLATE_START}"`,
			).toHaveValue(new RegExp(`^${literal(EN_TEMPLATE_START)}`), WITHIN_SECONDS);
			expect(await replyBox(page).inputValue(), 'it never promises "a colleague"').not.toMatch(
				/colleague/i,
			);
		});

		await test.step("the operator note is one line: the reply is in English, French isn't supported", async () => {
			await check(operatorNote(page), "one operator note").toHaveCount(1);
			await check(operatorNote(page), "the operator note's line").toHaveText(
				noteReading(copy.operatorNote),
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
			).not.toContainText(UI.inbox.translation);
			await check(bubbleSaying(page, EN_LABEL), "the auto-reply carries no note").not.toContainText(
				copy.noTranslation,
			);
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
			).not.toContainText(UI.inbox.translation);
			await check(
				bubbles(page).filter({ hasText: copy.noTranslation }),
				"one note per guest message: the first and the mixed one",
			).toHaveCount(2);
		});

		for (const { pane, size } of PANES) {
			await test.step(`the Language row names French and says it isn't supported (${pane} pane)`, async () => {
				await page.setViewportSize(size);
				await check
					.poll(() => detailRow(page, UI.inbox.fields.language), {
						message: `the Language row reads "${copy.languageRow}" on a ${pane} pane`,
					})
					.toBe(copy.languageRow);
			});
		}

		await test.step("Home's Waiting now names French, not English", async () => {
			const entry = await waitingNowEntry(page, guest);
			await check(entry, `the entry names ${copy.name}`).toHaveAccessibleName(
				new RegExp(literal(copy.name)),
			);
			await check(entry, `the entry doesn't name ${copy.english}`).not.toHaveAccessibleName(
				new RegExp(literal(copy.english)),
			);
		});
	});
});
