import { randomUUID } from "node:crypto";

import type { BrowserContext, Locator, Page } from "@playwright/test";

import { expect, test } from "./support/fixtures";
import { seedZaloGuests } from "./support/guests";
import type { Joined } from "./support/operators";
import { joinOffice } from "./support/operators";
import { connectZaloOa, releaseZaloOa } from "./support/pipes";
import { AGENT } from "./support/seed";
import { signInContext } from "./support/session-state";

/**
 * From `lg` (1024px) up the sidebar is a column that collapses to a 48px icon strip (#234). The
 * Home link is the ruler: the strip leaves it an icon's width, the open sidebar its label's.
 */
const STRIP = { maxLinkWidth: 48, maxRight: 56 };
const OPEN = { minLinkWidth: 150 };
/** The smallest badge a person can read a number in. */
const BADGE = { minSize: 12 };

const DESKTOP = { width: 1280, height: 800 };
const PHONE = { width: 390, height: 844 };

/**
 * The shortcut the button's tooltip names follows the person's computer: ⌘B on a Mac, Ctrl+B
 * elsewhere. Playwright's "Desktop Chrome" sends a Windows user agent while `navigator.platform`
 * says the host's own (MacIntel on a Mac, Linux on CI), so each test pins every signal a page can
 * read to one computer: the user agent (header and `navigator.userAgent`), `navigator.platform`
 * and `navigator.userAgentData.platform`. Sidebar 1 runs as a Mac (#278: the Ctrl+B label is
 * the same code with the other key).
 */
type Computer = {
	name: string;
	userAgent: string;
	platform: string;
	uaPlatform: string;
	viewport: { width: number; height: number };
	key: string;
};

const MAC: Computer = {
	name: "on a Mac",
	userAgent:
		"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36",
	platform: "MacIntel",
	uaPlatform: "macOS",
	viewport: DESKTOP,
	key: "⌘B",
};

async function pinComputer(context: BrowserContext, computer: Computer) {
	await context.addInitScript(
		({ platform, uaPlatform }) => {
			Object.defineProperty(Navigator.prototype, "platform", { get: () => platform });
			const data = (navigator as Navigator & { userAgentData?: object }).userAgentData;
			if (data) {
				Object.defineProperty(data, "platform", { get: () => uaPlatform });
			}
		},
		{ platform: computer.platform, uaPlatform: computer.uaPlatform },
	);
}

/** Setup check: every signal the page can read names the pinned computer. */
async function expectPinned(page: Page, computer: Computer) {
	const signals = await page.evaluate(() => {
		const nav = navigator as Navigator & { userAgentData?: { platform: string } };
		return {
			userAgent: nav.userAgent,
			platform: nav.platform,
			uaPlatform: nav.userAgentData?.platform,
		};
	});
	expect(signals, `the browser is ${computer.name}`).toEqual({
		userAgent: computer.userAgent,
		platform: computer.platform,
		uaPlatform: signals.uaPlatform === undefined ? undefined : computer.uaPlatform,
	});
}

/* ---------------------------------------------------------------- what a person sees */

/** The collapse/expand button (#234), not the rail on the sidebar's edge, which is labelled alike. */
function toggle(page: Page) {
	return page.getByTestId("sidebar-toggle");
}

function homeLink(page: Page) {
	return page.getByRole("link", { name: /^(Home|Trang chủ)$/ });
}

function inboxLink(page: Page) {
	return page.getByRole("link", { name: /^Inbox\b/ });
}

/** The amber Your-turn number on the Inbox item. */
function navCount(page: Page) {
	return inboxLink(page).getByTestId("nav-your-turn-count");
}

/** The tooltip on screen: one kept mounted but hidden is not one a person sees. */
function tooltip(page: Page) {
	return page.getByRole("tooltip").filter({ visible: true });
}

async function widthOf(locator: Locator): Promise<number> {
	return (await locator.boundingBox())?.width ?? -1;
}

/** The sidebar is the icon strip: the Home link is an icon's width. Width animates, so polled. */
async function expectCollapsed(page: Page, message = "the sidebar is the icon strip") {
	await expect
		.poll(() => widthOf(homeLink(page)), {
			message: `${message} (Home link width)`,
			intervals: [50],
		})
		.toBeLessThanOrEqual(STRIP.maxLinkWidth);
}

/** The sidebar is open: the Home link spans its label. */
async function expectExpanded(page: Page, message = "the sidebar is open") {
	await expect
		.poll(() => widthOf(homeLink(page)), {
			message: `${message} (Home link width)`,
			intervals: [50],
		})
		.toBeGreaterThanOrEqual(OPEN.minLinkWidth);
}

/** Opens a page and waits for its main heading, so the sidebar beside it is there too. */
async function open(page: Page, path: string) {
	await page.goto(path);
	await loaded(page);
}

async function loaded(page: Page) {
	await expect(page.getByRole("main").getByRole("heading").first()).toBeVisible();
	await expect(homeLink(page)).toBeVisible();
}

/**
 * Points at `target` with the real mouse (the disabled Coming soon items take no pointer
 * events, so `hover()` would wait forever), after first resting on the page's heading until no
 * tooltip is open, so the tooltip read next is the target's own.
 */
async function pointAt(page: Page, target: Locator) {
	const heading = await page.getByRole("main").getByRole("heading").first().boundingBox();
	expect(heading, "the page's heading, a place with no tooltip").not.toBeNull();
	await page.mouse.move(heading!.x + heading!.width / 2, heading!.y + heading!.height / 2);
	await expect(tooltip(page), "no tooltip open while resting on the page").toHaveCount(0);
	await expect(target).toBeVisible();
	const box = await target.boundingBox();
	expect(box, "the item to point at has a box").not.toBeNull();
	await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
}

/** The text a tooltip shows: the label, then the shortcut in brackets. */
function withKey(label: string, key: string): RegExp {
	const escaped = `${label} (${key})`.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
	return new RegExp(`^${escaped.replace(" \\(", "\\s*\\(")}$`);
}

/* ---------------------------------------------------------------- Sidebar 1 */

/** The button's words; the Vietnamese ones are the translation-key test's (#278). */
const COPY = {
	en: { collapse: "Collapse sidebar", expand: "Expand sidebar" },
} as const;

const computer = MAC;

// scenario: docs/e2e-scenarios.md Sidebar 1
test.describe(`Sidebar 1 — a button collapses the sidebar and expands it, and says how (${computer.name})`, () => {
	test.use({ userAgent: computer.userAgent, viewport: computer.viewport });

	test.beforeEach(async ({ context }) => {
		await pinComputer(context, computer);
		await signInContext(context, AGENT);
	});

	test(`the button beside the bell collapses the sidebar to the strip, stays at the strip's top, and expands it back; its tooltip says Collapse or Expand with ${computer.key}`, async ({
		page,
	}) => {
		await open(page, "/en/home");
		await expectPinned(page, computer);
		await expectExpanded(page, "the sidebar starts open");

		// Open: the button is in the sidebar's header, on the bell's row.
		await expect(toggle(page)).toBeVisible();
		await expect(toggle(page)).toHaveAccessibleName(COPY.en.collapse);
		const bell = page.getByRole("button", { name: "Open notifications" }).filter({
			visible: true,
		});
		const bellBox = await bell.boundingBox();
		const openBox = await toggle(page).boundingBox();
		expect(bellBox, "the bell is in the sidebar's header").not.toBeNull();
		expect(openBox).not.toBeNull();
		expect(
			Math.abs(openBox!.y + openBox!.height / 2 - (bellBox!.y + bellBox!.height / 2)),
			"the button sits on the bell's row",
		).toBeLessThanOrEqual(8);
		await pointAt(page, toggle(page));
		await expect(tooltip(page).first()).toHaveText(withKey(COPY.en.collapse, computer.key));

		// Collapse with it.
		await toggle(page).click();
		await expectCollapsed(page, "the button collapses the sidebar");
		await expect(toggle(page)).toHaveAccessibleName(COPY.en.expand);
		await expect(async () => {
			const box = await toggle(page).boundingBox();
			const home = await homeLink(page).boundingBox();
			expect(box, "the button stays on the strip").not.toBeNull();
			expect(box!.x + box!.width, "the button is inside the strip").toBeLessThanOrEqual(
				STRIP.maxRight,
			);
			expect(box!.y, "the button is at the strip's top, above Home").toBeLessThan(home!.y);
		}).toPass({ timeout: 5_000, intervals: [50] });
		await pointAt(page, toggle(page));
		await expect(tooltip(page).first()).toHaveText(withKey(COPY.en.expand, computer.key));

		// Expand with it.
		await toggle(page).click();
		await expectExpanded(page, "the button expands the sidebar back");
		await expect(toggle(page)).toHaveAccessibleName(COPY.en.collapse);
	});
});

/* ---------------------------------------------------------------- Sidebar 2 and 3 */

// scenario: docs/e2e-scenarios.md Sidebar 2
// scenario: docs/e2e-scenarios.md Sidebar 3
test.describe("Sidebar 2 and Sidebar 3 — ⌘B / Ctrl+B still collapses and expands, and the button follows; the sidebar stays as it was left, across a reload", () => {
	test.use({ viewport: DESKTOP });

	test("collapsed, it reloads collapsed with the button offering Expand; expanded again, it reloads open with the button offering Collapse", async ({
		context,
		page,
	}) => {
		await signInContext(context, AGENT);
		await open(page, "/en/home");

		await test.step("the shortcut collapses the sidebar to the strip and expands it back; the button then offers Expand, then Collapse", async () => {
			await expectExpanded(page, "the sidebar starts open");

			await page.keyboard.press("ControlOrMeta+b");
			await expectCollapsed(page, "the shortcut collapses the sidebar");
			await expect(toggle(page), "the button follows the shortcut").toHaveAccessibleName(
				COPY.en.expand,
			);

			await page.keyboard.press("ControlOrMeta+b");
			await expectExpanded(page, "the shortcut expands the sidebar");
			await expect(toggle(page), "the button follows the shortcut").toHaveAccessibleName(
				COPY.en.collapse,
			);
		});

		await test.step("collapsed, it reloads collapsed with the button offering Expand; expanded again, it reloads open with the button offering Collapse", async () => {
			await expectExpanded(page, "the sidebar starts open");

			await page.keyboard.press("ControlOrMeta+b");
			await expectCollapsed(page);
			await page.reload();
			await loaded(page);
			await expectCollapsed(page, "after a reload, the sidebar is still the strip");
			// The button's tooltip only opens once the page is live, so this is the state after
			// hydration, not only the server's first paint.
			await pointAt(page, toggle(page));
			await expect(tooltip(page).first()).toHaveText(/^Expand sidebar\b/);
			await expectCollapsed(page, "once live, the sidebar is still the strip");

			await toggle(page).click();
			await expectExpanded(page);
			await page.reload();
			await loaded(page);
			await expectExpanded(page, "after a reload, the sidebar is still open");
			await pointAt(page, toggle(page));
			await expect(tooltip(page).first()).toHaveText(/^Collapse sidebar\b/);
			await expectExpanded(page, "once live, the sidebar is still open");
		});
	});
});

/* ---------------------------------------------------------------- Sidebar 4 */

/** A vendor id (OA, guest) no other test, repeat or earlier run uses. */
function uniqueId(kind: string): string {
	return `e2e-sidebar-${kind}-${randomUUID()}`;
}

// scenario: docs/e2e-scenarios.md Sidebar 4
test.describe("Sidebar 4 — the strip keeps the Inbox's Your-turn count", () => {
	test.use({ viewport: DESKTOP });

	test("collapsed, the Inbox icon carries a readable badge with the number of guests waiting on the agent", async ({
		admin,
		browser,
	}) => {
		test.setTimeout(120_000);
		// An office of the test's own with one agent and two guests waiting on them, so the
		// count is exactly 2.
		const office = await admin.createOffice("Sidebar count");
		const oaId = uniqueId("oa");
		await connectZaloOa(office.id, oaId);
		let agent: Joined | undefined;
		try {
			agent = await joinOffice(admin, browser, office.id, "member", "sidebar");
			// The two guests wrote and were given to the agent: setup, written in bulk (#222), as
			// the scenario is the badge, not a message arriving or an assignment.
			await seedZaloGuests(office.id, oaId, [uniqueId("guest"), uniqueId("guest")], {
				fate: "assigned",
				ownerId: agent.userId,
			});

			const { page } = agent;
			await page.setViewportSize(DESKTOP);
			await open(page, "/en/home");
			await expectExpanded(page, "the sidebar starts open");
			await expect(navCount(page), "open, the Inbox item counts 2").toHaveText("2");

			await page.keyboard.press("ControlOrMeta+b");
			await expectCollapsed(page);

			await expect(navCount(page), "one count on the Inbox icon").toHaveCount(1);
			await expect(navCount(page)).toHaveText("2");
			await expect(async () => {
				const badge = await navCount(page).boundingBox();
				const icon = await inboxLink(page).boundingBox();
				expect(badge, "the badge is drawn").not.toBeNull();
				expect(icon).not.toBeNull();
				expect(badge!.width, "the badge is wide enough to read").toBeGreaterThanOrEqual(
					BADGE.minSize,
				);
				expect(badge!.height, "the badge is tall enough to read").toBeGreaterThanOrEqual(
					BADGE.minSize,
				);
				expect(badge!.x + badge!.width, "the badge is on the strip").toBeLessThanOrEqual(
					STRIP.maxRight,
				);
				const overlaps =
					badge!.x < icon!.x + icon!.width &&
					icon!.x < badge!.x + badge!.width &&
					badge!.y < icon!.y + icon!.height &&
					icon!.y < badge!.y + badge!.height;
				expect(overlaps, "the badge sits on the Inbox icon").toBe(true);
			}).toPass({ timeout: 5_000, intervals: [50] });
		} finally {
			await agent?.close();
			await releaseZaloOa(oaId);
		}
	});
});

/* ---------------------------------------------------------------- Sidebar 7 */

// scenario: docs/e2e-scenarios.md Sidebar 7
test.describe("Sidebar 7 — a phone keeps its menu sheet", () => {
	test.use({ viewport: PHONE });

	test("below lg, the top bar's menu opens the sheet with Home and Inbox, and #234's collapse button is in neither the sheet nor the top bar", async ({
		context,
		page,
	}) => {
		await signInContext(context, AGENT);
		await page.goto("/en/home");
		await page.getByRole("button", { name: "Open navigation" }).click();
		const sheet = page.getByRole("dialog");
		await expect(sheet.getByRole("link", { name: /^Home$/ })).toBeVisible();
		await expect(sheet.getByRole("link", { name: /^Inbox\b/ })).toBeVisible();
		await expect(
			page.getByTestId("sidebar-toggle").filter({ visible: true }),
			"no #234 collapse button on a phone, in the sheet or the top bar",
		).toHaveCount(0);
	});
});
