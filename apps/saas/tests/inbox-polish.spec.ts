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

/** The window sizes the scenarios name: a desk, `md` itself (768px), and a phone. */
const DESK = { width: 1280, height: 720 };
const MD = { width: 768, height: 1024 };
const PHONE = { width: 390, height: 844 };

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

function searchBox(page: Page): Locator {
	return page.getByRole("textbox", { name: "Search threads" });
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

/** The guest's name as their row shows it. */
function nameOf(page: Page, guest: Guest): Locator {
	return rowOf(page, guest).getByText(guest.name, { exact: true });
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

/** Where an element is laid out; fails the test if it is not. */
async function boxOf(locator: Locator, what: string) {
	const box = await locator.boundingBox();
	expect(box, `${what} is laid out`).not.toBeNull();
	return box!;
}

/** The pill, shown, does not cover the guest's name: their boxes do not overlap. */
async function expectNameUncovered(page: Page, guest: Guest, where: string) {
	await expect(assignFromRow(page, guest), `${where}: Assign to… shows`).toBeVisible();
	await expect(nameOf(page, guest), `${where}: the guest's name shows`).toBeVisible();
	const pill = await boxOf(assignFromRow(page, guest), "Assign to…");
	const name = await boxOf(nameOf(page, guest), "the guest's name");
	const overlap =
		pill.x < name.x + name.width &&
		name.x < pill.x + pill.width &&
		pill.y < name.y + name.height &&
		name.y < pill.y + pill.height;
	expect
		.soft(
			overlap,
			`${where}: Assign to… ${JSON.stringify(pill)} covers no part of the name ${JSON.stringify(name)}`,
		)
		.toBe(false);
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
	const manager = await office.join("admin", "manager");
	const agentA = await office.join("member", "agent A");
	const agentB = await office.join("member", "agent B");
	const assigner = assignerAs(manager.api);
	await office.guestWrites(6);
	await office.guestWrites(5);
	const forA = [await office.guestWrites(4), await office.guestWrites(3)];
	const answeredByA = await office.guestWrites(2);
	const forB = await office.guestWrites(1);
	for (const guest of [...forA, answeredByA]) {
		await assigner.assignGuestTo(guest.phone, agentA.userId);
	}
	await assigner.assignGuestTo(forB.phone, agentB.userId);
	await approveReply(agentA.page, answeredByA);
	return { manager, agentA, agentB };
}

// ---------------------------------------------------------------------------------------

test.describe.configure({ timeout: 120_000 });

// scenario: docs/e2e-scenarios.md Inbox polish 1
test.describe("Inbox polish 1 — the view tabs stay put between a manager's views", () => {
	test("at a desk, Unassigned → Waiting → Sent → All → Unassigned leaves the view tabs and the search field at the same height in every view", async ({
		newOffice,
	}) => {
		// An office of the test's own, so nothing another spec does to an office (a pipe's banner
		// above the list) moves the list while it is measured.
		const { manager } = await unassignedOffice(newOffice);
		const { page } = manager;
		await page.setViewportSize(DESK);
		await page.goto("/en/inbox");
		await expect(view(page, "Unassigned"), "the Inbox opens on Unassigned").toHaveAttribute(
			"aria-pressed",
			"true",
		);
		await expectListLoaded(page);
		const tabs = view(page, "Waiting");
		const tabsAt = (await boxOf(tabs, "the view tabs")).y;
		const searchAt = (await boxOf(searchBox(page), "the search field")).y;
		// The list starts under the count line, so the line's foot staying put keeps the list still.
		const listTop = async () => {
			const box = await boxOf(countLine(page), "the count line");
			return box.y + box.height;
		};
		const listAt = await listTop();

		for (const name of ["Waiting", "Sent", "All", "Unassigned"] as const) {
			await openView(page, name);
			expect.soft(await listTop(), `${name}: the list has not moved`).toBe(listAt);
			expect
				.soft((await boxOf(tabs, "the view tabs")).y, `${name}: the view tabs have not moved`)
				.toBe(tabsAt);
			expect
				.soft(
					(await boxOf(searchBox(page), "the search field")).y,
					`${name}: the search field has not moved`,
				)
				.toBe(searchAt);
		}
	});
});

// scenario: docs/e2e-scenarios.md Inbox polish 2
test.describe("Inbox polish 2 — a manager's Unassigned row shows Assign to… on hover, focus and selection, from md up", () => {
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

	test("at a desk, Tab onto a row shows its Assign to…, the next Tab lands on Assign to… itself, and tabbing on to the next row hides it again", async ({
		newOffice,
	}) => {
		const { manager, first, second, newest } = await unassignedOffice(newOffice);
		const { page } = manager;
		await openWithSelected(manager, newest, DESK);
		await expect(assignFromRow(page, first), "at rest, the row hides Assign to…").toBeHidden();

		// From the search field, the keyboard alone: Tab until the first row has focus.
		await searchBox(page).focus();
		for (let presses = 0; presses < 20; presses++) {
			if (await rowOf(page, first).evaluate((row) => row === document.activeElement)) break;
			await page.keyboard.press("Tab");
		}
		await expect(rowOf(page, first), "Tab reaches the first row").toBeFocused();
		await expect(
			assignFromRow(page, first),
			"with focus on its row, Assign to… shows",
		).toBeVisible();
		await expect(assignFromRow(page, second), "the next row, unfocused, hides it").toBeHidden();

		await page.keyboard.press("Tab");
		await expect(assignFromRow(page, first), "the next Tab lands on Assign to…").toBeFocused();

		await page.keyboard.press("Tab");
		await expect(rowOf(page, second), "the Tab after it reaches the next row").toBeFocused();
		await expect(
			assignFromRow(page, second),
			"the newly focused row shows its Assign to…",
		).toBeVisible();
		await expect(
			assignFromRow(page, first),
			"focus gone, the first row hides it again",
		).toBeHidden();
	});

	test("at 1280 and at 768 px, the selected row shows its Assign to… with no pointer or focus on it, whether opened by its link or chosen in the list", async ({
		newOffice,
	}) => {
		const { manager, first, second, newest } = await unassignedOffice(newOffice);
		const { page } = manager;
		for (const size of [DESK, MD]) {
			const at = `${size.width}px`;
			// Opened by its link: nothing has touched the row.
			await openWithSelected(manager, second, size);
			await expect(
				assignFromRow(page, second),
				`${at}: the selected row shows Assign to…`,
			).toBeVisible();
			await expect(assignFromRow(page, first), `${at}: a row not selected hides it`).toBeHidden();
			await expect(assignFromRow(page, newest), `${at}: a row not selected hides it`).toBeHidden();
		}

		// Chosen in the list, then the pointer and the focus move to the search field.
		await rowOf(page, first).click();
		await expect(rowOf(page, first)).toHaveAttribute("aria-current", "true");
		await searchBox(page).click();
		await expect(assignFromRow(page, first), "the row just chosen shows Assign to…").toBeVisible();
		await expect(assignFromRow(page, second), "the row no longer selected hides it").toBeHidden();
	});

	test("at a desk, while a row's Assign to… menu is open, the pill stays shown with the pointer elsewhere", async ({
		newOffice,
	}) => {
		const { manager, first, newest } = await unassignedOffice(newOffice);
		const { page } = manager;
		await openWithSelected(manager, newest, DESK);
		await expect(assignFromRow(page, first), "at rest, the row hides Assign to…").toBeHidden();

		await rowOf(page, first).hover();
		await assignFromRow(page, first).click();
		await expect(
			page.getByRole("menu").getByRole("menuitem", { name: manager.name, exact: true }),
			"the menu is open, offering the office's operators",
		).toBeVisible();
		await pointerAway(page);
		await expect(page.getByRole("menu"), "the menu is still open").toBeVisible();
		await expect(
			assignFromRow(page, first),
			"while its menu is open, Assign to… stays shown",
		).toBeVisible();
		await page.keyboard.press("Escape");
		await expect(page.getByRole("menu")).toHaveCount(0);
	});

	test("at 1280 and at 768 px, Assign to… never covers a long guest name: not on the hovered row, nor on the selected one", async ({
		newOffice,
	}) => {
		const { manager, first, newest } = await unassignedOffice(newOffice);
		const { page } = manager;
		for (const size of [DESK, MD]) {
			const at = `${size.width}px`;
			await openWithSelected(manager, newest, size);
			await expectNameUncovered(page, newest, `${at}, the selected row`);
			await rowOf(page, first).hover();
			await expectNameUncovered(page, first, `${at}, the hovered row`);
		}
	});

	test("on a phone (390 px), every Unassigned row shows Assign to… with no pointer, as a 44 px target that covers no part of the guest's name", async ({
		newOffice,
	}) => {
		const { manager, first, second, newest } = await unassignedOffice(newOffice);
		const { page } = manager;
		await page.setViewportSize(PHONE);
		await page.goto("/en/inbox");
		await expect(
			view(page, "Unassigned", 3),
			"the Inbox lists the three on Unassigned",
		).toHaveAttribute("aria-pressed", "true");
		await pointerAway(page);
		for (const guest of [first, second, newest]) {
			await expect(rowOf(page, guest)).toBeVisible();
			await expectNameUncovered(page, guest, "on a phone");
			const pill = await boxOf(assignFromRow(page, guest), "Assign to…");
			expect
				.soft(pill.height, "on a phone, Assign to… is a 44 px target")
				.toBeGreaterThanOrEqual(44);
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

	test("an agent's line still says how many guests wait on them, the same in Your turn, Sent and All: '2 guests are waiting on you', '1 guest is waiting on you'", async ({
		newOffice,
	}) => {
		test.setTimeout(180_000);
		const { agentA, agentB } = await countedOffice(newOffice);
		for (const [agent, label, waiting] of [
			[agentA, "agent A", 2],
			[agentB, "agent B", 1],
		] as const) {
			const { page } = agent;
			await page.goto("/en/inbox");
			await expect(view(page, "Unassigned"), `${label} has no Unassigned view`).toHaveCount(0);
			for (const name of ["Your turn", "Sent", "All"] as const) {
				await openView(page, name);
				await expect
					.soft(countLine(page), `${label}, ${name}`)
					.toHaveText(COUNT_LINE_EN.agent(waiting));
			}
		}
	});
});
