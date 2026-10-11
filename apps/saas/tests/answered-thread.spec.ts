import { randomUUID } from "node:crypto";

import type { APIRequestContext, Page } from "@playwright/test";

import { assignerAs } from "./support/assign";
import { expect, test as base } from "./support/fixtures";
import type { Joined } from "./support/operators";
import { joinOffice } from "./support/operators";
import { connectZaloOa, releaseZaloOa } from "./support/pipes";
import { sendZaloText } from "./support/zalo";

/**
 * A page learns of a guest's new message when the Inbox asks again: every second in the E2E build
 * (#222). The ceiling stays three production polls, for CI's margin.
 */
const WITHIN_A_POLL = { timeout: 30_000 };

/** The answered line, as #94 words it: "Answered · Sent <when> · waiting for the guest". */
const ANSWERED = /^Answered · Sent .+ · waiting for the guest$/;

/** A nameless Zalo guest of this test, listed by their Zalo id. */
type Guest = { id: string; write: (text: string) => Promise<void> };

/**
 * An office of the test's own with a Zalo OA of its own (released afterwards, even when the test
 * failed), so no other spec's guests are in its Inbox.
 */
const test = base.extend<{ office: { id: string; newGuest: () => Guest } }>({
	office: async ({ admin, request }, use) => {
		const office = await admin.createOffice("Answered thread");
		const oaId = `e2e-answered-oa-${randomUUID()}`;
		await connectZaloOa(office.id, oaId);
		try {
			await use({ id: office.id, newGuest: () => zaloGuest(request, oaId) });
		} finally {
			await releaseZaloOa(oaId);
		}
	},
});

function zaloGuest(request: APIRequestContext, oaId: string): Guest {
	const id = `e2e-answered-guest-${randomUUID()}`;
	return { id, write: (text) => sendZaloText(request, { guestId: id, oaId, text }) };
}

/** The open thread. */
function openThread(page: Page) {
	return page.getByRole("article");
}

function replyBox(page: Page) {
	return openThread(page).getByRole("textbox", { name: "Reply" });
}

// scenario: docs/e2e-scenarios.md Thread layout 6
test.describe("Thread layout 6 — an answered thread shows no draft until the guest writes again", () => {
	test("the agent approves a reply: the reply box folds to 'Answered · Sent … · waiting for the guest', with no draft and no Approve and send; the guest writes again and the reply box is back, ready to answer", async ({
		admin,
		browser,
		office,
	}) => {
		test.setTimeout(120_000);
		const guest = office.newGuest();
		const first = `Hello, a studio near the lake? ${randomUUID().slice(0, 8)}`;
		await guest.write(first);

		// The office's agent, given the guest by its manager (ADR 0022): setup.
		let agent: Joined | undefined;
		let manager: Joined | undefined;
		try {
			[agent, manager] = await Promise.all([
				joinOffice(admin, browser, office.id, "member", "answered").then((a) => (agent = a)),
				joinOffice(admin, browser, office.id, "admin", "answered-manager").then(
					(m) => (manager = m),
				),
			]);
			await assignerAs(manager.api).assignGuestTo(guest.id, agent.userId);
			const { page } = agent;

			// All keeps the thread open once it is answered (Your turn moves on).
			await page.goto("/en/inbox?view=all");
			await page
				.getByRole("complementary")
				.getByRole("button", { name: new RegExp(`^${guest.id}\\b`) })
				.click();
			await expect(openThread(page).getByText(first, { exact: true })).toBeVisible();

			// The guest waits: the reply box holds a draft, ready to approve.
			await expect(replyBox(page), "the guest waits: a draft to approve").toBeVisible();
			await replyBox(page).fill(`Reply to ${guest.id}`);
			const sent = page.waitForResponse((r) => r.url().endsWith("/approve"));
			await openThread(page).getByTestId("approve-and-send").click();
			expect((await sent).status(), "the reply is sent").toBe(200);

			// Answered: one line, no draft, no Approve and send.
			await expect(
				openThread(page).getByTestId("send-status"),
				"the reply box says the thread is answered and waits for the guest",
			).toHaveText(ANSWERED);
			await expect(replyBox(page), "no draft while nothing waits").toHaveCount(0);
			await expect(
				openThread(page).getByTestId("approve-and-send"),
				"no Approve and send while nothing waits",
			).toHaveCount(0);

			// The guest writes again: the reply box is back, with something to approve.
			const again = `Is it still free next week? ${randomUUID().slice(0, 8)}`;
			await guest.write(again);
			await expect(
				openThread(page).getByText(again, { exact: true }),
				"the guest's new message is in the thread",
			).toBeVisible(WITHIN_A_POLL);
			await expect(replyBox(page), "the guest waits again: the reply box is back").toBeVisible();
			await expect(
				openThread(page).getByTestId("approve-and-send"),
				"Approve and send is back",
			).toBeVisible();
			await expect(openThread(page).getByTestId("send-status")).not.toHaveText(ANSWERED);
		} finally {
			await Promise.all([agent?.close(), manager?.close()]);
		}
	});
});

/** All caught up's words in the open card (#330), as the scenario words them. */
const CAUGHT_UP = "All caught up.";
const CAUGHT_UP_NEXT = "No guest is waiting on you. The next one to write will open here.";

// scenario: docs/e2e-scenarios.md Thread layout 7
test.describe("Thread layout 7 — the last reply sent leaves the agent All caught up, with a way back on a phone", () => {
	test("the agent approves the only waiting guest's reply: the card says All caught up and names the reply that went; at 390 wide it offers View sent, which shows the list on Sent", async ({
		admin,
		browser,
		office,
	}) => {
		test.setTimeout(120_000);
		const guest = office.newGuest();
		const first = `Hello, a two-bedroom in Tay Ho? ${randomUUID().slice(0, 8)}`;
		await guest.write(first);

		let agent: Joined | undefined;
		let manager: Joined | undefined;
		try {
			[agent, manager] = await Promise.all([
				joinOffice(admin, browser, office.id, "member", "caught-up").then((a) => (agent = a)),
				joinOffice(admin, browser, office.id, "admin", "caught-up-manager").then(
					(m) => (manager = m),
				),
			]);
			await assignerAs(manager.api).assignGuestTo(guest.id, agent.userId);
			const { page } = agent;

			// Your turn holds the one guest: the agent opens them and approves the reply.
			await page.goto("/en/inbox?view=yourTurn");
			await page
				.getByRole("complementary")
				.getByRole("button", { name: new RegExp(`^${guest.id}\\b`) })
				.click();
			await expect(openThread(page).getByText(first, { exact: true })).toBeVisible();
			await replyBox(page).fill(`Reply to ${guest.id}`);
			const sent = page.waitForResponse((r) => r.url().endsWith("/approve"));
			await openThread(page).getByTestId("approve-and-send").click();
			expect((await sent).status(), "the reply is sent").toBe(200);

			// The card says the queue is done, and which reply went last.
			const caughtUp = openThread(page).getByTestId("caught-up");
			await expect(caughtUp.getByText(CAUGHT_UP, { exact: true })).toBeVisible();
			await expect(caughtUp.getByText(CAUGHT_UP_NEXT, { exact: true })).toBeVisible();
			await expect(caughtUp.getByTestId("caught-up-last-sent")).toHaveText(
				new RegExp(`^Last reply sent to ${guest.id} at .+$`),
			);

			// On a phone the card is the whole screen: View sent is the way back to the list.
			await page.setViewportSize({ width: 390, height: 844 });
			const viewSent = openThread(page).getByRole("button", { name: "View sent", exact: true });
			await expect(viewSent, "the phone's card offers View sent").toBeVisible();
			await viewSent.click();
			await expect(
				page.getByRole("button", { name: /^Sent \d+$/ }),
				"the list is back, on Sent",
			).toHaveAttribute("aria-pressed", "true");
			await expect(openThread(page), "the card has given the screen back to the list").toBeHidden();
		} finally {
			await Promise.all([agent?.close(), manager?.close()]);
		}
	});
});

// scenario: docs/e2e-scenarios.md Thread layout 8
test.describe("Thread layout 8 — a sent reply says Sent on its row, then the thread below it opens", () => {
	test("with three guests waiting, the agent approves the middle one's reply: its row says Sent, then leaves, and the third guest's thread opens, not the first", async ({
		admin,
		browser,
		office,
	}) => {
		test.setTimeout(120_000);
		// Three guests, written one after the other: Your turn lists them oldest first.
		const guests = [office.newGuest(), office.newGuest(), office.newGuest()];
		const firsts = guests.map((guest, n) => `Hello from guest ${n + 1}, ${guest.id.slice(-8)}`);
		for (const [n, guest] of guests.entries()) await guest.write(firsts[n]);
		const [, middle, below] = guests;

		let agent: Joined | undefined;
		let manager: Joined | undefined;
		try {
			[agent, manager] = await Promise.all([
				joinOffice(admin, browser, office.id, "member", "handoff").then((a) => (agent = a)),
				joinOffice(admin, browser, office.id, "admin", "handoff-manager").then(
					(m) => (manager = m),
				),
			]);
			const assigner = assignerAs(manager.api);
			for (const guest of guests) await assigner.assignGuestTo(guest.id, agent.userId);
			const { page } = agent;
			const list = page.getByRole("complementary");
			const row = (guest: Guest) =>
				list.getByRole("button", { name: new RegExp(`^${guest.id}\\b`) });

			// The agent opens the middle guest and approves the reply.
			await page.goto("/en/inbox?view=yourTurn");
			await expect(row(below), "all three guests are listed").toBeVisible(WITHIN_A_POLL);
			await row(middle).click();
			await expect(openThread(page).getByText(firsts[1], { exact: true })).toBeVisible();
			await replyBox(page).fill(`Reply to ${middle.id}`);
			// Sent shows for half a second: watched every frame from before the click, not polled.
			const saysSent = page.waitForFunction(
				() => document.querySelector('[data-test="thread-row-sent"]')?.textContent === "Sent",
				null,
				{ polling: "raf", timeout: 30_000 },
			);
			const sent = page.waitForResponse((r) => r.url().endsWith("/approve"));
			await openThread(page).getByTestId("approve-and-send").click();
			expect((await sent).status(), "the reply is sent").toBe(200);

			// The row says Sent, then goes; the thread that was below it is open.
			await saysSent;
			await expect(row(middle), "the answered row leaves the list").toHaveCount(0);
			await expect(row(below), "the thread below is the current one").toHaveAttribute(
				"aria-current",
				"true",
			);
			await expect(openThread(page).getByText(firsts[2], { exact: true })).toBeVisible();
		} finally {
			await Promise.all([agent?.close(), manager?.close()]);
		}
	});
});
