import type { Locator, Page } from "@playwright/test";

import { expect, test as base } from "./support/fixtures";
import type { OwnOffice } from "./support/own-office";
import { literal, threadIdOf, threadLink, withOwnOffice } from "./support/own-office";

/* ---------------------------------------------------------------- what the scenario promises */

/**
 * The scenario's own words (docs/e2e-scenarios.md, Guest details), written out rather than read
 * from saas.json: they are the contract the details must meet. The Missing row is a term and its
 * value, one more row of the details (Eyal on PR #261).
 */
const MISSING_ROW = { term: "Missing", value: "budget, move-in" } as const;

/**
 * The details' Area row, one of "the other details" the Missing row sits among (the interface's
 * own label, as a person reads it).
 */
const AREA_TERM = "Area";

/** The old separate line's opening ("Missing: …"), in either interface language. */
const MISSING_LINE_PREFIX = /(?:Missing|Còn thiếu)\s*:/;

/**
 * A "N missing" count, in either interface language (VI "N trường còn thiếu" before #244), on one
 * line as read; never a "Missing:" opening after a value ending in a digit.
 */
const MISSING_COUNT = /\d+[  ]*(?:missing|trường còn thiếu)(?![  ]*:)/i;

/** The guest of Guest details 1: rent, area and beds given; budget and move-in not. */
const ASKS_BUDGET_AND_MOVE_IN = "I want to rent a 2 bedroom in Tay Ho.";

/**
 * Guest details 4: a Russian guest's move-in and budget, as an English office reads them (the
 * scenario's own words). The values are terms' values, as the Missing row's is.
 */
const RUSSIAN_GUEST = "3 bedroom, на этой неделе, бюджет $2000/month";
const IN_ENGLISH = [
	{ term: "Move-in", value: "This week" },
	{ term: "Budget", value: "$2,000 / month" },
] as const;

/**
 * A wide thread pane, where the guest's details sit in a rail beside the conversation, and a
 * narrow one (the sidebar open), where they fold into a strip under the header (Thread layout 1
 * and 2).
 */
const PANES = [
	{ pane: "wide (the rail)", size: { width: 1563, height: 784 }, strip: false },
	{ pane: "narrow (the strip)", size: { width: 1366, height: 768 }, strip: true },
] as const;

/** A phone, where the thread fills the screen and its details are the strip (Guest details 7). */
const PHONE = { width: 390, height: 844 } as const;

/**
 * Guest details 7: a guest who gave the area, rent, beds, a move-in and a stay length, more than
 * the phone's one stay line holds; the stay length is the fact at its cut end.
 */
const LONG_STAY = "I want to rent a 2 bedroom in Tay Ho from next Friday for 6 months.";
const CUT_FACT = { term: "Stay", value: "6 months" } as const;

/** The strip's stay line, and the control over it that opens every fact (the scenario's words). */
const SHOW_ALL = "Show all guest details";

/** The details settle within a poll of the thread opening; three production polls of margin. */
const WITHIN_A_POLL = { timeout: 30_000 };

/* ---------------------------------------------------------------- the office and its guests */

/**
 * An office of the test's own (deleted afterwards), its own Zalo OA (released afterwards), and a
 * manager (the kit's `admin`) who reads every thread, Unassigned ones included.
 */
const test = base.extend<{ office: OwnOffice }>({
	office: ({ admin, browser, request }, use) =>
		withOwnOffice({ admin, browser, request }, { tag: "details", name: "Details Test" }, use),
});

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

/** The manager opens the thread by its link. */
async function openThreadByLink(page: Page, threadId: string, text: string) {
	await page.goto(threadLink(threadId));
	await expect(
		page.getByRole("article").getByTestId("message").filter({ hasText: text }),
		"the thread holds the guest's message",
	).toHaveCount(1);
	await expect(details(page), "exactly one set of guest details").toHaveCount(1);
}

/**
 * Nothing in the rail opens or closes, and in the strip only the stay line does (it opens the
 * sheet, Guest details 7): no disclosure (`details` / `summary`), no other button, and nothing
 * that says it is expanded or collapsed. The manager's owner control ("Assign to…", a combobox in
 * the rail's Owner section) is the one exception: it is not the guest's details.
 */
async function expectOnlyTheLineOpens(
	check: typeof expect,
	page: Page,
	pane: string,
	strip: boolean,
) {
	await check(
		details(page).locator("details, summary"),
		`no disclosure in the details (${pane})`,
	).toHaveCount(0);
	if (strip) {
		const buttons = details(page).getByRole("button");
		await check(buttons, `one button in the strip (${pane})`).toHaveCount(1);
		await check(buttons, `the strip's one button is its stay line (${pane})`).toHaveAccessibleName(
			SHOW_ALL,
		);
	} else {
		await check(details(page).getByRole("button"), `no button in the rail (${pane})`).toHaveCount(
			0,
		);
	}
	await check(
		details(page).locator('[aria-expanded]:not([data-test="thread-owner-select"])'),
		`nothing to expand or collapse in the details (${pane})`,
	).toHaveCount(0);
}

/**
 * The Missing row as Guest details 1 promises it: the term, its value read exactly, in the same
 * list as the Area row, in the Waiting tone; no "Missing:" line apart and no count.
 */
async function expectMissingRow(check: typeof expect, page: Page, pane: string) {
	const missing = term(page, MISSING_ROW.term);
	await check(missing, `a "${MISSING_ROW.term}" row (${pane})`).toHaveCount(1, WITHIN_A_POLL);
	await check(valueOf(missing), `the "${MISSING_ROW.term}" row's value (${pane})`).toHaveText(
		MISSING_ROW.value,
		{ useInnerText: true },
	);
	await check(
		listOf(missing)
			.getByRole("term")
			.filter({ hasText: new RegExp(`^${AREA_TERM}$`) }),
		`"${MISSING_ROW.term}" is a row of the same list as "${AREA_TERM}" (${pane})`,
	).toHaveCount(1);

	const tone = await waitingTone(page, pane);
	// A plain value's colour, so "in the Waiting tone" can't pass on the default text colour.
	const plain = await textColour(valueOf(term(page, AREA_TERM)));
	check(plain, `the "${AREA_TERM}" value's colour (${pane})`).not.toBeNull();
	check(plain, `the Waiting tone differs from a plain value's colour (${pane})`).not.toBe(tone);
	await check
		.poll(() => textColour(valueOf(missing)), {
			message: `the "${MISSING_ROW.term}" value is in the Waiting tone, ${tone} (${pane})`,
		})
		.toBe(tone);

	// No "Missing: …" line, the names set apart from the details' rows (before PR #261).
	await check(details(page), `no "Missing:" line apart (${pane})`).not.toContainText(
		MISSING_LINE_PREFIX,
		{ useInnerText: true },
	);
	await check(details(page), `no "N missing" count (${pane})`).not.toContainText(MISSING_COUNT, {
		useInnerText: true,
	});
}

// ---------------------------------------------------------------------------------------

test.describe.configure({ timeout: 180_000 });

// scenario: docs/e2e-scenarios.md Guest details 1
test.describe("Guest details 1 — the details name what to ask for", () => {
	test(`a guest who wrote "${ASKS_BUDGET_AND_MOVE_IN}": the details have a row "${MISSING_ROW.term}" reading "${MISSING_ROW.value}", in that order, in the Waiting tone, among the other rows, in the rail and in the strip; no "N missing" count; nothing in the rail opens, and in the strip only the stay line does`, async ({
		office,
	}) => {
		const { manager } = office;
		const { page } = manager;
		// Every pane's every check is reported, not only the first to fail.
		const check = expect.configure({ soft: true });

		const guest = office.newGuest();
		await guest.write(ASKS_BUDGET_AND_MOVE_IN);
		const threadId = await threadIdOf(manager.api, guest.id);

		await page.setViewportSize(PANES[0].size);
		await openThreadByLink(page, threadId, ASKS_BUDGET_AND_MOVE_IN);

		for (const { pane, size, strip } of PANES) {
			await test.step(`${pane}: "${MISSING_ROW.term}" reads "${MISSING_ROW.value}", no count, ${strip ? "only the stay line opens" : "nothing to open"}`, async () => {
				await page.setViewportSize(size);
				await expectMissingRow(check, page, pane);
				await expectOnlyTheLineOpens(check, page, pane, strip);
			});
		}
	});
});

// scenario: docs/e2e-scenarios.md Guest details 4
test.describe("Guest details 4 — an English office reads a Russian guest's details in English", () => {
	test(`a guest who wrote "${RUSSIAN_GUEST}": the details read Move-in "This week" and Budget "$2,000 / month"`, async ({
		office,
	}) => {
		const { manager } = office;
		const { page } = manager;
		const check = expect.configure({ soft: true });

		const guest = office.newGuest();
		await guest.write(RUSSIAN_GUEST);
		const threadId = await threadIdOf(manager.api, guest.id);

		await page.setViewportSize(PANES[0].size);
		await openThreadByLink(page, threadId, RUSSIAN_GUEST);

		for (const { term: label, value } of IN_ENGLISH) {
			const row = term(page, label);
			await check(row, `a "${label}" row`).toHaveCount(1, WITHIN_A_POLL);
			await check(valueOf(row), `the "${label}" row reads "${value}"`).toHaveText(value, {
				useInnerText: true,
			});
		}
	});
});

// scenario: docs/e2e-scenarios.md Guest details 7
test.describe("Guest details 7 — on a phone, the stay line opens every fact", () => {
	test(`a guest who wrote "${LONG_STAY}": on a phone the stay line is cut short; tapped, a sheet opens with every fact whole, "${CUT_FACT.term}" reading "${CUT_FACT.value}"`, async ({
		office,
	}) => {
		const { manager } = office;
		const { page } = manager;

		const guest = office.newGuest();
		await guest.write(LONG_STAY);
		const threadId = await threadIdOf(manager.api, guest.id);

		await page.setViewportSize(PHONE);
		await openThreadByLink(page, threadId, LONG_STAY);

		// The line holds more than a phone's width: it ends in an ellipsis rather than wrapping.
		const line = details(page).getByTestId("stay-line");
		await expect(line, "the stay line").toContainText("Tây Hồ", WITHIN_A_POLL);
		await expect
			.poll(() => line.evaluate((el) => el.scrollWidth > el.clientWidth), {
				message: "the phone's stay line is cut short",
			})
			.toBe(true);

		await test.step(`tapped, the line opens a sheet where "${CUT_FACT.term}" reads "${CUT_FACT.value}"`, async () => {
			await details(page).getByRole("button", { name: SHOW_ALL, exact: true }).click();
			const sheet = page.getByRole("dialog", { name: "Guest details" });
			await expect(sheet, "the details sheet").toBeVisible();
			const stay = sheet.getByRole("term").filter({ hasText: new RegExp(`^${CUT_FACT.term}$`) });
			await expect(stay, `the sheet's "${CUT_FACT.term}"`).toBeVisible();
			await expect(valueOf(stay)).toHaveText(CUT_FACT.value, { useInnerText: true });
			await expect(details(page), "the strip itself stays one set of details").toHaveCount(1);
		});
	});
});
