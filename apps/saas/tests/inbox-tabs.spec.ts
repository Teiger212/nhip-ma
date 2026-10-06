import { randomUUID } from "node:crypto";

import type { APIRequestContext, Browser, Page } from "@playwright/test";

import { COUNT_LINE_EN } from "./support/copy";
import type { Admin } from "./support/fixtures";
import { expect, test as base } from "./support/fixtures";
import type { Joined } from "./support/operators";
import { joinOffice } from "./support/operators";
import { connectZaloOa, releaseZaloOa } from "./support/pipes";
import { sendZaloText } from "./support/zalo";

type Locale = "en" | "vi";
type Role = "agent" | "manager";

/**
 * The Inbox's view tabs, as each language names them (spelled out here, not read from the
 * translations: the copy is what these specs prove). A manager's view of every guest the office
 * owes a reply is "Waiting" (ADR 0022, Q15, #210); VI "Đang chờ" is pending the #78 review. An
 * agent keeps "Your turn".
 */
const LABEL = {
	en: {
		unassigned: "Unassigned",
		waiting: "Waiting",
		yourTurn: "Your turn",
		sent: "Sent",
		all: "All",
	},
	vi: {
		unassigned: "Chưa giao",
		waiting: "Đang chờ",
		yourTurn: "Đến lượt bạn",
		sent: "Đã gửi",
		all: "Tất cả",
	},
} as const;

/** The Inbox's own name, after the count in the tab title: "(n) Inbox", or "(n) Inbox – Nhịp" once the title names the page (#212). */
const INBOX = { en: "Inbox", vi: "Hộp thư" } as const;

/**
 * A manager's count line under the tabs on Unassigned, where their Inbox opens: #208's wording,
 * the view's count then the office's waiting guests ("2 unassigned · 3 waiting in the office").
 * EN is `COUNT_LINE_EN`'s; VI is spelled out here, pending the #78 review.
 */
const MANAGER_COUNT_LINE = {
	en: (unassigned: number, waiting: number) => COUNT_LINE_EN.unassigned(unassigned, waiting),
	vi: (unassigned: number, waiting: number) =>
		`${unassigned} khách chưa giao · ${waiting} khách đang chờ văn phòng`,
} as const;

/** Every label a view tab has had, in either language: a tab is one of these and its count. */
const ANY_LABEL = [...Object.values(LABEL.en), ...Object.values(LABEL.vi)];
const VIEW_TAB = new RegExp(`^(${ANY_LABEL.join("|")}) \\d+$`);

/** The widths the Inbox's list is read at (DESIGN.md "Inbox.": 22rem panel from md, full-bleed below). */
const VIEWPORTS = [
	{ name: "desktop (1280)", size: { width: 1280, height: 720 } },
	{ name: "22rem panel (768)", size: { width: 768, height: 1024 } },
	{ name: "phone (390)", size: { width: 390, height: 844 } },
] as const;

/* ---------------------------------------------------------------- the office */

/** How many guests of each kind the office has: their sums are the tabs' counts. */
type Mix = {
	/** New guests nobody was given: a manager's Unassigned, owed a reply. */
	unassigned: number;
	/** Guests given to the agent, waiting on them. */
	waitingOnAgent: number;
	/** Guests given to the agent, who answered them. */
	answeredByAgent: number;
};

/** What each tab counts, for each role, given the mix (ADR 0022: a manager sees the whole office). */
function countsOf(mix: Mix) {
	const waiting = mix.unassigned + mix.waitingOnAgent;
	return {
		manager: {
			unassigned: mix.unassigned,
			waiting,
			sent: mix.answeredByAgent,
			all: waiting + mix.answeredByAgent,
		},
		agent: {
			yourTurn: mix.waitingOnAgent,
			sent: mix.answeredByAgent,
			all: mix.waitingOnAgent + mix.answeredByAgent,
		},
	};
}

type Guest = { id: string };

/**
 * An office of the test's own (deleted afterwards by the `admin` fixture), with a Zalo OA of its
 * own, one agent and one manager who joined it, and the guests of the mix. No other spec writes
 * to it, so its counts are exact.
 */
type SeededOffice = {
	agent: Joined;
	manager: Joined;
	guests: {
		unassigned: Guest[];
		waitingOnAgent: Guest[];
		answeredByAgent: Guest[];
	};
};

const test = base.extend<{ seededOffice: (mix: Mix) => Promise<SeededOffice> }>({
	seededOffice: async ({ admin, browser, request }, use) => {
		const opened: Joined[] = [];
		const oaIds: string[] = [];
		await use(async (mix) => {
			const oaId = uniqueId("oa");
			oaIds.push(oaId);
			const seeded = await seedOffice(admin, browser, request, oaId, mix);
			opened.push(seeded.agent, seeded.manager);
			return seeded;
		});
		for (const joined of opened) {
			await joined.close();
		}
		for (const oaId of oaIds) {
			await releaseZaloOa(oaId);
		}
	},
});

/** A vendor id (OA, guest) no other test, repeat or earlier run uses. */
function uniqueId(kind: string): string {
	return `e2e-tabs-${kind}-${randomUUID()}`;
}

/** Runs `work` over `items`, `size` at a time. */
async function inBatches<T>(items: T[], size: number, work: (item: T) => Promise<void>) {
	for (let i = 0; i < items.length; i += size) {
		await Promise.all(items.slice(i, i + size).map(work));
	}
}

type Listed = {
	id: string;
	guestId: string;
	unansweredInboundId: string | null;
};

async function seedOffice(
	admin: Admin,
	browser: Browser,
	request: APIRequestContext,
	oaId: string,
	mix: Mix,
): Promise<SeededOffice> {
	const office = await admin.createOffice("Tabs");
	await connectZaloOa(office.id, oaId);
	const agent = await joinOffice(admin, browser, office.id, "member", "tabs-agent");
	const manager = await joinOffice(admin, browser, office.id, "admin", "tabs-manager");

	const make = (n: number) => Array.from({ length: n }, () => ({ id: uniqueId("guest") }));
	const guests = {
		unassigned: make(mix.unassigned),
		waitingOnAgent: make(mix.waitingOnAgent),
		answeredByAgent: make(mix.answeredByAgent),
	};
	const everyone = [...guests.unassigned, ...guests.waitingOnAgent, ...guests.answeredByAgent];

	// Each guest writes once, as Zalo delivers it.
	await inBatches(everyone, 20, (guest) =>
		sendZaloText(request, {
			guestId: guest.id,
			oaId,
			text: `Hello from ${guest.id}`,
		}),
	);

	// The manager lists every one of them, once.
	let listed = new Map<string, Listed>();
	await expect(async () => {
		const res = await manager.api.get("/api/conversations");
		expect(res.status(), "the manager lists the office's threads").toBe(200);
		listed = new Map(((await res.json()) as Listed[]).map((t) => [t.guestId, t]));
		expect(listed.size, "the manager lists every guest who wrote").toBe(everyone.length);
	}).toPass({ timeout: 60_000 });
	const thread = (guest: Guest) => {
		const t = listed.get(guest.id);
		if (!t) throw new Error(`the manager does not list ${guest.id}`);
		return t;
	};

	// The manager gives the agent theirs (ADR 0022), through the owner API.
	await inBatches([...guests.waitingOnAgent, ...guests.answeredByAgent], 20, async (guest) => {
		const res = await manager.api.post(`/api/conversations/${thread(guest).id}/owner`, {
			ownerId: agent.userId,
		});
		expect(res.status(), `the manager assigns ${guest.id}: ${await res.text()}`).toBe(200);
	});

	// The agent answers some of theirs, as the reply box's approve does.
	await inBatches(guests.answeredByAgent, 20, async (guest) => {
		const { id, unansweredInboundId } = thread(guest);
		const res = await agent.api.post(`/api/conversations/${id}/approve`, {
			inboundId: unansweredInboundId,
			reply: `Reply to ${guest.id}`,
		});
		expect(res.status(), `the agent answers ${guest.id}: ${await res.text()}`).toBe(200);
	});

	return { agent, manager, guests };
}

/* ---------------------------------------------------------------- what a person sees */

/** The Inbox's view tabs, left to right: buttons in the list panel named by a view and its count. */
function viewTabs(page: Page) {
	return listPanel(page).getByRole("button", { name: VIEW_TAB });
}

/** The Inbox's list panel (the thread list beside the open thread; the whole width on a phone). */
function listPanel(page: Page) {
	return page.getByRole("complementary");
}

/** A view tab by exactly what it says. */
function tab(page: Page, label: string, count: number) {
	return listPanel(page).getByRole("button", {
		name: `${label} ${count}`,
		exact: true,
	});
}

/** The amber number beside Inbox in the sidebar. */
function navCount(page: Page) {
	return page.getByTestId("nav-your-turn-count");
}

/** Every guest of this file's row in the list. */
function guestRows(page: Page) {
	return listPanel(page).getByRole("button", { name: /^e2e-tabs-guest-/ });
}

function rowOf(page: Page, guest: Guest) {
	return listPanel(page).getByRole("button", {
		name: new RegExp(`^${guest.id}\\b`),
	});
}

/** A tab's text as `toHaveText` reads it: its label, then its full count (never "99+"). */
function tabText(label: string | undefined, count: number) {
	const name = label === undefined ? "\\D+?" : escapeRegExp(label);
	return new RegExp(`^\\s*${name}\\s*${count}\\s*$`);
}

function escapeRegExp(text: string) {
	return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * The tabs a role should see in a locale, left to right, with their counts. The manager's
 * Waiting tab is checked by its count only here: its label is Inbox view tabs 2's,
 * so a wrong label never hides whether the row fits.
 */
function expectedTabs(role: Role, locale: Locale, mix: Mix) {
	const label = LABEL[locale];
	const counts = countsOf(mix);
	return role === "manager"
		? [
				tabText(label.unassigned, counts.manager.unassigned),
				tabText(undefined, counts.manager.waiting),
				tabText(label.sent, counts.manager.sent),
				tabText(label.all, counts.manager.all),
			]
		: [
				tabText(label.yourTurn, counts.agent.yourTurn),
				tabText(label.sent, counts.agent.sent),
				tabText(label.all, counts.agent.all),
			];
}

/**
 * Everything wrong with how the view tabs sit in the list panel: an empty list when they fit on
 * one line, uncut, inside the panel, with nothing scrolling sideways. The panel clips what spills
 * out (it is `overflow: hidden`), so a row cut off at its edge must count as wrong, not only a
 * row that wraps.
 */
async function fitProblems(page: Page): Promise<string[]> {
	// The count is in a font of its own: widths are final once the fonts are.
	await page.evaluate(() => document.fonts.ready.then(() => true));
	return viewTabs(page).evaluateAll((tabs) => {
		const problems: string[] = [];
		const px = (n: number) => `${Math.round(n * 10) / 10}px`;
		const slack = 0.5;
		const panel = tabs[0]?.closest('aside, [role="complementary"]');
		if (!panel) return ["no list panel holds the tabs"];
		const panelBox = panel.getBoundingClientRect();
		const panelStyle = getComputedStyle(panel);
		const innerLeft = panelBox.left + panel.clientLeft + parseFloat(panelStyle.paddingLeft);
		const innerRight =
			panelBox.left + panel.clientLeft + panel.clientWidth - parseFloat(panelStyle.paddingRight);

		const boxes = tabs.map((t) => t.getBoundingClientRect());
		const nameOf = (t: Element) => (t.textContent ?? "").replace(/\s+/g, " ").trim();

		// One line: every tab at the same height on the page, and as tall as the others.
		for (const [i, box] of boxes.entries()) {
			if (Math.abs(box.top - boxes[0].top) > 1) {
				problems.push(
					`"${nameOf(tabs[i])}" is on another line (top ${px(box.top)}, first tab ${px(boxes[0].top)})`,
				);
			}
			if (Math.abs(box.height - boxes[0].height) > 1) {
				problems.push(
					`"${nameOf(tabs[i])}" is ${px(box.height)} tall, the first tab ${px(boxes[0].height)}`,
				);
			}
		}

		for (const [i, t] of tabs.entries()) {
			const name = nameOf(t);
			// Nothing cut inside a tab: the tab, and anything in it, is as wide as what it holds.
			for (const el of [t, ...t.querySelectorAll("*")]) {
				if (el.clientWidth > 0 && el.scrollWidth > el.clientWidth + slack) {
					problems.push(
						`"${name}" cuts its content (${el === t ? "the tab" : "inside the tab"}: ${el.scrollWidth}px of content in ${el.clientWidth}px)`,
					);
				}
			}
			// Every word of it on one line, inside the tab and inside the panel.
			const walker = document.createTreeWalker(t, NodeFilter.SHOW_TEXT);
			for (let node = walker.nextNode(); node; node = walker.nextNode()) {
				const text = (node.textContent ?? "").trim();
				if (!text) continue;
				const range = document.createRange();
				range.selectNodeContents(node);
				const lines = [...range.getClientRects()].filter((r) => r.width > 0);
				if (lines.length > 1) {
					problems.push(`"${text}" in "${name}" wraps onto ${lines.length} lines`);
				}
				const r = range.getBoundingClientRect();
				if (r.left < innerLeft - slack || r.right > innerRight + slack) {
					problems.push(
						`"${text}" in "${name}" is cut by the panel (${px(r.left)}–${px(r.right)}, panel ${px(innerLeft)}–${px(innerRight)})`,
					);
				}
				if (r.left < boxes[i].left - slack || r.right > boxes[i].right + slack) {
					problems.push(`"${text}" spills out of its tab "${name}"`);
				}
			}
		}

		// The row inside the panel's edges.
		const first = boxes[0];
		const last = boxes[boxes.length - 1];
		if (first.left < innerLeft - slack) {
			problems.push(
				`the first tab starts at ${px(first.left)}, left of the panel's ${px(innerLeft)}`,
			);
		}
		if (last.right > innerRight + slack) {
			problems.push(
				`the last tab "${nameOf(tabs[tabs.length - 1])}" ends at ${px(last.right)}, past the panel's ${px(innerRight)}`,
			);
		}

		// The row never scrolls sideways: nothing between the tabs and the panel is wider inside
		// than it shows.
		let row: Element | null = tabs[0].parentElement;
		while (row && !tabs.every((t) => row!.contains(t))) row = row.parentElement;
		for (let el = row; el && el !== panel; el = el.parentElement) {
			if (el.scrollWidth > el.clientWidth + slack) {
				problems.push(
					`the tab row scrolls sideways (${el.scrollWidth}px of content in ${el.clientWidth}px)`,
				);
			}
		}
		return problems;
	});
}

/** Opens the Inbox in a language at a size, and waits for the tabs to show these counts. */
async function openInboxAt(
	page: Page,
	locale: Locale,
	size: { width: number; height: number },
	tabs: RegExp[],
) {
	await page.setViewportSize(size);
	await page.goto(`/${locale}/inbox`);
	await expect(viewTabs(page), "the tabs show their full counts").toHaveText(tabs, {
		timeout: 15_000,
	});
}

/**
 * Every role, language and width: the tabs fit (Inbox view tabs 1). Each is read in a step of its
 * own, and judged together at the end, so one run names every place they don't fit.
 */
async function expectTabsFit(office: SeededOffice, mix: Mix) {
	const misfits: Record<string, string[]> = {};
	for (const role of ["manager", "agent"] as const) {
		const { page } = office[role];
		for (const locale of ["en", "vi"] as const) {
			for (const viewport of VIEWPORTS) {
				const where = `${role}, ${locale.toUpperCase()}, ${viewport.name}`;
				await test.step(where, async () => {
					await openInboxAt(page, locale, viewport.size, expectedTabs(role, locale, mix));
					// The tabs settle on their fit a render after they are measured: give them that.
					let problems: string[] = [];
					await expect
						.poll(
							async () => {
								problems = await fitProblems(page);
								return problems.length;
							},
							{ timeout: 5_000 },
						)
						.toBe(0)
						.catch(() => undefined);
					if (problems.length > 0) misfits[where] = problems;
				});
			}
		}
	}
	expect(misfits, "the view tabs fit on one line everywhere").toEqual({});
}

// ---------------------------------------------------------------------------------------

// scenario: docs/e2e-scenarios.md Inbox view tabs 1
test.describe("Inbox view tabs 1 — the view tabs fit on one line", () => {
	test("with two-digit counts on every tab, a manager's four tabs and an agent's three sit on one line inside the list panel, in English and Vietnamese, on a desktop, at the 22rem panel and on a phone", async ({
		seededOffice,
	}) => {
		test.setTimeout(240_000);
		// Manager: Unassigned 12, Waiting 25, Sent 14, All 39. Agent: Your turn 13, Sent 14, All 27.
		const mix = { unassigned: 12, waitingOnAgent: 13, answeredByAgent: 14 };
		await expectTabsFit(await seededOffice(mix), mix);
	});

	test("with three-digit counts on every tab, shown in full, a manager's four tabs and an agent's three sit on one line inside the list panel, in English and Vietnamese, on a desktop, at the 22rem panel and on a phone", async ({
		seededOffice,
	}) => {
		test.setTimeout(360_000);
		// Manager: Unassigned 101, Waiting 203, Sent 103, All 306. Agent: Your turn 102, Sent 103,
		// All 205.
		const mix = { unassigned: 101, waitingOnAgent: 102, answeredByAgent: 103 };
		await expectTabsFit(await seededOffice(mix), mix);
	});
});

// scenario: docs/e2e-scenarios.md Inbox view tabs 2
test.describe("Inbox view tabs 2 — a manager's Your turn reads Waiting", () => {
	// Two new guests nobody was given, one waiting on the agent, one the agent answered.
	const mix = { unassigned: 2, waitingOnAgent: 1, answeredByAgent: 1 };

	for (const locale of ["en", "vi"] as const) {
		test(`${locale.toUpperCase()}: the manager's tab of every guest the office owes a reply reads "${LABEL[locale].waiting} 3", the same office-wide number as the nav, the tab title and the count line, and lists those three guests; the agent's still reads "${LABEL[locale].yourTurn} 1"`, async ({
			seededOffice,
		}) => {
			test.setTimeout(180_000);
			const office = await seededOffice(mix);
			const label = LABEL[locale];
			const { guests } = office;

			// The manager: Waiting, not Your turn.
			const { page } = office.manager;
			await page.setViewportSize({ width: 1280, height: 720 });
			await page.goto(`/${locale}/inbox`);
			await expect(
				tab(page, label.waiting, 3),
				`the manager's tab reads "${label.waiting} 3"`,
			).toBeVisible({
				timeout: 15_000,
			});
			await expect(
				listPanel(page).getByRole("button", {
					name: new RegExp(`^${escapeRegExp(label.yourTurn)} \\d+$`),
				}),
				`the manager has no "${label.yourTurn}" tab`,
			).toHaveCount(0);
			await expect(viewTabs(page), "Unassigned, Waiting, Sent, All").toHaveText([
				tabText(label.unassigned, 2),
				tabText(label.waiting, 3),
				tabText(label.sent, 1),
				tabText(label.all, 4),
			]);

			// The same office-wide number: the nav, the tab title and the count line.
			await expect(navCount(page), "the nav counts the same three").toHaveText("3");
			await expect(page, "the tab title counts the same three").toHaveTitle(
				new RegExp(`^\\(3\\) ${INBOX[locale]}( |$)`),
			);
			await expect(
				listPanel(page).getByText(MANAGER_COUNT_LINE[locale](2, 3), { exact: true }),
				"the list's count line counts the same three",
			).toBeVisible();

			// The same threads: every guest owed a reply, the Unassigned and the agent's, and not the
			// one answered.
			await tab(page, label.waiting, 3).click();
			await expect(tab(page, label.waiting, 3)).toHaveAttribute("aria-pressed", "true");
			for (const guest of [...guests.unassigned, ...guests.waitingOnAgent]) {
				await expect(rowOf(page, guest), `Waiting lists ${guest.id}`).toBeVisible();
			}
			await expect(guestRows(page), "Waiting lists only those three").toHaveCount(3);
			await expect(rowOf(page, guests.answeredByAgent[0]), "not the answered guest").toHaveCount(0);

			// The agent of the same office: still Your turn, their own guest.
			const agent = office.agent.page;
			await agent.setViewportSize({ width: 1280, height: 720 });
			await agent.goto(`/${locale}/inbox`);
			await expect(
				tab(agent, label.yourTurn, 1),
				`the agent's tab reads "${label.yourTurn} 1"`,
			).toBeVisible({
				timeout: 15_000,
			});
			await expect(
				listPanel(agent).getByRole("button", {
					name: new RegExp(`^${escapeRegExp(label.waiting)} \\d+$`),
				}),
				`the agent has no "${label.waiting}" tab`,
			).toHaveCount(0);
			await expect(viewTabs(agent), "Your turn, Sent, All").toHaveText([
				tabText(label.yourTurn, 1),
				tabText(label.sent, 1),
				tabText(label.all, 2),
			]);
			await expect(navCount(agent), "the agent's nav counts their one").toHaveText("1");
			await tab(agent, label.yourTurn, 1).click();
			await expect(rowOf(agent, guests.waitingOnAgent[0])).toBeVisible();
			await expect(guestRows(agent), "Your turn lists only their own").toHaveCount(1);
		});
	}
});
