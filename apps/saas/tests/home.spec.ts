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

/** The office's local time zone: Home's days are Vietnamese calendar days. */
const OFFICE_TIME_ZONE = "Asia/Ho_Chi_Minh";

/** Home counts the leads of the last 30 local days, today included. */
const WINDOW_DAYS = 30;

/** A guest of the test's own office, with the text they wrote first and when. */
type Guest = WhatsAppGuest & { text: string; firstWrote: Date };

/**
 * An office of the test's own (deleted afterwards by the `admin` fixture), holding a WhatsApp
 * number no other office holds: no other spec writes to it, so its queue and numbers are exact.
 */
type OwnOffice = {
	id: string;
	/** A new guest writes to the office for the first time, at `at`. */
	guestWrites: (at: Date) => Promise<Guest>;
	/** A guest writes again, at `at`. */
	writesAgain: (guest: Guest, at: Date) => Promise<void>;
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
				return { ...guest, text, firstWrote: at };
			},
			writesAgain: (guest, at) =>
				sendWhatsAppText(request, {
					phoneNumberId,
					guest,
					text: `One more thing, ${guest.name}`,
					at,
				}),
		});
	},
});

/**
 * The office's only agent, who just accepted their invitation. A new guest
 * waits in Unassigned until a manager gives them out (ADR 0022): the office's manager, joined the
 * same way, gives the agent these guests.
 */
async function agentOf(admin: Admin, browser: Browser, officeId: string, guests: Guest[] = []) {
	const agent = await joinOffice(admin, browser, officeId, "member", "home");
	if (guests.length === 0) {
		return agent;
	}
	try {
		const manager = await joinOffice(admin, browser, officeId, "admin", "home-manager");
		try {
			const assigner = assignerAs(manager.api);
			for (const guest of guests) {
				await assigner.assignGuestTo(guest.phone, agent.userId);
			}
		} finally {
			await manager.close();
		}
	} catch (error) {
		await agent.close();
		throw error;
	}
	return agent;
}

function minutesAgo(minutes: number): Date {
	return new Date(Date.now() - minutes * MINUTE);
}

function daysAgo(days: number): Date {
	return new Date(Date.now() - days * DAY);
}

/* ---------------------------------------------------------------- calendar days */

/** The office's local calendar day of an instant, as `YYYY-MM-DD`. */
function officeDay(at: Date): string {
	return new Intl.DateTimeFormat("en-CA", {
		timeZone: OFFICE_TIME_ZONE,
		year: "numeric",
		month: "2-digit",
		day: "2-digit",
	}).format(at);
}

/** The calendar day `days` after `day` (before, when negative). */
function addDays(day: string, days: number): string {
	return new Date(Date.parse(`${day}T00:00:00Z`) + days * DAY).toISOString().slice(0, 10);
}

/** An instant given in UTC: `day` at `time` (`HH:MM`). */
function utc(day: string, time: string): Date {
	return new Date(`${day}T${time}:00Z`);
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

/** A guest's row in the Inbox's thread list. */
function rowOf(page: Page, guest: Guest) {
	return threadList(page).getByRole("button", { name: startsWithName(guest) });
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

/** The agent answers the guest from the Inbox: the reply goes out (a mock send in E2E). */
async function approveReply(page: Page, guest: Guest) {
	await rowOf(page, guest).click();
	await expectThreadOpen(page, guest, `the agent opens ${guest.name}'s thread`);
	await page.getByRole("textbox", { name: "Reply" }).fill(`Reply to ${guest.name}`);
	const sent = page.waitForResponse((r) => r.url().endsWith("/approve"));
	await page.getByTestId("approve-and-send").click();
	expect((await sent).status(), "the reply is sent").toBe(200);
}

/** The funnel's Leads in, the number a person reads beside it. */
async function leadsIn(page: Page): Promise<number> {
	const item = page
		.getByRole("list", { name: "Funnel" })
		.getByRole("listitem")
		// The label reads "1 Leads in", its step in the funnel; no element holds "Leads in" alone.
		.filter({ has: page.getByText(/^\d+\s*Leads in$/) });
	await expect(item, "the funnel shows Leads in").toHaveText(/Leads in\s*\d+/);
	const match = /Leads in\s*(\d+)/.exec(await item.innerText());
	return Number(match![1]);
}

/** Leads per day, `YYYY-MM-DD` → count, leaving out days with none. */
type Days = Record<string, number>;

/** Leads by day as drawn. A day with no bar is a day with no lead. */
async function leadsByDay(page: Page): Promise<Days> {
	const days: Days = {};
	for (const bar of await page.getByTestId("leads-by-day-bar").all()) {
		const day = (await bar.getAttribute("data-day")) ?? "(a bar with no day)";
		const leads = Number(await bar.getAttribute("data-leads"));
		if (leads !== 0) {
			days[day] = (days[day] ?? 0) + leads;
		}
	}
	return days;
}

/** The guests' leads by the office's day each first wrote, for those who did between the days. */
function leadsOn(guests: Guest[], firstDay: string, lastDay: string): Days {
	const days: Days = {};
	for (const guest of guests) {
		const day = officeDay(guest.firstWrote);
		if (day >= firstDay && day <= lastDay) {
			days[day] = (days[day] ?? 0) + 1;
		}
	}
	return days;
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

// scenario: docs/e2e-scenarios.md Home 3
test.describe("Home 3 — nobody waiting", () => {
	test("with every guest answered, Waiting now says no guest is waiting; while one still waits, it lists them instead", async ({
		admin,
		browser,
		ownOffice,
	}) => {
		test.setTimeout(180_000);
		const first = await ownOffice.guestWrites(minutesAgo(20));
		const second = await ownOffice.guestWrites(minutesAgo(10));
		const nobodyWaiting = (page: Page) =>
			page.getByRole("main").getByText("No guest is waiting.", { exact: true });

		const agent = await agentOf(admin, browser, ownOffice.id, [first, second]);
		const { page } = agent;
		try {
			// Both guests wait.
			await openHome(page);
			await expect(waitingEntry(page, first), "Waiting now lists the first guest").toBeVisible();
			await expect(waitingEntry(page, second), "and the second").toBeVisible();
			await expect(nobodyWaiting(page), "someone is waiting").toHaveCount(0);

			// One answered: the other still waits.
			await page.goto("/en/inbox");
			await approveReply(page, first);
			await openHome(page);
			await expect(waitingEntry(page, second), "the unanswered guest still waits").toBeVisible();
			await expect(waitingNow(page), "only them").toHaveCount(1);
			await expect(nobodyWaiting(page), "someone is still waiting").toHaveCount(0);

			// Both answered: nobody waits.
			await page.goto("/en/inbox");
			await approveReply(page, second);
			await openHome(page);
			await expect(nobodyWaiting(page), "Waiting now says no guest is waiting").toBeVisible();
			await expect(waitingNow(page), "and lists no guest").toHaveCount(0);
		} finally {
			await agent.close();
		}
	});
});

// scenario: docs/e2e-scenarios.md Home 5
test.describe("Home 5 — leads by day adds up", () => {
	test("each of Home's 30 Vietnamese days draws the guests who first wrote that day, one lead each, and the bars sum to Leads in; a guest who first wrote at 00:30 in Vietnam (17:30 UTC the day before) is counted on the Vietnamese day, once, though they wrote again", async ({
		admin,
		browser,
		ownOffice,
	}) => {
		test.setTimeout(180_000);
		const today = officeDay(new Date());

		// Just after midnight in Vietnam, ten days back: still the day before in UTC. They write
		// again today, which makes them no second lead and moves no day.
		const utcDay = addDays(today, -10);
		const vietnameseDay = addDays(utcDay, 1);
		const afterMidnight = await ownOffice.guestWrites(utc(utcDay, "17:30"));
		await ownOffice.writesAgain(afterMidnight, minutesAgo(1));

		// Others on days of their own: today, three days back at noon, and either side of the
		// window's first midnight (00:30 on its first day; 23:30 the day before it).
		const guests = [
			afterMidnight,
			await ownOffice.guestWrites(minutesAgo(5)),
			await ownOffice.guestWrites(utc(addDays(today, -3), "05:00")),
			await ownOffice.guestWrites(utc(addDays(today, -WINDOW_DAYS), "17:30")),
			await ownOffice.guestWrites(utc(addDays(today, -WINDOW_DAYS), "16:30")),
		];

		const agent = await agentOf(admin, browser, ownOffice.id);
		const { page } = agent;
		try {
			await openHome(page);
			// Home's 30 days as of now, in case the run crossed midnight in Vietnam.
			const lastDay = officeDay(new Date());
			const firstDay = addDays(lastDay, -(WINDOW_DAYS - 1));
			const expected = leadsOn(guests, firstDay, lastDay);

			await expect
				.poll(() => leadsByDay(page), {
					message: "each day draws the guests who first wrote on it, one lead each",
				})
				.toEqual(expected);
			const drawn = await leadsByDay(page);
			expect(
				drawn[vietnameseDay],
				"the guest who wrote just after midnight is counted on the Vietnamese day, once",
			).toBe(1);
			expect(
				drawn[utcDay],
				"and not on the UTC day, the day before (nobody else wrote then)",
			).toBeUndefined();

			const sum = Object.values(drawn).reduce((a, b) => a + b, 0);
			expect(await leadsIn(page), "the bars sum to Leads in").toBe(sum);
		} finally {
			await agent.close();
		}
	});
});
