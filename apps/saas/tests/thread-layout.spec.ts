import { randomUUID } from "node:crypto";

import type { Locator, Page } from "@playwright/test";

import { ownerCopy } from "./support/copy";
import { connectMockCrm, mockCrmLeads } from "./support/crm";
import { expect, test as base } from "./support/fixtures";
import type { Joined } from "./support/operators";
import { joinOffice } from "./support/operators";
import { connectZaloOa, releaseZaloOa } from "./support/pipes";
import { sendZaloText } from "./support/zalo";

/**
 * An open thread is the conversation, the reply box docked under it, and the guest's details
 * beside it when the thread's own pane is wide (from 896px), or folded into a strip under the
 * header when it is narrow (#248, variant D). The pane's width is the window's less the sidebar
 * and the thread list, so the sidebar's state decides it as much as the window does.
 */

/** Wide pane: the sidebar open on a large desktop. */
const LARGE = { width: 1563, height: 784 };
/** Narrow pane with the sidebar open, wide with it collapsed. */
const LAPTOP = { width: 1366, height: 768 };
const PHONE = { width: 390, height: 844 };

/** Geometry is compared to the pixel, give or take one for rounding. */
const PX = 1;

/** The Inbox asks again every second in the E2E build (#222); three production polls of margin. */
const WITHIN_A_POLL = { timeout: 30_000 };
/** Layout settling: the sidebar's width animates, and the thread may scroll itself on opening. */
const SETTLED = { timeout: 10_000 };

const IN_CRM = "In CRM";
const ASSIGN_TO = ownerCopy("en").assignTo;

/** Sidebar 1's ruler: the Home link is an icon's width on the strip, its label's when open. */
const STRIP = { maxLinkWidth: 48 };
const OPEN = { minLinkWidth: 150 };

/** A guest of this test, writing on Zalo, and every text they sent, in order. */
type Guest = { id: string; texts: string[] };

type LayoutOffice = {
	id: string;
	manager: Joined;
	/** A new guest writes `count` messages, one after the other. */
	newGuest: (count?: number) => Promise<Guest>;
};

/**
 * An office of the test's own on the mock CRM, with a Zalo OA of its own and an invited manager
 * (the kit's `admin`), who sees every guest. The OA is released and the manager's browser closed
 * afterwards, even when the test failed; the office goes with the `admin` fixture.
 */
const test = base.extend<{ layoutOffice: LayoutOffice }>({
	layoutOffice: async ({ admin, browser, request }, use) => {
		const office = await admin.createOffice("layout");
		await connectMockCrm(office.id);
		const oaId = uniqueId("oa");
		await connectZaloOa(office.id, oaId);
		let manager: Joined | undefined;
		try {
			manager = await joinOffice(admin, browser, office.id, "admin", "layout-manager");
			await use({
				id: office.id,
				manager,
				newGuest: async (count = 1) => {
					const guest: Guest = { id: uniqueId("guest"), texts: [] };
					const nonce = randomUUID().slice(0, 8);
					for (let n = 1; n <= count; n++) {
						const text = `Message ${n} of ${count} from the guest, ${nonce}`;
						await sendZaloText(request, { guestId: guest.id, oaId, text });
						guest.texts.push(text);
					}
					return guest;
				},
			});
		} finally {
			await manager?.close();
			await releaseZaloOa(oaId);
		}
	},
});

function uniqueId(kind: string): string {
	return `e2e-layout-${kind}-${randomUUID()}`;
}

/* ---------------------------------------------------------------- what a person sees */

/** The open thread. */
function thread(page: Page) {
	return page.getByRole("article");
}

/** The open thread's header: the first `header` in it. */
function header(page: Page) {
	return thread(page).locator("header").first();
}

/** The guest's details, wherever they sit: on the page, not only inside the thread. */
function details(page: Page) {
	return page.getByTestId("thread-details");
}

function messages(page: Page) {
	return thread(page).getByTestId("message");
}

/** The guest's message with this text. */
function messageSaying(page: Page, text: string) {
	return messages(page).filter({ hasText: text });
}

function replyBox(page: Page) {
	return thread(page).getByRole("textbox", { name: "Reply" });
}

function approveAndSend(page: Page) {
	return thread(page).getByTestId("approve-and-send");
}

/** "In CRM", as a person sees it inside `region`: a copy hidden by CSS is not seen. */
function crmStatusIn(region: Locator) {
	return region.getByTestId("crm-status").filter({ visible: true });
}

/** The manager's owner control inside `region` (roles leave hidden elements out). */
function ownerIn(region: Locator) {
	return region.getByRole("combobox", { name: ASSIGN_TO });
}

function homeLink(page: Page) {
	return page.getByRole("link", { name: /^Home$/ });
}

async function widthOf(locator: Locator): Promise<number> {
	return (await locator.boundingBox())?.width ?? -1;
}

async function boxOf(locator: Locator, what: string) {
	const box = await locator.boundingBox();
	expect(box, `${what} is laid out`).not.toBeNull();
	return box!;
}

async function expectSidebarOpen(page: Page) {
	await expect
		.poll(() => widthOf(homeLink(page)), { message: "the sidebar is open (Home link width)" })
		.toBeGreaterThanOrEqual(OPEN.minLinkWidth);
}

async function expectSidebarCollapsed(page: Page) {
	await expect
		.poll(() => widthOf(homeLink(page)), {
			message: "the sidebar is the icon strip (Home link width)",
		})
		.toBeLessThanOrEqual(STRIP.maxLinkWidth);
}

/** Sidebar 1's button: collapses an open sidebar, expands a collapsed one. */
async function toggleSidebar(page: Page) {
	await page.getByTestId("sidebar-toggle").click();
}

/**
 * The manager opens the Inbox at this window size and, from its list (Unassigned, where a new
 * guest waits, ADR 0022), the guest's thread, waiting for the guest's latest message to be there.
 * Nothing inside the thread is touched: a click or a scroll there could move what is measured.
 */
async function openThreadOf(page: Page, guest: Guest) {
	await page.goto("/en/inbox");
	const row = page
		.getByRole("complementary")
		.getByRole("button", { name: new RegExp(`^${guest.id}\\b`) });
	await expect(row, `the manager has ${guest.id}'s thread in the list`).toBeVisible();
	await row.click();
	await expect(
		messageSaying(page, guest.texts.at(-1)!),
		"the thread holds the guest's latest message",
	).toHaveCount(1);
}

/** The guest's lead is in the office's CRM, so the thread can say "In CRM". */
async function expectLead(officeId: string, guest: Guest) {
	await expect
		.poll(
			async () =>
				(await mockCrmLeads(officeId)).filter((lead) => lead.zaloUserId === guest.id).length,
			{ message: `${guest.id} becomes a lead in the CRM`, ...WITHIN_A_POLL },
		)
		.toBeGreaterThan(0);
}

/** The thread says "In CRM", wherever it sits. */
async function expectInCrm(page: Page) {
	await expect(crmStatusIn(page.locator("body")), "the thread says In CRM").toHaveText(
		IN_CRM,
		WITHIN_A_POLL,
	);
}

/**
 * Wide: one set of details, to the right of the conversation (left edge at or right of every
 * message's right edge and the reply box's), starting below the header; "In CRM" and Assign to…
 * in them, not in the header.
 */
async function expectDetailsBeside(page: Page) {
	await expect(details(page), "exactly one set of guest details").toHaveCount(1);
	const panel = await boxOf(details(page), "the details");
	const head = await boxOf(header(page), "the thread's header");
	expect(panel.y, "the details start below the header").toBeGreaterThanOrEqual(
		head.y + head.height - PX,
	);
	const all = await messages(page).all();
	expect(all.length, "the thread shows messages").toBeGreaterThan(0);
	for (const [i, message] of all.entries()) {
		const box = await boxOf(message, `message ${i + 1}`);
		expect(
			panel.x,
			`the details are right of message ${i + 1} (its right edge ${box.x + box.width})`,
		).toBeGreaterThanOrEqual(box.x + box.width - PX);
	}
	const reply = await boxOf(replyBox(page), "the reply box");
	expect(
		panel.x,
		`the details are right of the reply box (its right edge ${reply.x + reply.width})`,
	).toBeGreaterThanOrEqual(reply.x + reply.width - PX);

	await expect(crmStatusIn(details(page)), "In CRM is in the details").toHaveText(IN_CRM);
	await expect(ownerIn(details(page)), "Assign to… is in the details").toHaveCount(1);
	await expect(crmStatusIn(header(page)), "no In CRM in the header").toHaveCount(0);
	await expect(ownerIn(header(page)), "no Assign to… in the header").toHaveCount(0);
}

/**
 * Narrow: one set of details, a strip under the header and above the first message, spanning the
 * messages' column (left edge at or left of each message's, right edge at or right of each's).
 */
async function expectDetailsAsStrip(page: Page) {
	await expect(details(page), "exactly one set of guest details").toHaveCount(1);
	const panel = await boxOf(details(page), "the details");
	const head = await boxOf(header(page), "the thread's header");
	expect(panel.y, "the details are under the header").toBeGreaterThanOrEqual(
		head.y + head.height - PX,
	);
	const all = await messages(page).all();
	expect(all.length, "the thread shows messages").toBeGreaterThan(0);
	// The thread opens at its latest message (Thread layout 3), so on a short pane the first one
	// can sit scrolled up under the strip: brought into view in its own pane, it is below it.
	await all[0].scrollIntoViewIfNeeded();
	const first = await boxOf(all[0], "the first message");
	expect(panel.y + panel.height, "the details are above the first message").toBeLessThanOrEqual(
		first.y + PX,
	);
	for (const [i, message] of all.entries()) {
		const box = await boxOf(message, `message ${i + 1}`);
		expect(panel.x, `the strip starts at or left of message ${i + 1}`).toBeLessThanOrEqual(
			box.x + PX,
		);
		expect(
			panel.x + panel.width,
			`the strip ends at or right of message ${i + 1}`,
		).toBeGreaterThanOrEqual(box.x + box.width - PX);
	}
}

/** Narrow: "In CRM" and Assign to… are in the header, not in the details. */
async function expectStatusAndOwnerInHeader(page: Page) {
	await expect(crmStatusIn(header(page)), "In CRM is in the header").toHaveText(IN_CRM);
	await expect(ownerIn(header(page)), "Assign to… is in the header").toHaveCount(1);
	await expect(crmStatusIn(details(page)), "no In CRM in the details").toHaveCount(0);
	await expect(ownerIn(details(page)), "no Assign to… in the details").toHaveCount(0);
}

/**
 * Wholly inside the window, as the person sees it without scrolling: the page itself not scrolled,
 * the element's box inside the window, and the point at its centre showing the element itself
 * (not clipped away by a scrolling pane, nor covered by something docked over it).
 */
async function expectWhollyInView(page: Page, locator: Locator, what: string) {
	const size = page.viewportSize()!;
	expect(await page.evaluate(() => window.scrollY), "the page is not scrolled").toBe(0);
	const box = await boxOf(locator, what);
	expect(box.x, `${what}: left edge in the window`).toBeGreaterThanOrEqual(-PX);
	expect(box.y, `${what}: top edge in the window`).toBeGreaterThanOrEqual(-PX);
	expect(box.x + box.width, `${what}: right edge in the window`).toBeLessThanOrEqual(
		size.width + PX,
	);
	expect(box.y + box.height, `${what}: bottom edge in the window`).toBeLessThanOrEqual(
		size.height + PX,
	);
	const seen = await locator.evaluate((element) => {
		const r = element.getBoundingClientRect();
		const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
		return top !== null && (element === top || element.contains(top));
	});
	expect(seen, `${what} is not hidden behind anything`).toBe(true);
}

/**
 * The thread as it opens: the reply box and Approve and send wholly in the window, and the
 * guest's latest message in view (not clipped by the conversation's own scrolling, and not under
 * the docked reply box).
 */
async function expectReplyReady(page: Page, guest: Guest) {
	const latest = messageSaying(page, guest.texts.at(-1)!);
	await expect(async () => {
		await expectWhollyInView(page, replyBox(page), "the reply box");
		await expectWhollyInView(page, approveAndSend(page), "Approve and send");
		await expectWhollyInView(page, latest, "the guest's latest message");
		// Unclipped, give or take a pixel: about 1px of a message ~59px tall.
		await expect(latest, "the guest's latest message, unclipped").toBeInViewport({
			ratio: 0.98,
			timeout: 1_000,
		});
		const message = await boxOf(latest, "the guest's latest message");
		const reply = await boxOf(replyBox(page), "the reply box");
		expect(
			message.y + message.height,
			"the guest's latest message ends above the reply box",
		).toBeLessThanOrEqual(reply.y + PX);
	}).toPass(SETTLED);
}

/* ---------------------------------------------------------------- the scenarios */

// scenario: docs/e2e-scenarios.md Thread layout 1
test.describe("Thread layout 1 — on a wide pane the details sit beside the conversation", () => {
	test("at 1563×784 with the sidebar open", async ({ layoutOffice }) => {
		const page = layoutOffice.manager.page;
		const guest = await layoutOffice.newGuest();
		await expectLead(layoutOffice.id, guest);

		await page.setViewportSize(LARGE);
		await openThreadOf(page, guest);
		await expectSidebarOpen(page);
		await expectInCrm(page);
		await expect(() => expectDetailsBeside(page)).toPass(SETTLED);
	});

	test("at 1366×768 with the sidebar collapsed", async ({ layoutOffice }) => {
		const page = layoutOffice.manager.page;
		const guest = await layoutOffice.newGuest();
		await expectLead(layoutOffice.id, guest);

		await page.setViewportSize(LAPTOP);
		await page.goto("/en/inbox");
		await expectSidebarOpen(page);
		await toggleSidebar(page);
		await expectSidebarCollapsed(page);
		await openThreadOf(page, guest);
		await expectSidebarCollapsed(page);
		await expectInCrm(page);
		await expect(() => expectDetailsBeside(page)).toPass(SETTLED);
	});
});

// scenario: docs/e2e-scenarios.md Thread layout 2
test.describe("Thread layout 2 — on a narrow pane the details fold into a strip under the header", () => {
	test("at 1366×768 with the sidebar open; collapsing and expanding it in the same window", async ({
		layoutOffice,
	}) => {
		const page = layoutOffice.manager.page;
		const guest = await layoutOffice.newGuest();
		await expectLead(layoutOffice.id, guest);

		await page.setViewportSize(LAPTOP);
		await openThreadOf(page, guest);
		await expectSidebarOpen(page);
		await expectInCrm(page);
		await expect(async () => {
			await expectDetailsAsStrip(page);
			await expectStatusAndOwnerInHeader(page);
		}, "narrow: the details are a strip, In CRM and Assign to… in the header").toPass(SETTLED);

		await toggleSidebar(page);
		await expectSidebarCollapsed(page);
		await expect(
			() => expectDetailsBeside(page),
			"the sidebar collapsed: the details are beside the conversation again",
		).toPass(SETTLED);

		await toggleSidebar(page);
		await expectSidebarOpen(page);
		await expect(async () => {
			await expectDetailsAsStrip(page);
			await expectStatusAndOwnerInHeader(page);
		}, "the sidebar open again: the details fold into the strip").toPass(SETTLED);
	});
});

// scenario: docs/e2e-scenarios.md Thread layout 3
test.describe("Thread layout 3 — the reply box is in view without scrolling, on a thread of ten messages", () => {
	test("at 1366×768 with the sidebar open (narrow pane)", async ({ layoutOffice }) => {
		const page = layoutOffice.manager.page;
		const guest = await layoutOffice.newGuest(10);

		await page.setViewportSize(LAPTOP);
		await openThreadOf(page, guest);
		await expectSidebarOpen(page);
		await expectReplyReady(page, guest);
	});

	test("at 1563×784 with the sidebar open (wide pane)", async ({ layoutOffice }) => {
		const page = layoutOffice.manager.page;
		const guest = await layoutOffice.newGuest(10);

		await page.setViewportSize(LARGE);
		await openThreadOf(page, guest);
		await expectSidebarOpen(page);
		await expectReplyReady(page, guest);
	});
});

// scenario: docs/e2e-scenarios.md Thread layout 4
test.describe("Thread layout 4 — on a phone the details are a strip too", () => {
	test("the details are a strip under the header, above the first message", async ({
		layoutOffice,
	}) => {
		const page = layoutOffice.manager.page;
		await page.setViewportSize(PHONE);
		const guest = await layoutOffice.newGuest();

		await openThreadOf(page, guest);
		await expect(() => expectDetailsAsStrip(page)).toPass(SETTLED);
	});

	test("on a thread of ten messages, the reply box is in view with the latest message", async ({
		layoutOffice,
	}) => {
		const page = layoutOffice.manager.page;
		await page.setViewportSize(PHONE);
		const guest = await layoutOffice.newGuest(10);

		await openThreadOf(page, guest);
		await expectReplyReady(page, guest);
	});
});
