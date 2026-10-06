import { randomUUID } from "node:crypto";

import type { APIRequestContext, Page } from "@playwright/test";

import { assignerAs } from "./support/assign";
import { expect, test as base } from "./support/fixtures";
import type { Joined } from "./support/operators";
import { joinOffice } from "./support/operators";
import { connectZaloOa, releaseZaloOa } from "./support/pipes";
import { sendZaloText } from "./support/zalo";

/**
 * A page learns of a new guest when it asks again, which it does about every ten seconds (as
 * seen running it); a raise gets three of those rounds to show.
 */
const WITHIN_A_POLL = { timeout: 30_000 };

/** A guest writing to the test's own office; a nameless Zalo guest is listed by their id. */
type Guest = { id: string };

/**
 * An office of the test's own, created by the platform admin (so they are its owner), with a
 * Zalo OA of its own (released afterwards, even when the test failed): no other spec moves its
 * counts, so they are exact.
 */
type OwnOffice = {
	id: string;
	/** A new guest writes to the office for the first time. */
	guestWrites: () => Promise<Guest>;
};

const test = base.extend<{ ownOffice: OwnOffice }>({
	ownOffice: async ({ admin, request }, use) => {
		const office = await admin.createOffice("Nav count");
		const oaId = uniqueId("oa");
		await connectZaloOa(office.id, oaId);
		try {
			await use({ id: office.id, guestWrites: () => guestWrites(request, oaId) });
		} finally {
			await releaseZaloOa(oaId);
		}
	},
});

/** A vendor id (OA, guest) no other test, repeat or earlier run uses. */
function uniqueId(kind: string): string {
	return `e2e-nav-${kind}-${randomUUID()}`;
}

async function guestWrites(request: APIRequestContext, oaId: string): Promise<Guest> {
	const id = uniqueId("guest");
	await sendZaloText(request, { guestId: id, oaId, text: `Hello from ${id}` });
	return { id };
}

/* ---------------------------------------------------------------- what a person sees */

/** The amber number beside Inbox in the sidebar. */
function navCount(page: Page) {
	return page.getByRole("link", { name: /^Inbox\b/ }).getByTestId("nav-your-turn-count");
}

/** A number of the person's own, anywhere: beside Inbox, or in the narrow screen's top bar. */
function anyYourTurnCount(page: Page) {
	return page.getByTestId("nav-your-turn-count").or(page.getByTestId("topbar-your-turn-count"));
}

/** A view button of the Inbox (Your turn / Sent / All) with its count. */
function view(page: Page, name: "Your turn" | "Sent" | "All", count: number) {
	return page.getByRole("button", { name: `${name} ${count}`, exact: true });
}

/** A guest's row in the Inbox's thread list. */
function rowOf(page: Page, guest: Guest) {
	return page
		.getByRole("complementary")
		.getByRole("button", { name: new RegExp(`^${guest.id}\\b`) });
}

/** The Inbox's counts are these, and the nav's number is its Your turn. */
async function expectInbox(
	page: Page,
	counts: { yourTurn: number; sent: number; all: number },
	options?: { timeout: number },
) {
	await expect(view(page, "Your turn", counts.yourTurn), "the Inbox's Your turn").toBeVisible(
		options,
	);
	await expect(view(page, "Sent", counts.sent), "the Inbox's Sent").toBeVisible();
	await expect(view(page, "All", counts.all), "the Inbox's All").toBeVisible();
	await expect(navCount(page), "on the Inbox, the nav counts Your turn").toHaveText(
		String(counts.yourTurn),
	);
}

/** The agent answers the guest from the Inbox: the reply goes out (a mock send in E2E). */
async function approveReply(page: Page, guest: Guest) {
	await rowOf(page, guest).click();
	await page.getByRole("textbox", { name: "Reply" }).fill(`Reply to ${guest.id}`);
	const sent = page.waitForResponse((r) => r.url().endsWith("/approve"));
	await page.getByTestId("approve-and-send").click();
	expect((await sent).status(), "the reply is sent").toBe(200);
}

async function openSettings(page: Page) {
	await page.goto("/en/settings/general");
	await expect(page.getByRole("heading", { name: "Account settings" })).toBeVisible();
}

async function openHome(page: Page) {
	await page.goto("/en/home");
	await expect(page.getByRole("heading", { name: "Waiting now" })).toBeVisible();
}

// ---------------------------------------------------------------------------------------

// scenario: docs/e2e-scenarios.md Home 4
test.describe("Home 4 — the nav counts Your turn on every page", () => {
	test("the number beside Inbox equals the Inbox's Your turn on the Inbox, Home and Settings; an approved reply lowers it, a guest writing raises it; the platform admin sees none", async ({
		admin,
		browser,
		ownOffice,
	}) => {
		test.setTimeout(180_000);
		const first = await ownOffice.guestWrites();
		const second = await ownOffice.guestWrites();
		const third = await ownOffice.guestWrites();

		// The platform admin owns this office, with guests waiting in it. Their Settings page is
		// opened before the agent's and judged only after the agent's has shown a new guest, so
		// it has had at least as long to show a number.
		await openSettings(admin.page);

		// The office's only agent, and its manager, who gives each new guest to the agent (ADR 0022).
		let agent: Joined | undefined;
		let manager: Joined | undefined;
		try {
			agent = await joinOffice(admin, browser, ownOffice.id, "member", "nav-count");
			manager = await joinOffice(admin, browser, ownOffice.id, "admin", "nav-count-manager");
			const assigner = assignerAs(manager.api);
			const agentId = agent.userId;
			const assignToAgent = (guest: { id: string }) => assigner.assignGuestTo(guest.id, agentId);
			const guestWritesToAgent = async () => assignToAgent(await ownOffice.guestWrites());
			const { page } = agent;
			for (const guest of [first, second, third]) {
				await assignToAgent(guest);
			}

			// Three guests are waiting on the office's only agent.
			await page.goto("/en/inbox");
			await expectInbox(page, { yourTurn: 3, sent: 0, all: 3 });

			// Approving a reply lowers it, there and then.
			await approveReply(page, first);
			await expectInbox(page, { yourTurn: 2, sent: 1, all: 3 });

			// Home and Settings, each loaded afresh, count the same two: not the three threads,
			// not the one sent.
			await openHome(page);
			await expect(navCount(page), "on Home, the nav counts Your turn").toHaveText("2");
			await openSettings(page);
			await expect(
				navCount(page),
				"on Settings (no inbox list there), the nav counts Your turn",
			).toHaveText("2");

			// A guest writing in raises it on Settings, without a reload.
			await guestWritesToAgent();
			await expect(
				navCount(page),
				"on Settings, a guest writing in raises the count within its poll",
			).toHaveText("3", WITHIN_A_POLL);

			// The platform admin sees no number: not on their Settings page, open all this time,
			// nor in the admin area.
			await expect(admin.page.getByRole("heading", { name: "Account settings" })).toBeVisible();
			await expect(anyYourTurnCount(admin.page), "the platform admin's Settings").toHaveCount(0);
			await admin.page.goto("/en/admin/organizations");
			await expect(admin.page.getByTestId("admin-organizations-search")).toBeVisible();
			await expect(anyYourTurnCount(admin.page), "the admin area").toHaveCount(0);

			// Back on the Inbox, its Your turn says the same three.
			await page.goto("/en/inbox");
			await expectInbox(page, { yourTurn: 3, sent: 1, all: 4 });

			// A guest writing in raises it on the Inbox, within the inbox's poll.
			await guestWritesToAgent();
			await expectInbox(page, { yourTurn: 4, sent: 1, all: 5 }, WITHIN_A_POLL);

			// And on Home.
			await openHome(page);
			await expect(navCount(page), "on Home, the nav counts Your turn").toHaveText("4");
			await guestWritesToAgent();
			await expect(
				navCount(page),
				"on Home, a guest writing in raises the count within its poll",
			).toHaveText("5", WITHIN_A_POLL);
		} finally {
			await manager?.close();
			await agent?.close();
		}
	});
});
