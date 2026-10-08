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

/** Narrow pane with the sidebar open, wide with it collapsed. */
const LAPTOP = { width: 1366, height: 768 };

/** Geometry is compared to the pixel, give or take one for rounding. */
const PX = 1;
/** "Has not moved": a message's top edge, before and after, give or take two pixels. */
const STILL_PX = 2;

/** The Inbox asks again every second in the E2E build (#222); three production polls of margin. */
const WITHIN_A_POLL = { timeout: 30_000 };
/** Layout settling: the sidebar's width animates, and the thread may scroll itself on opening. */
const SETTLED = { timeout: 10_000 };
/** A layout check retried while it settles: every 50 ms rather than Playwright's backoff (#278). */
const LAID_OUT = { ...SETTLED, intervals: [50] };

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
	/** The guest writes one more message, added to their texts; returns its text. */
	write: (guest: Guest) => Promise<string>;
};

/**
 * An office of the test's own on the mock CRM, with a Zalo OA of its own and an invited manager
 * (the kit's `admin`), who sees every guest. The OA is released and the manager's browser closed
 * afterwards, even when the test failed; the office goes with the `admin` fixture.
 */
const test = base.extend<{ layoutOffice: LayoutOffice }>({
	layoutOffice: async ({ admin, browser, request }, use) => {
		const office = await admin.createOffice("layout");
		const oaId = uniqueId("oa");
		let manager: Joined | undefined;
		try {
			// Independent setup at once (#278): the CRM, the OA and the manager.
			await Promise.all([
				connectMockCrm(office.id),
				connectZaloOa(office.id, oaId),
				joinOffice(admin, browser, office.id, "admin", "layout-manager").then(
					(joined) => (manager = joined),
				),
			]);
			await use({
				id: office.id,
				manager: manager!,
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
				write: async (guest) => {
					const text = `Another message from the guest, ${randomUUID().slice(0, 8)}`;
					await sendZaloText(request, { guestId: guest.id, oaId, text });
					guest.texts.push(text);
					return text;
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
		.poll(() => widthOf(homeLink(page)), {
			message: "the sidebar is open (Home link width)",
			intervals: [50],
		})
		.toBeGreaterThanOrEqual(OPEN.minLinkWidth);
}

async function expectSidebarCollapsed(page: Page) {
	await expect
		.poll(() => widthOf(homeLink(page)), {
			message: "the sidebar is the icon strip (Home link width)",
			intervals: [50],
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
	}).toPass(LAID_OUT);
}

/** The pill that says a new message came in below what the operator is reading. */
function newMessagePill(page: Page) {
	return page.getByTestId("new-message-pill");
}

/**
 * The element's top edge once it has stopped moving: read every 50ms until six readings in a row
 * (300ms) agree, so a scroll the page is still making (smooth, or a frame after a render) is
 * waited out. Gives the last reading after 5s, so a pane that never rests fails on the number.
 */
async function restingTop(locator: Locator): Promise<number> {
	return locator.evaluate(
		(element) =>
			new Promise<number>((resolve) => {
				const started = Date.now();
				let last = element.getBoundingClientRect().top;
				let same = 0;
				const read = () => {
					const top = element.getBoundingClientRect().top;
					same = Math.abs(top - last) < 0.5 ? same + 1 : 0;
					last = top;
					if (same >= 6 || Date.now() - started > 5_000) resolve(top);
					else setTimeout(read, 50);
				};
				setTimeout(read, 50);
			}),
	);
}

/**
 * The operator scrolls the conversation with the mouse wheel, the pointer over a message in view,
 * until `target` is in view: up (negative) or down (positive).
 */
async function wheelUntilInView(page: Page, target: Locator, deltaY: number, what: string) {
	await expect(async () => {
		// A message whose centre the person sees (not clipped by the pane, nor under the header).
		let anchor: { x: number; y: number } | null = null;
		for (const message of await messages(page).all()) {
			anchor = await message.evaluate((element) => {
				const r = element.getBoundingClientRect();
				const x = r.left + r.width / 2;
				const y = r.top + r.height / 2;
				const top = document.elementFromPoint(x, y);
				return top !== null && (element === top || element.contains(top)) ? { x, y } : null;
			});
			if (anchor) break;
		}
		expect(anchor, "a message in view to scroll over").not.toBeNull();
		await page.mouse.move(anchor!.x, anchor!.y);
		await page.mouse.wheel(0, deltaY);
		await expect(target).toBeInViewport({ timeout: 500 });
	}, what).toPass(SETTLED);
}

/* ---------------------------------------------------------------- the scenarios */

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
		}, "narrow: the details are a strip, In CRM and Assign to… in the header").toPass(LAID_OUT);

		await toggleSidebar(page);
		await expectSidebarCollapsed(page);
		await expect(
			() => expectDetailsBeside(page),
			"the sidebar collapsed: the details are beside the conversation again",
		).toPass(LAID_OUT);

		await toggleSidebar(page);
		await expectSidebarOpen(page);
		await expect(async () => {
			await expectDetailsAsStrip(page);
			await expectStatusAndOwnerInHeader(page);
		}, "the sidebar open again: the details fold into the strip").toPass(LAID_OUT);
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
});

// scenario: docs/e2e-scenarios.md Thread layout 5
test.describe("Thread layout 5 — a new guest message doesn't pull an operator who is reading older ones", () => {
	test("at 1366×768 with the sidebar open, on a thread of ten messages", async ({
		layoutOffice,
	}) => {
		const page = layoutOffice.manager.page;
		const guest = await layoutOffice.newGuest(10);

		await page.setViewportSize(LAPTOP);
		await openThreadOf(page, guest);
		await expectSidebarOpen(page);
		// The thread has opened at its latest message (Thread layout 3) and rests there.
		await expectReplyReady(page, guest);

		const first = messageSaying(page, guest.texts[0]);
		const pill = newMessagePill(page);

		// The manager scrolls up to the guest's first message, reading older ones.
		await wheelUntilInView(page, first, -2_000, "the manager scrolls up to the first message");
		await expect(
			messageSaying(page, guest.texts.at(-1)!),
			"scrolled up, the latest message is out of view (else nothing could pull the reader)",
		).not.toBeInViewport();
		const before = await restingTop(first);

		// The guest writes again.
		const second = await layoutOffice.write(guest);
		const arrived = messageSaying(page, second);
		await expect(arrived, "the guest's new message is in the thread").toHaveCount(1, WITHIN_A_POLL);
		const after = await restingTop(first);
		expect(
			Math.abs(after - before),
			`the conversation stays where it was: the first message's top was ${before}, is ${after}`,
		).toBeLessThanOrEqual(STILL_PX);
		await expect(arrived, "the new message is not pulled into view").not.toBeInViewport();

		// A "New message" pill shows above the reply box.
		await expect(pill, "the New message pill shows").toBeVisible();
		await expect(pill).toHaveRole("button");
		await expect(pill).toHaveAccessibleName("New message");
		await expectWhollyInView(page, pill, "the New message pill");
		const pillBox = await boxOf(pill, "the New message pill");
		const replyBefore = await boxOf(replyBox(page), "the reply box");
		expect(pillBox.y + pillBox.height, "the pill is above the reply box").toBeLessThanOrEqual(
			replyBefore.y + PX,
		);

		// Pressing it brings the new message into view, and the pill goes.
		await pill.click();
		await expect(async () => {
			await expect(arrived, "the new message, in view").toBeInViewport({
				ratio: 0.98,
				timeout: 1_000,
			});
			const message = await boxOf(arrived, "the new message");
			const reply = await boxOf(replyBox(page), "the reply box");
			expect(
				message.y + message.height,
				"the new message ends above the reply box",
			).toBeLessThanOrEqual(reply.y + PX);
		}, "pressing the pill brings the new message into view").toPass(LAID_OUT);
		await expect(pill, "the pill goes once pressed").toBeHidden();

		// Scrolled up again, another message from the guest shows the pill again.
		await wheelUntilInView(page, first, -2_000, "the manager scrolls up again");
		const beforeThird = await restingTop(first);
		const third = await layoutOffice.write(guest);
		await expect(messageSaying(page, third), "the guest's third new message").toHaveCount(
			1,
			WITHIN_A_POLL,
		);
		const afterThird = await restingTop(first);
		expect(
			Math.abs(afterThird - beforeThird),
			`scrolled up again, the conversation stays: the first message's top was ${beforeThird}, is ${afterThird}`,
		).toBeLessThanOrEqual(STILL_PX);
		await expect(pill, "the pill shows again").toBeVisible();

		// The manager scrolls back down to the latest message themselves, and the pill goes.
		const latest = messageSaying(page, third);
		await wheelUntilInView(page, latest, 2_000, "the manager scrolls back down");
		await restingTop(latest);
		await expect(latest, "the latest message, wholly in view").toBeInViewport({ ratio: 0.98 });
		await expect(pill, "the pill goes once the manager is at the latest message").toBeHidden();

		// At the latest message, a new message from the guest comes into view on its own, no pill.
		const fourth = await layoutOffice.write(guest);
		await expect(
			messageSaying(page, fourth),
			"at the latest message, the new one comes into view on its own",
		).toBeInViewport({ ratio: 0.98, ...WITHIN_A_POLL });
		await expect(pill, "no pill when the manager was at the latest message").toBeHidden();
	});
});
