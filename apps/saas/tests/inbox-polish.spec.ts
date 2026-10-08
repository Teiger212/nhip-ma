import { randomUUID } from "node:crypto";

import type { Locator, Page } from "@playwright/test";

import { assignerAs } from "./support/assign";
import { COUNT_LINE_EN, ownerCopy } from "./support/copy";
import { expect, test as base } from "./support/fixtures";
import type { Joined } from "./support/operators";
import { joinOffice } from "./support/operators";
import { connectWhatsAppNumber } from "./support/pipes";
import type { WhatsAppGuest } from "./support/whatsapp";
import { newWhatsAppGuest, newWhatsAppNumber, sendWhatsAppText } from "./support/whatsapp";

const copy = ownerCopy("en");

/** The window sizes the scenarios name: a desk and `md` itself (768px). */
const DESK = { width: 1280, height: 720 };
const MD = { width: 768, height: 1024 };

/** A guest of the test's own office, writing on WhatsApp under a long profile name. */
type Guest = WhatsAppGuest & { text: string };

/** An operator of the test's own office, in a browser of their own, by a name of their own. */
type Operator = Joined & { name: string };

/**
 * An office of the test's own (the platform admin creates it; deleted afterwards), holding a
 * WhatsApp number of its own, so no other spec writes to it and its counts are exact.
 */
type OwnOffice = {
	/** An operator joins: an agent (the kit's `member`) or a manager (the kit's `admin`). */
	join: (role: "member" | "admin", label: string) => Promise<Operator>;
	/** A new guest writes for the first time, `minutesAgo` minutes ago (so the order is certain). */
	guestWrites: (minutesAgo: number) => Promise<Guest>;
};

const test = base.extend<{ newOffice: () => Promise<OwnOffice> }>({
	newOffice: async ({ admin, browser, request }, use) => {
		const contexts: Joined[] = [];
		await use(async () => {
			const office = await admin.createOffice("Inbox polish");
			const phoneNumberId = newWhatsAppNumber("inbox-polish");
			await connectWhatsAppNumber(office.id, phoneNumberId);
			return {
				join: async (role, label) => {
					const joined = await joinOffice(admin, browser, office.id, role, "inbox-polish");
					contexts.push(joined);
					// A name of their own, so the owner filter and "waiting on <name>" name them.
					const name = `E2E ${label} ${randomUUID().slice(0, 8)}`;
					const res = await joined.api.post("/api/auth/update-user", { name });
					expect(res.ok(), `${label} takes a name of their own (${res.status()})`).toBe(true);
					return { ...joined, name };
				},
				guestWrites: async (minutesAgo) => {
					// A long name (40 characters), as WhatsApp profile names can be: it fills the row's
					// name line, so a pill laid over it would cover it.
					const guest = {
						...newWhatsAppGuest(),
						name: `Nguyễn Thị Phương Thảo Bảo Ngọc ${randomUUID().slice(0, 8)}`,
					};
					const text = `Hello, is the flat on Xuan Dieu still free? ${randomUUID().slice(0, 8)}`;
					await sendWhatsAppText(request, {
						phoneNumberId,
						guest,
						text,
						at: new Date(Date.now() - minutesAgo * 60_000),
					});
					return { ...guest, text };
				},
			};
		});
		for (const context of contexts) {
			await context.close();
		}
	},
});

/* ---------------------------------------------------------------- what a person sees */

/** A manager's Your turn is named Waiting (#210); an agent's stays Your turn. */
type ViewName = "Unassigned" | "Waiting" | "Your turn" | "Sent" | "All";

/** The thread list (not the open thread). */
function threadList(page: Page): Locator {
	return page.getByRole("complementary");
}

/** The open thread, its header included. */
function openThread(page: Page): Locator {
	return page.getByRole("article");
}

/** A view button with its count. */
function view(page: Page, name: ViewName, count?: number): Locator {
	return page.getByRole("button", {
		name: count === undefined ? new RegExp(`^${name} \\d+$`) : `${name} ${count}`,
		exact: count !== undefined,
	});
}

/** The manager's owner filter ("Showing": All threads, or one operator). */
function ownerFilter(page: Page): Locator {
	return page.getByTestId("owner-filter");
}

/**
 * The line under the view tabs that says how many guests wait: found by its "waiting on" /
 * "waiting in", which both the agent's and the manager's line carry.
 */
function countLine(page: Page): Locator {
	return threadList(page).getByText(/\bwaiting (on|in)\b/);
}

/** A guest's row in the list: a button named by the guest, first of all. */
function rowOf(page: Page, guest: Guest): Locator {
	return threadList(page).getByRole("button", { name: startsWithName(guest) });
}

/**
 * The row's own "Assign to…" (a manager's Unassigned view): a button beside the row's button, in
 * the same list item. The inner locator is rooted at the page, as `filter({ has })` looks for it
 * inside each list item.
 */
function assignFromRow(page: Page, guest: Guest): Locator {
	return threadList(page)
		.getByRole("listitem")
		.filter({ has: page.getByRole("button", { name: startsWithName(guest) }) })
		.getByRole("button", { name: copy.assignTo, exact: true });
}

function startsWithName(guest: Guest): RegExp {
	return new RegExp(`^${escapeRegExp(guest.name)}\\b`);
}

function escapeRegExp(text: string) {
	return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * The Inbox, with its threads loaded: a thread is listed, or the empty Inbox says so. (The view
 * buttons show counts before the threads arrive, so they are no sign of it.)
 */
async function expectListLoaded(page: Page) {
	await expect(
		threadList(page)
			.locator(
				'[data-test="thread-owner"], [data-test="inbox-empty"], [data-test="inbox-caught-up"], [data-test="inbox-no-matches"], [data-test="inbox-all-assigned"]',
			)
			.filter({ visible: true })
			.or(threadList(page).getByText(copy.onlyQuiet, { exact: true }))
			.first(),
	).toBeVisible();
}

/**
 * Picks an option of a Select (the kit's Base UI Select, not a native one: #248) by what it
 * reads, once its list offers it; the list closes on the choice.
 */
async function choose(select: Locator, label: string) {
	await select.click();
	const option = select.page().getByRole("option", { name: label, exact: true });
	await expect(option, `the control offers "${label}"`).toBeVisible();
	await option.click();
	await expect(option, "the list closes").toBeHidden();
}

/** Opens a view and waits for its threads. */
async function openView(page: Page, name: ViewName) {
	await view(page, name).click();
	await expect(view(page, name)).toHaveAttribute("aria-pressed", "true");
	await expectListLoaded(page);
}

/** The pointer leaves the thread list: no row is hovered. */
async function pointerAway(page: Page) {
	await page.mouse.move(0, 0);
}

/* ---------------------------------------------------------------- setup through the app */

/** The guest's thread id, as the manager's conversations API lists it. */
function threadOf(manager: Operator, guest: Guest): Promise<string> {
	return assignerAs(manager.api).threadOf(guest.phone);
}

/**
 * The manager's Inbox at this window size, with this guest's thread open (selected) by its link:
 * the rows listed above it are neither selected, hovered nor focused.
 */
async function openWithSelected(
	manager: Operator,
	selected: Guest,
	size: { width: number; height: number },
) {
	const { page } = manager;
	const threadId = await threadOf(manager, selected);
	await page.setViewportSize(size);
	await page.goto(`/en/inbox?thread=${encodeURIComponent(threadId)}`);
	await expect(view(page, "Unassigned"), "the Inbox is on Unassigned").toHaveAttribute(
		"aria-pressed",
		"true",
	);
	await expect(rowOf(page, selected), "the linked guest's row is selected").toHaveAttribute(
		"aria-current",
		"true",
	);
	await expect(openThread(page).getByText(selected.text, { exact: true })).toBeVisible();
	await pointerAway(page);
}

/**
 * An office with a manager and three Unassigned guests with long names, oldest first: the first
 * two rows are the ones the tests look at while the newest guest's thread is open.
 */
async function unassignedOffice(newOffice: () => Promise<OwnOffice>) {
	const office = await newOffice();
	const manager = await office.join("admin", "manager");
	const first = await office.guestWrites(3);
	const second = await office.guestWrites(2);
	const newest = await office.guestWrites(1);
	return { manager, first, second, newest };
}

/** The agent answers the guest from their Inbox: the reply goes out (a mock send in E2E). */
async function approveReply(page: Page, guest: Guest) {
	await page.goto("/en/inbox");
	await rowOf(page, guest).click();
	await expect(openThread(page).getByText(guest.text, { exact: true })).toBeVisible();
	await page.getByRole("textbox", { name: "Reply" }).fill(`Reply to ${guest.name}`);
	const sent = page.waitForResponse((r) => r.url().endsWith("/approve"));
	await page.getByTestId("approve-and-send").click();
	expect((await sent).status(), "the reply is sent").toBe(200);
}

/**
 * An office whose numbers all differ (Inbox polish 3): two Unassigned guests waiting; agent A
 * holds three guests and has answered one; agent B holds one guest, waiting. So the office has
 * 2 unassigned, 5 waiting (the Unassigned two among them, as the manager's Waiting counts
 * them), 1 sent and 6 threads; agent A 2 waiting, 1 sent, 3 threads; agent B 1 of each but sent.
 */
async function countedOffice(newOffice: () => Promise<OwnOffice>) {
	const office = await newOffice();
	// Independent setup at once (#278): each guest's message carries its own time, so their
	// order is the times', not the order they arrive in.
	const [manager, agentA, agentB] = await Promise.all([
		office.join("admin", "manager"),
		office.join("member", "agent A"),
		office.join("member", "agent B"),
	]);
	const assigner = assignerAs(manager.api);
	const [, , fourMinutes, threeMinutes, answeredByA, forB] = await Promise.all(
		[6, 5, 4, 3, 2, 1].map((minutesAgo) => office.guestWrites(minutesAgo)),
	);
	const forA = [fourMinutes, threeMinutes];
	await Promise.all([
		...[...forA, answeredByA].map((guest) => assigner.assignGuestTo(guest.phone, agentA.userId)),
		assigner.assignGuestTo(forB.phone, agentB.userId),
	]);
	await approveReply(agentA.page, answeredByA);
	return { manager, agentA, agentB };
}

// ---------------------------------------------------------------------------------------

test.describe.configure({ timeout: 120_000 });

// scenario: docs/e2e-scenarios.md Inbox polish 2
test.describe("Inbox polish 2 — a manager's Unassigned row shows Assign to… on hover, from md up", () => {
	test("at 1280 and at 768 px, a row that is not selected, hovered or focused hides its Assign to…; pointing at the row shows it, and leaving hides it again", async ({
		newOffice,
	}) => {
		const { manager, first, second, newest } = await unassignedOffice(newOffice);
		const { page } = manager;
		for (const size of [DESK, MD]) {
			const at = `${size.width}px`;
			await openWithSelected(manager, newest, size);
			await expect(
				assignFromRow(page, first),
				`${at}: at rest, the row hides Assign to…`,
			).toBeHidden();
			await expect(
				assignFromRow(page, second),
				`${at}: at rest, the row hides Assign to…`,
			).toBeHidden();

			await rowOf(page, first).hover();
			await expect(
				assignFromRow(page, first),
				`${at}: hovered, the row shows Assign to…`,
			).toBeVisible();
			await expect(
				assignFromRow(page, second),
				`${at}: the row not hovered still hides it`,
			).toBeHidden();

			await pointerAway(page);
			await expect(
				assignFromRow(page, first),
				`${at}: the pointer gone, it hides again`,
			).toBeHidden();
		}
	});
});

// scenario: docs/e2e-scenarios.md Inbox polish 3
test.describe("Inbox polish 3 — the count line under the tabs says what each view holds", () => {
	test("the manager's line reads '2 unassigned · 5 waiting in the office' on Unassigned, '5 waiting in the office' on Waiting, '1 sent · 5 …' on Sent and '6 threads · 5 …' on All; showing one operator, it counts theirs and says 'waiting on <name>', '1 thread' for one", async ({
		newOffice,
	}) => {
		test.setTimeout(180_000);
		const { manager, agentA, agentB } = await countedOffice(newOffice);
		const { page } = manager;
		await page.goto("/en/inbox");
		// The office's numbers, as the view tabs count them (the setup, not the point).
		for (const [name, count] of [
			["Unassigned", 2],
			["Waiting", 5],
			["Sent", 1],
			["All", 6],
		] as const) {
			await expect(view(page, name, count), `the office has ${count} under ${name}`).toBeVisible();
		}

		await expect(view(page, "Unassigned"), "the Inbox opens on Unassigned").toHaveAttribute(
			"aria-pressed",
			"true",
		);
		await expectListLoaded(page);
		await expect.soft(countLine(page), "Unassigned").toHaveText(COUNT_LINE_EN.unassigned(2, 5));
		await openView(page, "Waiting");
		await expect.soft(countLine(page), "Waiting").toHaveText(COUNT_LINE_EN.waiting(5));
		await openView(page, "Sent");
		await expect.soft(countLine(page), "Sent").toHaveText(COUNT_LINE_EN.sent(1, 5));
		await openView(page, "All");
		await expect.soft(countLine(page), "All").toHaveText(COUNT_LINE_EN.all(6, 5));

		// Showing agent A: their threads only, waiting on them.
		for (const [name, line] of [
			["Waiting", COUNT_LINE_EN.waiting(2, agentA.name)],
			["Sent", COUNT_LINE_EN.sent(1, 2, agentA.name)],
			["All", COUNT_LINE_EN.all(3, 2, agentA.name)],
		] as const) {
			await openView(page, name);
			await choose(ownerFilter(page), agentA.name);
			await expectListLoaded(page);
			await expect.soft(countLine(page), `${name}, showing agent A`).toHaveText(line);
		}

		// Showing agent B, who holds one thread: "1 thread".
		await choose(ownerFilter(page), agentB.name);
		await expectListLoaded(page);
		await expect
			.soft(countLine(page), "All, showing agent B")
			.toHaveText(COUNT_LINE_EN.all(1, 1, agentB.name));
	});
});
