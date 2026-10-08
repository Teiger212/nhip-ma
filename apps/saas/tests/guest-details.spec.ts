import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import type { APIRequestContext, Locator, Page } from "@playwright/test";

import type { Locale } from "./support/copy";
import { expect, test as base } from "./support/fixtures";
import type { Joined } from "./support/operators";
import { joinOffice } from "./support/operators";
import { connectZaloOa, releaseZaloOa } from "./support/pipes";
import type { Api } from "./support/session";
import { deliverZalo, signedZaloText } from "./support/zalo";

/* ---------------------------------------------------------------- what the scenario promises */

/**
 * The scenario's own words (docs/e2e-scenarios.md, Guest details), written out rather than read
 * from saas.json: they are the contract the details must meet. The Missing row is a term and its
 * value, one more row of the details (Eyal on PR #261). The VI copy is pending a native read (#78).
 */
const MISSING_ROW = {
	en: { term: "Missing", value: "budget, move-in" },
	vi: { term: "Còn thiếu", value: "ngân sách, ngày vào" },
} as const;

/**
 * The details' Area row, one of "the other details" the Missing row sits among (the interface's
 * own label, as a person reads it).
 */
const AREA_TERM = { en: "Area", vi: "Khu vực" } as const;

/** The old separate line's opening ("Missing: …"), in either interface language. */
const MISSING_LINE_PREFIX = /(?:Missing|Còn thiếu)\s*:/;

/**
 * A "N missing" count, in either interface language (VI "N trường còn thiếu" before #244), on one
 * line as read; never a "Missing:" opening after a value ending in a digit.
 */
const MISSING_COUNT = /\d+[  ]*(?:missing|trường còn thiếu)(?![  ]*:)/i;

/** Rows that show only when known (paperwork: only when mentioned); never missing. */
const NEVER_MISSING_ROWS = ["Paperwork", "Nationality", "In Vietnam now"] as const;

/** The guest of Guest details 1 and 3: rent, area and beds given; budget and move-in not. */
const ASKS_BUDGET_AND_MOVE_IN = "I want to rent a 2 bedroom in Tay Ho.";

/** The guest of Guest details 2: every ask of the auto-reply answered. */
const GAVE_EVERYTHING =
	"I want to rent a 2 bedroom in Tay Ho, budget $1500/month, moving in next month.";

/**
 * A wide thread pane, where the guest's details sit in a rail beside the conversation, and a
 * narrow one (the sidebar open), where they fold into a strip under the header (Thread layout 1
 * and 2).
 */
const PANES = [
	{ pane: "wide (the rail)", size: { width: 1563, height: 784 } },
	{ pane: "narrow (the strip)", size: { width: 1366, height: 768 } },
] as const;

/** The details settle within a poll of the thread opening; three production polls of margin. */
const WITHIN_A_POLL = { timeout: 30_000 };

/**
 * The interface's own field labels, which are how a person finds a row, not what the scenario
 * promises (packages/i18n/translations/<locale>/saas.json).
 */
type Fields = { budget: string; moveIn: string };

function fields(locale: Locale): Fields {
	const saas = JSON.parse(
		fs.readFileSync(
			path.resolve(__dirname, `../../../packages/i18n/translations/${locale}/saas.json`),
			"utf8",
		),
	) as { inbox: { fields: Fields } };
	return saas.inbox.fields;
}

/* ---------------------------------------------------------------- the office and its guests */

type Guest = { id: string; write: (text: string) => Promise<void> };

/**
 * An office of the test's own (deleted with the `admin` fixture), its own Zalo OA (released
 * afterwards), and a manager (the kit's `admin`) who reads every thread, Unassigned ones included.
 */
type DetailsOffice = { manager: Joined; newGuest: () => Guest };

const test = base.extend<{ office: DetailsOffice }>({
	office: async ({ admin, browser, request }, use) => {
		const office = await admin.createOffice("details");
		const oaId = uniqueId("oa");
		let manager: Joined | undefined;
		try {
			await connectZaloOa(office.id, oaId);
			manager = await joinOffice(admin, browser, office.id, "admin", "details-manager");
			await use({ manager, newGuest: () => guestOf(request, oaId) });
		} finally {
			await manager?.close();
			await releaseZaloOa(oaId);
		}
	},
});

/** A vendor id (OA, guest) no other test, repeat or earlier run uses. */
function uniqueId(kind: string): string {
	return `e2e-details-${kind}-${randomUUID()}`;
}

function guestOf(request: APIRequestContext, oaId: string): Guest {
	const id = uniqueId("guest");
	return {
		id,
		write: (text) => deliverZalo(request, signedZaloText({ guestId: id, oaId, text })),
	};
}

/** The guest's thread id, once the manager's conversations API lists it. */
async function threadIdOf(manager: Api, guest: Guest): Promise<string> {
	let thread: { id: string; guestId: string } | undefined;
	await expect(async () => {
		const res = await manager.get("/api/conversations");
		expect(res.status(), "the manager lists the office's threads").toBe(200);
		thread = ((await res.json()) as { id: string; guestId: string }[]).find(
			(t) => t.guestId === guest.id,
		);
		expect(thread, `the manager lists ${guest.id}`).toBeDefined();
	}).toPass({ timeout: 10_000 });
	return thread!.id;
}

/* ---------------------------------------------------------------- the details, as the manager reads them */

/** The guest's details, wherever they sit: the rail beside the conversation, or the strip. */
function details(page: Page) {
	return page.getByTestId("thread-details");
}

/** A detail's term (`dt`) reading exactly `label`, as a person sees it. */
function term(page: Page, label: string) {
	return details(page)
		.getByRole("term")
		.filter({ hasText: new RegExp(`^\\s*${literal(label)}\\s*$`) })
		.filter({ visible: true });
}

/** The value (`dd`) paired with a term: the next value after it. */
function valueOf(termLocator: Locator) {
	return termLocator.locator("xpath=following-sibling::dd[1]");
}

/** The description list a term belongs to. */
function listOf(termLocator: Locator) {
	return termLocator.locator("xpath=ancestor::dl[1]");
}

/** The rows the details show: each detail is a term and its value. */
async function shownTerms(page: Page): Promise<string[]> {
	return (await details(page).getByRole("term").allInnerTexts()).map(collapse);
}

/**
 * The colour a person sees an element's text in: that of the element holding its first visible
 * word, so a value wrapped in a span reads as the span's colour. Null while it is not there.
 */
async function textColour(locator: Locator): Promise<string | null> {
	if ((await locator.count()) !== 1) {
		return null;
	}
	return locator.evaluate((el) => {
		const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
		for (let node = walker.nextNode(); node; node = walker.nextNode()) {
			if (node.textContent?.trim() && node.parentElement) {
				return getComputedStyle(node.parentElement).color;
			}
		}
		return null;
	});
}

/**
 * The Waiting tone: the text colour of the open thread's Waiting badge. The guest is Unassigned
 * and owed a reply, so the manager's header chip reads "Waiting" (Assign 12,
 * `data-status="waiting"`).
 */
async function waitingTone(page: Page, pane: string): Promise<string> {
	const badge = page
		.getByRole("article")
		.getByTestId("thread-status")
		.and(page.locator('[data-status="waiting"]'))
		.filter({ visible: true });
	await expect(badge, `the open thread's Waiting badge (${pane})`).toHaveCount(1, WITHIN_A_POLL);
	const tone = await textColour(badge);
	expect(tone, `the Waiting badge's text colour (${pane})`).not.toBeNull();
	return tone!;
}

function collapse(text: string): string {
	return text.replace(/\s+/g, " ").trim();
}

function literal(text: string): string {
	return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** The manager opens the thread by its link, in the given interface language. */
async function openThreadByLink(page: Page, locale: Locale, threadId: string, text: string) {
	await page.goto(`/${locale}/inbox?thread=${encodeURIComponent(threadId)}`);
	await expect(
		page.getByRole("article").getByTestId("message").filter({ hasText: text }),
		"the thread holds the guest's message",
	).toHaveCount(1);
	await expect(details(page), "exactly one set of guest details").toHaveCount(1);
}

/**
 * Nothing in the details opens or closes: no disclosure (`details` / `summary`), no button, and
 * nothing that says it is expanded or collapsed. The manager's owner control ("Assign to…", a
 * combobox in the rail's Owner section) is the one exception: it is not the guest's details.
 */
async function expectNothingOpens(check: typeof expect, page: Page, pane: string) {
	await check(
		details(page).locator("details, summary"),
		`no disclosure in the details (${pane})`,
	).toHaveCount(0);
	await check(details(page).getByRole("button"), `no button in the details (${pane})`).toHaveCount(
		0,
	);
	await check(
		details(page).locator('[aria-expanded]:not([data-test="thread-owner-select"])'),
		`nothing to expand or collapse in the details (${pane})`,
	).toHaveCount(0);
}

/** No "N missing" count anywhere in the details. */
async function expectNoCount(check: typeof expect, page: Page, pane: string) {
	await check(details(page), `no "N missing" count (${pane})`).not.toContainText(MISSING_COUNT, {
		useInnerText: true,
	});
}

/** No "Missing: …" line, the names set apart from the details' rows (before PR #261). */
async function expectNoMissingLine(check: typeof expect, page: Page, pane: string) {
	await check(details(page), `no "Missing:" line apart (${pane})`).not.toContainText(
		MISSING_LINE_PREFIX,
		{ useInnerText: true },
	);
}

/**
 * The Missing row as Guest details 1 and 3 promise it: the term, its value read exactly, in the
 * same list as the Area row, in the Waiting tone; no "Missing:" line apart and no count.
 */
async function expectMissingRow(check: typeof expect, page: Page, locale: Locale, pane: string) {
	const row = MISSING_ROW[locale];
	const missing = term(page, row.term);
	await check(missing, `a "${row.term}" row (${pane})`).toHaveCount(1, WITHIN_A_POLL);
	await check(valueOf(missing), `the "${row.term}" row's value (${pane})`).toHaveText(row.value, {
		useInnerText: true,
	});
	await check(
		listOf(missing)
			.getByRole("term")
			.filter({ hasText: new RegExp(`^${AREA_TERM[locale]}$`) }),
		`"${row.term}" is a row of the same list as "${AREA_TERM[locale]}" (${pane})`,
	).toHaveCount(1);

	const tone = await waitingTone(page, pane);
	// A plain value's colour, so "in the Waiting tone" can't pass on the default text colour.
	const plain = await textColour(valueOf(term(page, AREA_TERM[locale])));
	check(plain, `the "${AREA_TERM[locale]}" value's colour (${pane})`).not.toBeNull();
	check(plain, `the Waiting tone differs from a plain value's colour (${pane})`).not.toBe(tone);
	await check
		.poll(() => textColour(valueOf(missing)), {
			message: `the "${row.term}" value is in the Waiting tone, ${tone} (${pane})`,
		})
		.toBe(tone);

	await expectNoMissingLine(check, page, pane);
	await expectNoCount(check, page, pane);
}

// ---------------------------------------------------------------------------------------

test.describe.configure({ timeout: 180_000 });

// scenario: docs/e2e-scenarios.md Guest details 1
test.describe("Guest details 1 — the details name what to ask for", () => {
	test(`a guest who wrote "${ASKS_BUDGET_AND_MOVE_IN}": the details have a row "${MISSING_ROW.en.term}" reading "${MISSING_ROW.en.value}", in that order, in the Waiting tone, among the other rows, in the rail and in the strip; no "N missing" count, and nothing in the details opens or closes`, async ({
		office,
	}) => {
		const { manager } = office;
		const { page } = manager;
		// Every pane's every check is reported, not only the first to fail.
		const check = expect.configure({ soft: true });

		const guest = office.newGuest();
		await guest.write(ASKS_BUDGET_AND_MOVE_IN);
		const threadId = await threadIdOf(manager.api, guest);

		await page.setViewportSize(PANES[0].size);
		await openThreadByLink(page, "en", threadId, ASKS_BUDGET_AND_MOVE_IN);

		for (const { pane, size } of PANES) {
			await test.step(`${pane}: "${MISSING_ROW.en.term}" reads "${MISSING_ROW.en.value}", no count, nothing to open`, async () => {
				await page.setViewportSize(size);
				await expectMissingRow(check, page, "en", pane);
				await expectNothingOpens(check, page, pane);
			});
		}
	});
});

// scenario: docs/e2e-scenarios.md Guest details 2
test.describe("Guest details 2 — a guest who gave everything shows nothing missing", () => {
	test(`a guest who wrote "${GAVE_EVERYTHING}": no "Missing" row, no "N missing" count, nothing that opens, and no ${NEVER_MISSING_ROWS.join(", ")} row, in the rail and in the strip`, async ({
		office,
	}) => {
		const { manager } = office;
		const { page } = manager;
		const check = expect.configure({ soft: true });
		const label = fields("en");

		const guest = office.newGuest();
		await guest.write(GAVE_EVERYTHING);
		const threadId = await threadIdOf(manager.api, guest);

		await page.setViewportSize(PANES[0].size);
		await openThreadByLink(page, "en", threadId, GAVE_EVERYTHING);

		for (const { pane, size } of PANES) {
			await test.step(`${pane}: nothing missing, and no row for what the guest never said`, async () => {
				await page.setViewportSize(size);
				// What is absent is judged once the details show the budget and move-in the guest gave.
				await expect
					.poll(() => shownTerms(page), {
						message: `the details show the guest's budget and move-in (${pane})`,
						...WITHIN_A_POLL,
					})
					.toEqual(expect.arrayContaining([label.budget, label.moveIn]));

				await check(term(page, MISSING_ROW.en.term), `no "Missing" row (${pane})`).toHaveCount(0);
				await expectNoMissingLine(check, page, pane);
				await expectNoCount(check, page, pane);
				// Nothing folded away either (the section's rule): a row is one a person sees.
				await expectNothingOpens(check, page, pane);
				const terms = await shownTerms(page);
				for (const row of NEVER_MISSING_ROWS) {
					check(terms, `no ${row} row (${pane})`).not.toContain(row);
				}
			});
		}
	});
});

// scenario: docs/e2e-scenarios.md Guest details 3
test.describe("Guest details 3 — a Vietnamese operator reads the missing row in Vietnamese", () => {
	test(`the guest of 1, viewed in /vi/: the row "${MISSING_ROW.vi.term}" reads "${MISSING_ROW.vi.value}", in the Waiting tone, among the other rows, in the rail and in the strip, with no "N trường còn thiếu" count`, async ({
		office,
	}) => {
		const { manager } = office;
		const { page } = manager;
		const check = expect.configure({ soft: true });

		const guest = office.newGuest();
		await guest.write(ASKS_BUDGET_AND_MOVE_IN);
		const threadId = await threadIdOf(manager.api, guest);

		await page.setViewportSize(PANES[0].size);
		await openThreadByLink(page, "vi", threadId, ASKS_BUDGET_AND_MOVE_IN);

		for (const { pane, size } of PANES) {
			await test.step(`${pane}: "${MISSING_ROW.vi.term}" reads "${MISSING_ROW.vi.value}"`, async () => {
				await page.setViewportSize(size);
				await expectMissingRow(check, page, "vi", pane);
				await expectNothingOpens(check, page, pane);
			});
		}
	});
});
