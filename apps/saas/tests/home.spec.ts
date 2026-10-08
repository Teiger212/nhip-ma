import type { Browser, Locator, Page } from "@playwright/test";

import { assignerAs } from "./support/assign";
import type { Admin } from "./support/fixtures";
import { expect, test as base } from "./support/fixtures";
import { joinOffice } from "./support/operators";
import { connectWhatsAppNumber } from "./support/pipes";
import type { WhatsAppGuest } from "./support/whatsapp";
import { newWhatsAppGuest, newWhatsAppNumber, sendWhatsAppText } from "./support/whatsapp";

const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;

/** A guest of the test's own office, with the text they wrote first. */
type Guest = WhatsAppGuest & { text: string };

/**
 * An office of the test's own (deleted afterwards by the `admin` fixture), holding a WhatsApp
 * number no other office holds: no other spec writes to it, so its queue and numbers are exact.
 */
type OwnOffice = {
	id: string;
	/** A new guest writes to the office for the first time, at `at`. */
	guestWrites: (at: Date) => Promise<Guest>;
};

const test = base.extend<{ ownOffice: OwnOffice }>({
	ownOffice: async ({ admin, request }, use) => {
		const office = await admin.createOffice("Home");
		const phoneNumberId = newWhatsAppNumber("home");
		await connectWhatsAppNumber(office.id, phoneNumberId);
		await use({
			id: office.id,
			guestWrites: async (at) => {
				const guest = newWhatsAppGuest();
				const text = `Hello, is the flat still free? ${guest.name}`;
				await sendWhatsAppText(request, { phoneNumberId, guest, text, at });
				return { ...guest, text };
			},
		});
	},
});

/**
 * The office's only agent, who just accepted their invitation. A new guest
 * waits in Unassigned until a manager gives them out (ADR 0022): the office's manager, joined
 * alongside them (#278), gives the agent these guests.
 */
async function agentOf(admin: Admin, browser: Browser, officeId: string, guests: Guest[]) {
	const [agent, manager] = await Promise.allSettled([
		joinOffice(admin, browser, officeId, "member", "home"),
		joinOffice(admin, browser, officeId, "admin", "home-manager"),
	]);
	try {
		if (agent.status === "rejected") throw agent.reason;
		if (manager.status === "rejected") throw manager.reason;
		const assigner = assignerAs(manager.value.api);
		for (const guest of guests) {
			await assigner.assignGuestTo(guest.phone, agent.value.userId);
		}
		return agent.value;
	} catch (error) {
		if (agent.status === "fulfilled") await agent.value.close();
		throw error;
	} finally {
		if (manager.status === "fulfilled") await manager.value.close();
	}
}

function minutesAgo(minutes: number): Date {
	return new Date(Date.now() - minutes * MINUTE);
}

function daysAgo(days: number): Date {
	return new Date(Date.now() - days * DAY);
}

/* ---------------------------------------------------------------- what a person sees */

/** Any of this test's guests, by the name they go by ("Guest 1a2b3c4d"). */
const ANY_GUEST = /^Guest [0-9a-f]{8}\b/;

function startsWithName(guest: Guest): RegExp {
	return new RegExp(`^${guest.name}\\b`);
}

/** The thread list (not the open thread). */
function threadList(page: Page) {
	return page.getByRole("complementary");
}

/** The open thread, its header included. */
function openThread(page: Page) {
	return page.getByRole("article");
}

/** Every guest's row in the Inbox's thread list, top to bottom. */
function guestRows(page: Page) {
	return threadList(page).getByRole("button", { name: ANY_GUEST });
}

/** Every guest Home's Waiting now lists, top to bottom: each is a link. */
function waitingNow(page: Page) {
	return page.getByRole("main").getByRole("link", { name: ANY_GUEST });
}

/** Home's Waiting now entry for a guest. */
function waitingEntry(page: Page, guest: Guest) {
	return page.getByRole("main").getByRole("link", { name: startsWithName(guest) });
}

/** Which of the guests each row or entry is, in order (by the name it shows). */
async function namesIn(locator: Locator, guests: Guest[]): Promise<string[]> {
	const texts = await locator.allTextContents();
	return texts.map((text) => guests.find((g) => text.includes(g.name))?.name ?? text);
}

async function openHome(page: Page) {
	await page.goto("/en/home");
	await expect(page.getByRole("heading", { name: "Waiting now" })).toBeVisible();
}

/** The Inbox shows the open thread of this guest: their message is in it. */
async function expectThreadOpen(page: Page, guest: Guest, message: string) {
	await expect(openThread(page).getByText(guest.text, { exact: true }), message).toBeVisible();
}

// ---------------------------------------------------------------------------------------

// scenario: docs/e2e-scenarios.md Home 1
test.describe("Home 1 — Waiting now opens the thread", () => {
	test("the agent's Waiting now lists the guests whose turn it is, oldest waiting first and quiet ones last, in the Inbox's Your turn order; choosing one opens the Inbox with that thread, and on a phone the thread itself", async ({
		admin,
		browser,
		ownOffice,
	}) => {
		test.setTimeout(180_000);
		// Five guests, written in an order that is not their waiting order: three this last half
		// hour, two more than 48 hours ago (Quiet).
		const tenMinutes = await ownOffice.guestWrites(minutesAgo(10));
		const quietThreeDays = await ownOffice.guestWrites(daysAgo(3));
		const thirtyMinutes = await ownOffice.guestWrites(minutesAgo(30));
		const quietFiveDays = await ownOffice.guestWrites(daysAgo(5));
		const twentyMinutes = await ownOffice.guestWrites(minutesAgo(20));
		const guests = [tenMinutes, quietThreeDays, thirtyMinutes, quietFiveDays, twentyMinutes];
		const oldestFirstQuietLast = [
			thirtyMinutes,
			twentyMinutes,
			tenMinutes,
			quietFiveDays,
			quietThreeDays,
		].map((g) => g.name);

		const agent = await agentOf(admin, browser, ownOffice.id, guests);
		const { page } = agent;
		try {
			// The Inbox's Your turn, the Quiet group opened.
			await page.goto("/en/inbox");
			await expect(page.getByRole("button", { name: "Your turn 5", exact: true })).toBeVisible();
			await threadList(page)
				.getByText(/^Quiet \(2\)$/)
				.click();
			await expect(guestRows(page), "Your turn lists the five guests").toHaveCount(5);
			const inboxOrder = await namesIn(guestRows(page), guests);

			// Home's Waiting now: the same guests, in the same order.
			await openHome(page);
			await expect(waitingNow(page), "Waiting now lists the five guests").toHaveCount(5);
			const homeOrder = await namesIn(waitingNow(page), guests);
			expect
				.soft(homeOrder, "Waiting now: oldest waiting first, quiet ones last")
				.toEqual(oldestFirstQuietLast);
			expect(homeOrder, "Waiting now is in the Inbox's Your turn order").toEqual(inboxOrder);

			// Choosing a guest who is not first opens the Inbox with their thread, the list beside it.
			await waitingEntry(page, twentyMinutes).click();
			await expect(page).toHaveURL(/\/en\/inbox\b/);
			await expectThreadOpen(page, twentyMinutes, "the chosen guest's thread is open");
			await expect(
				openThread(page).getByText(thirtyMinutes.text, { exact: true }),
				"not the guest first in the queue",
			).toHaveCount(0);
			await expect(threadList(page), "the thread list is beside it").toBeVisible();

			// On a phone, choosing a quiet guest (collapsed in the Inbox) opens their thread itself.
			await page.setViewportSize({ width: 390, height: 844 });
			await openHome(page);
			await waitingEntry(page, quietThreeDays).click();
			await expect(page).toHaveURL(/\/en\/inbox\b/);
			await expectThreadOpen(page, quietThreeDays, "on a phone, the chosen guest's thread is open");
			await expect(
				openThread(page).getByText(thirtyMinutes.text, { exact: true }),
				"on a phone, not the guest first in the queue",
			).toHaveCount(0);
			await expect(threadList(page), "on a phone, the thread itself, not the list").toBeHidden();
		} finally {
			await agent.close();
		}
	});
});
