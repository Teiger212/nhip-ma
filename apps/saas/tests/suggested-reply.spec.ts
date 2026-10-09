import fs from "node:fs";
import path from "node:path";

import type { Locator, Page } from "@playwright/test";

import { assignerAs } from "./support/assign";
import { expect, test as base } from "./support/fixtures";
import type { Joined } from "./support/operators";
import type { Guest } from "./support/own-office";
import {
	greetingIn,
	literal,
	openByLink,
	threadIdOf,
	WITHIN_SECONDS,
	withOwnOffice,
} from "./support/own-office";

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
 * rather than read from saas.json: the wording is the contract.
 */
const TEMPLATE_LABEL = "Suggested reply · template";

/** The guest's first message: the auto-reply to it asks for the budget, then move-in. */
const FIRST_MESSAGE = "Hi, we're looking to rent an apartment in Tay Ho";

/** A change the Inbox learns of by its poll: three production polls, for CI's margin. */
const WITHIN_POLLS = { timeout: 30_000 };

/**
 * The reply box's own name, which is how a person finds it, not what a scenario promises
 * (packages/i18n/translations/en/saas.json, `inbox.reply`).
 */
const REPLY_LABEL = (
	JSON.parse(
		fs.readFileSync(
			path.resolve(__dirname, "../../../packages/i18n/translations/en/saas.json"),
			"utf8",
		),
	) as { inbox: { reply: string } }
).inbox.reply;

/* ---------------------------------------------------------------- the office and its guests */

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
	office: ({ admin, browser, request }, use) =>
		withOwnOffice(
			{ admin, browser, request },
			{ tag: "suggest", name: OFFICE_NAME, manager: MANAGER, agent: AGENT },
			async (office) =>
				use({
					manager: { ...office.manager, ...MANAGER },
					agent: { ...(await office.agent()), ...AGENT },
					newGuest: office.newGuest,
				}),
		),
});

/** The guest writes their first message and the office greets them: their thread's id. */
async function greetedGuest(office: TemplateOffice): Promise<{ guest: Guest; threadId: string }> {
	const guest = office.newGuest();
	await guest.write(FIRST_MESSAGE);
	const threadId = await threadIdOf(office.manager.api, guest.id);
	await greetingIn(office.manager.api, threadId);
	return { guest, threadId };
}

/* ---------------------------------------------------------------- the Inbox */

function openThread(page: Page) {
	return page.getByRole("article");
}

/**
 * The manager opens the guest's thread from Unassigned, where their Inbox opens and where the
 * thread stays open once assigned (#267).
 */
async function openUnderUnassigned(page: Page, guest: Guest, latestText: string) {
	await page.goto("/en/inbox");
	await expect(page.getByRole("button", { name: /^Unassigned \d+$/ })).toHaveAttribute(
		"aria-pressed",
		"true",
	);
	await page.getByRole("textbox", { name: "Search conversations" }).fill(guest.id);
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
function replyBox(page: Page) {
	return openThread(page).getByRole("textbox", { name: REPLY_LABEL, exact: true });
}

/** The label above the reply box saying it holds the template (spacing around "·" aside). */
function templateLabel(page: Page): Locator {
	const [what, source] = TEMPLATE_LABEL.split(" · ");
	return openThread(page).getByText(
		new RegExp(`^\\s*${literal(what)}\\s*·\\s*${literal(source)}\\s*$`),
	);
}

/** The text starts with exactly this sentence. */
function startingWith(sentence: string): RegExp {
	return new RegExp(`^${literal(sentence)}`);
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
	test(`a greeted guest's thread, assigned to Lan Pham, opens for her with the reply box starting "${AGENT_INTRO}", no thanks and no "a colleague", labelled "${TEMPLATE_LABEL}"`, async ({
		office,
	}) => {
		const { manager, agent } = office;
		const { threadId } = await greetedGuest(office);
		await assignerAs(manager.api).assignTo(threadId, agent.userId);

		const { page } = agent;
		await openByLink(page, threadId, FIRST_MESSAGE);
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
		await expect(templateLabel(page), `labelled "${TEMPLATE_LABEL}"`).toBeVisible();
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
		await openUnderUnassigned(page, guest, FIRST_MESSAGE);
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
