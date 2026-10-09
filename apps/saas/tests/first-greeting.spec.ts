import fs from "node:fs";
import path from "node:path";

import type { APIRequestContext, Page } from "@playwright/test";

import { expect, test as base } from "./support/fixtures";
import type { Guest, OwnOffice } from "./support/own-office";
import {
	greetingIn,
	guestMessagesArrived,
	listedThreadOf,
	officeMessages,
	openByLink,
	readThread,
	threadIdOf,
	WITHIN_SECONDS,
	withOwnOffice,
} from "./support/own-office";
import { officeUrlOf } from "./support/seed";
import type { Api } from "./support/session";
import { appOrigin } from "./support/session";
import { deliverZalo } from "./support/zalo";

/**
 * The Inbox's copy, from packages/i18n/translations/en/saas.json: the auto-reply's meta line
 * (inbox.source.autoReply, inbox.autoReply.template, inbox.mock) and the reply box (inbox.reply).
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
		source: { autoReply: string };
		autoReply: { template: string };
	};
};

/** The office every greeting here signs as (ADR 0021, R7: the label names the office). */
const OFFICE_NAME = "Saigon Prime Test";

/** Any thanks to the guest: "Thanks for writing", "Thanks for getting in touch", "Thank you"… */
const THANKS = /\bthank/i;

/** The English label: the greeting's last line (ADR 0021, R7). */
const EN_LABEL = `Auto-reply from ${OFFICE_NAME}: a colleague will continue with you right here.`;

/* ---------------------------------------------------------------- the office and its guests */

/**
 * An office of the test's own named exactly "Saigon Prime Test" (a slug of its own, so parallel
 * tests never collide; deleted afterwards), with a manager (the kit's `admin`) who accepted their
 * invitation and reads every thread, an agent on ask, and a Zalo OA of its own (released
 * afterwards).
 */
const test = base.extend<{ office: OwnOffice }>({
	office: ({ admin, browser, request }, use) =>
		withOwnOffice({ admin, browser, request }, { tag: "greeting", name: OFFICE_NAME }, use),
});

/** The office greets the guest within seconds: the thread's one office message, once it is there. */
async function greetingOf(manager: Api, guest: Guest): Promise<string> {
	return greetingIn(manager, await threadIdOf(manager, guest.id));
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

/** A view button of the Inbox (a manager's Your turn is named Waiting (#210) / Sent), with its count. */
function view(page: Page, name: "Waiting" | "Sent", count: number) {
	return page.getByRole("button", { name: `${name} ${count}`, exact: true });
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

/** Messages in the open thread whose meta line says where they came from (exactly this). */
function sourced(page: Page, source: string) {
	return openThread(page)
		.getByTestId("message-source")
		.filter({ hasText: new RegExp(`^${source}$`) });
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
		const first = "Hi, we're looking to rent an apartment in Tay Ho";
		await guest.write(first);

		const text = await greetingOf(manager.api, guest);
		const { id: threadId } = await listedThreadOf(manager.api, guest.id);
		expect(
			(await readThread(manager.api, threadId)).messages,
			"the thread holds two messages",
		).toHaveLength(2);

		// What it says.
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
		const listed = await listedThreadOf(manager.api, guest.id);
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

		// In the thread, opened from its row in the Inbox already open: the office's message,
		// marked Auto-reply, Template and the mock badge.
		await rowOf(page, guest).click();
		await expect(openThread(page).getByText(first, { exact: true })).toBeVisible();
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

		await greetingOf(manager.api, guest);
		const later = office.newGuest();
		await later.write(`Hello from ${later.id}`);
		await greetingOf(manager.api, later);

		const threadId = await threadIdOf(manager.api, guest.id);
		const { messages } = await readThread(manager.api, threadId);
		expect(
			messages.filter((m) => m.direction === "in").map((m) => m.text),
			"both of the guest's messages arrived",
		).toEqual(expect.arrayContaining([first, second]));
		expect(
			messages.filter((m) => m.direction === "out"),
			"exactly one auto-reply",
		).toHaveLength(1);
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
				const text = await greetingOf(manager.api, guest);
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

/**
 * The template suggested reply on a thread the office has sent nothing to (ADR 0024; First
 * greeting 5): it names the office and thanks the guest, once, in these words.
 */
const NAMES_THE_OFFICE = `this is ${OFFICE_NAME}`;
const THANKS_ONCE = "Thanks for getting in touch";

/** The old first-reply template's opening (ADR 0021, Context), which the template replaces. */
const OLD_FIRST_REPLY = /Thanks for writing/i;

/** The office's settings, General tab, where a manager finds the switch. */
function settingsAddress(office: OwnOffice) {
	return officeUrlOf(office.slug, "settings/general");
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
	test(`the manager switches the auto-reply off from Office settings: a new guest gets no auto-reply and the reply box holds the template suggested reply, which names the office ("${NAMES_THE_OFFICE}") and thanks once ("${THANKS_ONCE}"), never "Thanks for writing"; switched back on, the next new guest is greeted, and the guest who wrote while it was off writes again and is still not greeted (S1)`, async ({
		office,
	}) => {
		const { manager } = office;
		const { page } = manager;

		await test.step("the manager reaches the switch from the user menu: on by default", async () => {
			await openInbox(page);
			await openUserMenu(page);
			await expect(officeSettingsItem(page), "the user menu offers Office settings").toBeVisible();
			await officeSettingsItem(page).click();
			await expect(page).toHaveURL(new RegExp(`${officeUrlOf(office.slug, "settings/general")}$`));
			await expect(autoReplySwitch(page), "the auto-reply is on by default").toBeChecked();
		});

		await test.step("switched off", () => switchAutoReply(page, false));

		const offGuest = office.newGuest();
		const offFirst = "Hi, we're looking to rent an apartment in Tay Ho";
		await test.step("a new guest writes while it is off: the reply box holds the template, which names the office and thanks the guest once", async () => {
			await offGuest.write(offFirst);
			await openByLink(page, await threadIdOf(manager.api, offGuest.id), offFirst);
			const box = replyBoxOnPage(page);
			await expect(box, `the reply box names the office ("${NAMES_THE_OFFICE}")`).toHaveValue(
				new RegExp(NAMES_THE_OFFICE),
				WITHIN_SECONDS,
			);
			const text = await box.inputValue();
			expect(text, `it thanks the guest: "${THANKS_ONCE}"`).toContain(THANKS_ONCE);
			expect(
				text.match(new RegExp(THANKS.source, "gi")) ?? [],
				"it thanks the guest once",
			).toHaveLength(1);
			expect(text, 'not the old first reply\'s "Thanks for writing"').not.toMatch(OLD_FIRST_REPLY);
		});

		await test.step("switched back on", async () => {
			await page.goto(settingsAddress(office));
			await switchAutoReply(page, true);
		});

		const offThreadId = await threadIdOf(manager.api, offGuest.id);
		await test.step("the guest whose thread began while it was off writes again (S1)", async () => {
			await offGuest.write("Also, is parking included?");
			await guestMessagesArrived(manager.api, offThreadId, 2);
		});

		await test.step("the next new guest is greeted", async () => {
			const next = office.newGuest();
			await next.write("Hi, we're looking to rent an apartment in Tay Ho");
			const greeting = await greetingOf(manager.api, next);
			expect(lastLine(greeting), "the office's auto-reply").toBe(EN_LABEL);
		});

		// The next guest's greeting has arrived, so one for either of the off guest's messages
		// would have too.
		await test.step("the guest who wrote while it was off has no auto-reply", async () => {
			expect(
				await officeMessages(manager.api, offThreadId),
				"no auto-reply: not while it was off, nor after it came back on (S1)",
			).toEqual([]);
			await openByLink(page, offThreadId, offFirst);
			await expect(sourced(page, saas.inbox.source.autoReply)).toHaveCount(0);
		});
	});

	test("PUT /api/office/auto-reply refuses a signed-out caller (401) and an agent (403), and a new guest is still greeted; the manager's turns it off (200 { on: false }), as the settings page then shows, and an agent can't turn it back on", async ({
		office,
		request,
	}) => {
		const { manager } = office;
		const agent = await office.agent();
		const signedOut = await putAutoReply(request, false);
		expect.soft(signedOut.status(), "signed out, the API refuses").toBe(401);
		const byAgent = await putAutoReply(agent.page.request, false);
		expect.soft(byAgent.status(), "an agent is refused").toBe(403);

		// Refused, so nothing changed: a new guest is still greeted.
		const guest = office.newGuest();
		await guest.write(`Hello from ${guest.id}`);
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
	});
});

/* ---------------------------------------------------------------- the operator line (#242) */

/** The line's label, in the scenario's own words: the office language, English by default. */
const IN_ENGLISH = "In English";

/** The open thread's operator lines (#242): under a bubble's text, or under the reply box. */
function officeLines(page: Page) {
	return openThread(page).getByTestId("office-line");
}

// scenario: docs/e2e-scenarios.md First greeting 9
test.describe("First greeting 9 — an English-reading agent reads the Korean auto-reply and suggestion in English", () => {
	test("a Korean guest's auto-reply and the reply box each show \"In English\" with the English template under them, in an English office; typing takes the box's line away", async ({
		office,
	}) => {
		const { manager } = office;
		const guest = office.newGuest();
		const korean = "안녕하세요, 떠이호에서 아파트를 임대하고 싶어요";
		await guest.write(korean);
		const threadId = await threadIdOf(manager.api, guest.id);
		const greeting = await greetingIn(manager.api, threadId);
		expect(greeting, "the auto-reply is in Korean").toMatch(HANGUL);

		const { page } = manager;
		await openByLink(page, threadId, korean);

		// Inside the auto-reply's bubble, under the Korean: the English auto-reply.
		const bubble = openThread(page)
			.getByTestId("message")
			.filter({ hasText: greeting.split("\n")[0] });
		const greetingLine = bubble.getByTestId("office-line");
		await expect(greetingLine.getByTestId("office-line-label")).toHaveText(IN_ENGLISH);
		await expect(greetingLine, "the English auto-reply").toContainText("Thanks for writing to us.");
		await expect(greetingLine, "its English label").toContainText(EN_LABEL);

		// Under the reply box, holding the Korean template: the English template.
		const replyLine = officeLines(page).filter({ hasText: `Hi, this is ${OFFICE_NAME}.` });
		await expect(replyLine, "the English template under the box").toBeVisible(WITHIN_SECONDS);
		await expect(replyLine.getByTestId("office-line-label")).toHaveText(IN_ENGLISH);
		const box = openThread(page).getByRole("textbox", { name: saas.inbox.reply, exact: true });
		await expect(box, "the box holds the Korean template").toHaveValue(HANGUL);

		// The manager types: the line under the box goes; the auto-reply's stays.
		await box.fill("제가 직접 답장하겠습니다.");
		await expect(replyLine, "no line once the box is edited").toHaveCount(0);
		await expect(greetingLine).toBeVisible();
	});
});
