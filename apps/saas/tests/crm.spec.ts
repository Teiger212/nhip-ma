import { randomUUID } from "node:crypto";

import type { APIRequestContext, Locator, Page } from "@playwright/test";

import { markLeadLost } from "./support/crm";
import { expect, test as base } from "./support/fixtures";
import { openInboxAsNewAccount, signUpByInvitationLink } from "./support/invitee";
import { connectZaloOa, releaseZaloOa } from "./support/pipes";
import { clientIpHeaders } from "./support/session";
import { sendZaloText } from "./support/zalo";

/**
 * A new office of this test's own, holding a Zalo OA of its own, with one plain agent signed
 * in on their Inbox. Nothing else writes to it, so the Inbox's counts are exact.
 */
type Desk = {
	officeId: string;
	/** The agent's page. */
	page: Page;
	/** A new guest of this test writes to the office's OA; resolves with Zalo's id for them. */
	newGuest: () => Promise<string>;
	/** The guest writes again, on the same OA. */
	writeAgain: (guestId: string) => Promise<void>;
};

const test = base.extend<{ desk: Desk }>({
	desk: async ({ admin, browser, request }, use) => {
		const office = await admin.createOffice("CRM 5");
		const email = admin.newEmail("crm5-agent");
		const invitationId = await admin.invite(email, office.id);
		const context = await browser.newContext({ extraHTTPHeaders: clientIpHeaders(email) });
		const page = await context.newPage();
		await signUpByInvitationLink(page, invitationId, email);
		await openInboxAsNewAccount(page);

		const oaId = uniqueId("oa");
		connectZaloOa(office.id, oaId);
		await use({
			officeId: office.id,
			page,
			newGuest: async () => {
				const guestId = uniqueId("guest");
				await guestWrites(request, oaId, guestId);
				return guestId;
			},
			writeAgain: (guestId) => guestWrites(request, oaId, guestId),
		});
		releaseZaloOa(oaId);
		await context.close();
	},
});

/** A vendor id (OA, guest) no other test, repeat or earlier run uses. */
function uniqueId(kind: string): string {
	return `e2e-crm-${kind}-${randomUUID()}`;
}

async function guestWrites(request: APIRequestContext, oaId: string, guestId: string) {
	const status = await sendZaloText(request, {
		oaId,
		guestId,
		text: `Hello from ${guestId}, ${randomUUID().slice(0, 8)}`,
	});
	expect(status, `Zalo's webhook for ${guestId} is taken`).toBe(200);
}

/* ---------------------------------------------------------------- what the agent sees */

/** The thread list (not the open thread). */
function threadList(page: Page) {
	return page.getByRole("complementary");
}

/** A guest's row in the list; a nameless Zalo guest is listed by their id. */
function rowOf(page: Page, guestId: string) {
	return threadList(page).getByRole("button", { name: new RegExp(`^${guestId}\\b`) });
}

/** The open thread. */
function openThread(page: Page) {
	return page.getByRole("article");
}

/** A view button (Your turn / Sent / All) with its count. */
function view(page: Page, name: "Your turn" | "Sent" | "All", count: number) {
	return page.getByRole("button", { name: `${name} ${count}`, exact: true });
}

async function choose(page: Page, name: "Your turn" | "Sent", count: number) {
	await view(page, name, count).click();
	await expect(view(page, name, count)).toHaveAttribute("aria-pressed", "true");
}

/** The amber Your-turn count on the Inbox nav item, shown on every page. */
function navCount(page: Page) {
	return page.getByTestId("nav-your-turn-count");
}

/** What takes the turn's place on a row or the thread's header. */
async function expectStatus(where: Locator, status: "yourTurn" | "lost", message: string) {
	const badge = where.getByTestId("thread-status");
	await expect(badge, message).toHaveAttribute("data-status", status);
	await expect(badge, message).toHaveText(status === "lost" ? "Lost" : "Your turn");
}

// ---------------------------------------------------------------------------------------

// scenario: docs/e2e-scenarios.md CRM 5
test.describe("CRM 5 — lost leaves the queue, and comes back", () => {
	test("a lead the CRM reports lost leaves Your turn and the nav count, shows Lost under Sent, and is back in Your turn when the guest writes again", async ({
		desk,
	}) => {
		const { page } = desk;
		// Another guest stays waiting throughout, so every count below is a number on screen.
		const waiting = await desk.newGuest();
		const guest = await desk.newGuest();

		// Before: both guests are the agent's turn, and the nav counts both.
		await page.goto("/en/inbox");
		await expect(rowOf(page, guest), "the new guest is in Your turn").toBeVisible();
		await expect(rowOf(page, waiting)).toBeVisible();
		await expectStatus(rowOf(page, guest), "yourTurn", "the new guest is the agent's turn");
		await expect(navCount(page), "the nav counts both waiting guests").toHaveText("2");

		// The CRM reports the guest's lead lost.
		markLeadLost(desk.officeId, "zalo", guest);

		// It leaves Your turn and the nav count; the other guest is still there.
		await page.goto("/en/inbox");
		await expect(rowOf(page, waiting), "the other guest is still in Your turn").toBeVisible();
		await expect(view(page, "Your turn", 1), "Your turn counts only the other guest").toBeVisible();
		await expect(rowOf(page, guest), "the lost guest is not in Your turn").toHaveCount(0);
		await expect(navCount(page), "the nav no longer counts the lost guest").toHaveText("1");

		// It is under Sent, with Lost where the turn was, in the row and the thread's header.
		await choose(page, "Sent", 1);
		await expectStatus(rowOf(page, guest), "lost", "the row under Sent says Lost");
		await rowOf(page, guest).click();
		await expectStatus(openThread(page), "lost", "the thread's header says Lost");

		// The guest writes again: back in Your turn, and counted.
		await desk.writeAgain(guest);
		await page.goto("/en/inbox");
		await expect(view(page, "Your turn", 2), "Your turn counts the guest again").toBeVisible();
		await expectStatus(rowOf(page, guest), "yourTurn", "the guest is the agent's turn again");
		await expect(navCount(page), "the nav counts the guest again").toHaveText("2");
		await rowOf(page, guest).click();
		await expectStatus(openThread(page), "yourTurn", "the thread's header says Your turn");
	});
});
