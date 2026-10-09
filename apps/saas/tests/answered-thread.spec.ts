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
