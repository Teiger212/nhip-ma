import { randomInt, randomUUID } from "node:crypto";

import type { APIRequestContext, Locator, Page } from "@playwright/test";

import type { AlertRow } from "./support/alerts";
import { alertState } from "./support/alerts";
import { assignerAs, userIdOf } from "./support/assign";
import { ownerCopy } from "./support/copy";
import { expect, test as base } from "./support/fixtures";
import { setOfficeLanguage } from "./support/office-language";
import type { Joined } from "./support/operators";
import { joinOffice } from "./support/operators";
import { connectWhatsAppNumber, connectZaloOa, releaseZaloOa } from "./support/pipes";
import type { Api } from "./support/session";
import { newWhatsAppNumber, sendWhatsAppText } from "./support/whatsapp";
import { sendZaloText } from "./support/zalo";

/**
 * Alerts are decided after the webhook has answered (ADR 0019: in the background), so every
 * look at the log polls: at Playwright's default intervals, since a read is one query (#203).
 */
const ON_THE_PHONES = { timeout: 30_000 };

/**
 * An open page learns of a guest on its next poll: every ten seconds, and every second in the E2E
 * build (#222). The ceiling stays three production rounds: a wait that passes ends when the guest
 * shows, so a lower one would save nothing and only cut CI's margin.
 */
const WITHIN_A_POLL = { timeout: 30_000 };

/**
 * What a freshly loaded page shows from its first read of the list (its title follows the count it
 * shows). In the E2E build a poll falls within this too (#222): it tells the count is right, not
 * that it came before a poll.
 */
const ON_LOAD = { timeout: 10_000 };

/** The notice for an alert that is not the viewer's to open (Alerts 8, #136). */
const COLLEAGUE_IS_ANSWERING = {
	en: "A colleague is answering this guest",
	vi: "Một đồng nghiệp đang trả lời khách này",
} as const;

/**
 * The tab title while n guests wait on the operator: the count in front of the page's own title
 * (Alerts 12, #136; ADR 0019 amended 2026-10-06, #212).
 */
function tabTitle(n: number, own: string): string {
	return `(${n}) ${own}`;
}

/** How a page's own title reads (ADR 0019): "<Page> – Nhịp", with an en dash (U+2013). */
const OWN_TITLE = /^\S.* – Nhịp$/;

/** Each page's own title, as the operator's browser tab shows it while nobody waits on them. */
type OwnTitles = { settings: string; home: string; inbox: string };

/** An operator of the test's office, signed in in a browser of their own. */
type Operator = { label: string; id: string; page: Page; api: Api };

/** A guest of this test, writing to the office's Zalo OA (nameless) or WhatsApp number (named). */
type Guest = {
	/** The vendor's id for the guest (Zalo user id, WhatsApp number): the thread's `guestId`. */
	key: string;
	/** The WhatsApp profile name; a Zalo guest has none. */
	name: string | null;
	/** How the Inbox lists them: their name, or their Zalo id. */
	listedAs: string;
	/** What their toast says. */
	waiting: string;
	/** Every text they wrote, oldest first. */
	texts: string[];
	/** The guest writes, now unless `at` says when; resolves with the text. */
	write: (text?: string, options?: { at?: Date }) => Promise<string>;
};

/**
 * An office of the test's own (the platform admin creates it, so the admin is its kit `owner`),
 * with a Zalo OA and a WhatsApp number of its own, two agents and one or two managers (the kit's
 * `admin`) who accepted their invitations into it. No other spec writes to it.
 */
type InAppOffice = {
	id: string;
	agent1: Operator;
	agent2: Operator;
	/** Manager 1, who assigns. */
	manager: Operator;
	managers: Operator[];
	/** The platform admin's account id. */
	platformAdminId: string;
	/** A Zalo guest, who has no name: listed by their Zalo id. */
	zaloGuest: () => Guest;
	/** A WhatsApp guest going by this profile name. */
	whatsAppGuest: (name: string) => Guest;
	/** The guest's thread id, as the manager's conversations API lists it. */
	threadOf: (guest: Guest) => Promise<string>;
	/** The manager gives the guest's thread to the operator, through the owner API (setup). */
	assign: (guest: Guest, to: Operator) => Promise<void>;
};

const test = base.extend<{
	newOffice: (options?: { managers?: 1 | 2 }) => Promise<InAppOffice>;
}>({
	newOffice: async ({ admin, browser, request }, use) => {
		const oaIds: string[] = [];
		const contexts: Joined[] = [];
		await use(async ({ managers = 1 } = {}) => {
			const office = await admin.createOffice("Alerts in app");
			const oaId = uniqueId("oa");
			oaIds.push(oaId);
			await connectZaloOa(office.id, oaId);
			const phoneNumberId = newWhatsAppNumber("alerts-in-app");
			await connectWhatsAppNumber(office.id, phoneNumberId);
			const join = async (label: string, role: "member" | "admin"): Promise<Operator> => {
				const joined = await joinOffice(
					admin,
					browser,
					office.id,
					role,
					role === "admin" ? "alerts-in-app-manager" : "alerts-in-app-agent",
				);
				contexts.push(joined);
				return { label, id: joined.userId, page: joined.page, api: joined.api };
			};
			// Everyone joins at once (setup); each keeps their place in the list.
			const [agent1, agent2, ...joinedManagers] = await Promise.all([
				join("agent 1", "member"),
				join("agent 2", "member"),
				...(managers === 2
					? [join("manager 1", "admin"), join("manager 2", "admin")]
					: [join("manager", "admin")]),
			]);
			const manager = joinedManagers[0];
			const assigner = assignerAs(manager.api);
			return {
				id: office.id,
				agent1,
				agent2,
				manager,
				managers: joinedManagers,
				platformAdminId: await userIdOf(admin.api),
				zaloGuest: () => zaloGuestOf(request, oaId),
				whatsAppGuest: (name) => whatsAppGuestOf(request, phoneNumberId, name),
				threadOf: (guest) => assigner.threadOf(guest.key),
				assign: (guest, to) => assigner.assignGuestTo(guest.key, to.id),
			};
		});
		for (const context of contexts) {
			await context.close();
		}
		for (const oaId of oaIds) {
			await releaseZaloOa(oaId);
		}
	},
});

/** A vendor id (OA, guest) no other test, repeat or earlier run uses. */
function uniqueId(kind: string): string {
	return `e2e-inapp-${kind}-${randomUUID()}`;
}

function zaloGuestOf(request: APIRequestContext, oaId: string): Guest {
	const key = uniqueId("guest");
	const texts: string[] = [];
	return {
		key,
		name: null,
		listedAs: key,
		waiting: "A guest is waiting",
		texts,
		write: async (text = `Hello from ${key}, ${randomUUID().slice(0, 8)}`, { at } = {}) => {
			await sendZaloText(request, { guestId: key, oaId, text, at });
			texts.push(text);
			return text;
		},
	};
}

function whatsAppGuestOf(request: APIRequestContext, phoneNumberId: string, name: string): Guest {
	// A Vietnamese mobile number of the guest's own (84 and nine digits).
	const key = `849${randomInt(10_000_000, 100_000_000)}`;
	const texts: string[] = [];
	return {
		key,
		name,
		listedAs: name,
		waiting: `${name} is waiting`,
		texts,
		write: async (
			text = `Is the flat on Xuan Dieu free? ${randomUUID().slice(0, 8)}`,
			{ at } = {},
		) => {
			await sendWhatsAppText(request, { phoneNumberId, guest: { phone: key, name }, text, at });
			texts.push(text);
			return text;
		},
	};
}

/* ---------------------------------------------------------------- what a person sees */

/** The amber number beside Inbox in the sidebar. */
function navCount(page: Page): Locator {
	return page.getByRole("link", { name: /^Inbox\b/ }).getByTestId("nav-your-turn-count");
}

/** A guest's row in the Inbox's thread list. */
function rowOf(page: Page, guest: Guest): Locator {
	return page
		.getByRole("complementary")
		.getByRole("button", { name: new RegExp(`^${guest.listedAs}\\b`) });
}

/** The open thread, its header included. */
function openThread(page: Page): Locator {
	return page.getByRole("article");
}

/** Every guest toast on the page. */
function toasts(page: Page): Locator {
	return page.getByTestId("guest-toast");
}

/** The guest's toast: a link saying who is waiting. */
function toastOf(page: Page, guest: Guest): Locator {
	return toasts(page).and(page.getByRole("link", { name: guest.waiting, exact: true }));
}

/** The guest's assignment toast: a link saying the guest was given to the viewer. */
function assignedToastOf(page: Page, guest: Guest): Locator {
	const name = `${guest.name ?? "A guest"} was assigned to you`;
	return toasts(page).and(page.getByRole("link", { name, exact: true }));
}

/** Any assignment toast on the page, whoever the guest. */
function assignedToasts(page: Page): Locator {
	return toasts(page).and(page.getByRole("link", { name: /was assigned to you$/ }));
}

/** What a person can see: hidden copies (a closed menu's rows) are not on the page for them. */
function shown(locator: Locator): Locator {
	return locator.locator("visible=true");
}

async function openSettings(page: Page) {
	await page.goto("/en/settings/general");
	await expect(page.getByRole("heading", { name: "Account settings" })).toBeVisible();
}

async function openHome(page: Page) {
	await page.goto("/en/home");
	await expect(page.getByRole("heading", { name: "Waiting now" })).toBeVisible();
}

/** What each page shows once loaded, per language. */
const LOADED = {
	en: { settings: "Account settings", home: "Waiting now" },
	vi: { settings: "Cài đặt tài khoản", home: "Đang chờ" },
} as const;

/**
 * Each page's own title (Settings, Home, the Inbox), read while nothing waits on the operator:
 * no count in the nav, so none in the tab either. Each reads "<Page> – Nhịp".
 */
async function ownTitles(page: Page, locale: Locale): Promise<OwnTitles> {
	const read = async (path: string, loaded: Locator, which: string) => {
		await page.goto(`/${locale}/${path}`);
		await expect(loaded).toBeVisible();
		await expect(page.getByTestId("nav-your-turn-count"), "nothing waits yet").toHaveCount(0);
		const title = await page.title();
		expect.soft(title, `(${locale}) ${which}'s own title is "<Page> – Nhịp"`).toMatch(OWN_TITLE);
		return title;
	};
	const heading = (name: string) => page.getByRole("heading", { name, exact: true });
	return {
		settings: await read("settings/general", heading(LOADED[locale].settings), "Settings"),
		home: await read("home", heading(LOADED[locale].home), "Home"),
		inbox: await read(
			"inbox",
			page.getByRole("complementary").getByRole("textbox").first(),
			"the Inbox",
		),
	};
}

/** The nav says n guests wait, and the tab says so too, in front of the page's own title. */
async function expectWaiting(
	page: Page,
	n: number,
	own: string,
	where: string,
	options = WITHIN_A_POLL,
) {
	await expect(page.getByTestId("nav-your-turn-count"), `${where}: the nav counts ${n}`).toHaveText(
		String(n),
		options,
	);
	await expect
		.soft(page, `${where}: the tab title reads ${tabTitle(n, own)}`)
		.toHaveTitle(tabTitle(n, own), ON_LOAD);
}

/** The operator answers the guest from the Inbox: the reply goes out (a mock send in E2E). */
async function approveReply(page: Page, guest: Guest) {
	await rowOf(page, guest).click();
	await expect(openThread(page).getByText(guest.texts.at(-1)!, { exact: true })).toBeVisible();
	await page.getByRole("textbox", { name: "Reply" }).fill(`Reply to ${guest.listedAs}`);
	const sent = page.waitForResponse((r) => r.url().endsWith("/approve"));
	await page.getByTestId("approve-and-send").click();
	expect((await sent).status(), "the reply is sent").toBe(200);
}

/** The page's address carries no thread id. */
function expectNoThreadIdInUrl(page: Page, threadId: string, where: string) {
	const url = page.url();
	expect.soft(url, `${where}: the address carries no thread id`).not.toContain(threadId);
	expect
		.soft(decodeURIComponent(url), `${where}: decoded, no thread id either`)
		.not.toContain(threadId);
	expect.soft(new URL(url).searchParams.get("thread"), `${where}: no ?thread=`).toBeNull();
}

/** The toast sits in the top-right of the window. */
async function expectTopRight(page: Page, toast: Locator) {
	const box = await toast.boundingBox();
	const viewport = page.viewportSize();
	expect(box, "the toast is laid out").not.toBeNull();
	expect(viewport, "the window has a size").not.toBeNull();
	expect
		.soft(box!.x + box!.width / 2, "the toast is on the right")
		.toBeGreaterThan(viewport!.width / 2);
	expect
		.soft(box!.y + box!.height / 2, "the toast is at the top")
		.toBeLessThan(viewport!.height / 2);
}

/** The operator's own alert of this kind on the thread, once the log holds it. */
async function alertOf(
	officeId: string,
	operator: Operator,
	threadId: string,
	kind: AlertRow["kind"],
	count = 1,
): Promise<AlertRow> {
	const mine = async () =>
		(await alertState.alerts(officeId)).filter(
			(r) => r.userId === operator.id && r.conversationId === threadId && r.kind === kind,
		);
	await expect
		.poll(async () => (await mine()).length, {
			...ON_THE_PHONES,
			message: `${operator.label} has ${count} ${kind} alert(s) on the thread`,
		})
		.toBeGreaterThanOrEqual(count);
	return (await mine()).at(-1)!;
}

/* ---------------------------------------------------------------- assignments (#133) */

type Locale = "en" | "vi";

/**
 * The kit's notification bell in the app header, and Nhịp's rows in it
 * (packages/i18n/translations/{en,vi}/saas.json, `app.notifications`).
 */
const BELL: Record<
	Locale,
	{ open: string; title: string; assigned: string; moved: (name: string | null) => string }
> = {
	en: {
		open: "Open notifications",
		title: "Notifications",
		assigned: "A manager gave you a thread",
		moved: (name) =>
			name === null ? "A guest was moved to another agent" : `${name} was moved to another agent`,
	},
	vi: {
		open: "Mở thông báo",
		title: "Thông báo",
		assigned: "Một quản lý đã giao cho bạn một cuộc trò chuyện",
		moved: (name) =>
			name === null
				? "Một khách đã được chuyển cho nhân viên khác"
				: `${name} đã được chuyển cho nhân viên khác`,
	},
};

/** Any "was moved to another agent" row, whoever the guest. */
const ANY_MOVED: Record<Locale, RegExp> = {
	en: /was moved to another agent$/,
	vi: /đã được chuyển cho nhân viên khác$/,
};

const copy = ownerCopy("en");

/**
 * The operator opens their bell on Settings, loaded afresh (no guest's thread is listed there, so
 * a guest's name on the page is the bell's).
 */
async function openBell(page: Page, locale: Locale) {
	await page.goto(`/${locale}/settings/general`);
	await page.getByRole("button", { name: BELL[locale].open, exact: true }).click();
	await expect(
		shown(page.getByText(BELL[locale].title, { exact: true })).first(),
		"the bell opens",
	).toBeVisible();
}

/** A row in the open bell, by its title. */
function bellRow(page: Page, title: string): Locator {
	return shown(page.getByText(title, { exact: true }));
}

/** The operator sets their language, through the kit's own user update (setup). */
async function setLocale(operator: Operator, locale: "en") {
	const res = await operator.api.post("/api/auth/update-user", { locale });
	expect(res.ok(), `${operator.label} sets their language (${res.status()})`).toBe(true);
}

/** The operator takes a name of their own, through the kit's user update (setup). */
async function rename(operator: Operator): Promise<string> {
	const name = `E2E ${operator.label} ${randomUUID().slice(0, 8)}`;
	const res = await operator.api.post("/api/auth/update-user", { name });
	expect(res.ok(), `${operator.label} takes a name of their own (${res.status()})`).toBe(true);
	return name;
}

/**
 * The row's own "Assign to…" in the manager's Unassigned view: a button beside the row's button,
 * in the same list item. The inner locator is rooted at the page, as `filter({ has })` looks for
 * it inside each list item.
 */
function assignFromRow(page: Page, guest: Guest): Locator {
	return page
		.getByRole("complementary")
		.getByRole("listitem")
		.filter({ has: page.getByRole("button", { name: new RegExp(`^${guest.listedAs}\\b`) }) })
		.getByRole("button", { name: copy.assignTo, exact: true });
}

/** The open "Assign to…" menu's item for an operator, by their name. */
function assignMenuItem(page: Page, name: string): Locator {
	return page.getByRole("menu").getByRole("menuitem", { name, exact: true });
}

/** Whose phone an alert went to, as the test speaks of them. */
function whose(office: InAppOffice, userId: string): string {
	if (userId === office.platformAdminId) return "platform admin";
	const operator = [office.agent1, office.agent2, ...office.managers].find((o) => o.id === userId);
	return operator?.label ?? `someone else (${userId})`;
}

/** Every alert on the thread, counted as "<who>: <kind>". */
async function tally(office: InAppOffice, threadId: string): Promise<Record<string, number>> {
	const counts: Record<string, number> = {};
	for (const row of await alertState.alerts(office.id)) {
		if (row.conversationId !== threadId) continue;
		const key = `${whose(office, row.userId)}: ${row.kind}`;
		counts[key] = (counts[key] ?? 0) + 1;
	}
	return counts;
}

/** How many alerts of this kind the operator has on the thread. */
async function countOf(
	office: InAppOffice,
	threadId: string,
	operator: Operator,
	kind: AlertRow["kind"],
): Promise<number> {
	return (await alertState.alerts(office.id)).filter(
		(r) => r.conversationId === threadId && r.userId === operator.id && r.kind === kind,
	).length;
}

/**
 * A later guest writes and their alerts reach the managers: whatever the earlier actions were
 * going to write has had its time. Absences are judged after this.
 */
async function laterGuestArrives(office: InAppOffice) {
	const later = office.zaloGuest();
	await later.write();
	const threadId = await office.threadOf(later);
	await expect
		.poll(() => tally(office, threadId), {
			...ON_THE_PHONES,
			message: "a later Unassigned guest alerts the managers",
		})
		.toEqual(Object.fromEntries(office.managers.map((m) => [`${m.label}: guest`, 1])));
}

// ---------------------------------------------------------------------------------------

// scenario: docs/e2e-scenarios.md Alerts 3 (#133; ADR 0019, ADR 0022 P4)
test.describe("Alerts 3 — an assignment alerts the chosen agent, with a bell row", () => {
	// scenario: docs/e2e-scenarios.md Alerts 3, assigning and reassigning
	test("the manager's Assign to… gives Minji to agent 1: one assigned alert, agent 1's only, and agent 1's bell says 'A manager gave you a thread' without her name and opens her thread; reassigned to agent 2, agent 2 gets the one new assigned alert, and agent 1 no alert but a bell row 'Minji was moved to another agent' that doesn't say to whom", async ({
		newOffice,
	}) => {
		test.setTimeout(360_000);
		const office = await newOffice();
		const { agent1, agent2, manager } = office;
		// Both agents read Nhịp in English (invited operators otherwise have no language), and go
		// by names of their own: the manager's menu names agent 1, and agent 2's name is what
		// agent 1's row must not give away.
		await setLocale(agent1, "en");
		await setLocale(agent2, "en");
		const oneName = await rename(agent1);
		const twoName = await rename(agent2);

		// Before anything, each agent's bell opens with no row about a thread.
		for (const agent of [agent1, agent2]) {
			await openBell(agent.page, "en");
			await expect(
				bellRow(agent.page, BELL.en.assigned),
				`${agent.label}: nothing yet`,
			).toHaveCount(0);
			await expect(shown(agent.page.getByText(ANY_MOVED.en))).toHaveCount(0);
		}

		// Minji writes and waits Unassigned: the manager is alerted (Alerts 1).
		const minji = office.whatsAppGuest("Minji");
		await minji.write();
		const threadId = await office.threadOf(minji);
		await alertOf(office.id, manager, threadId, "guest");

		// The manager, on Minji's row in Unassigned: Assign to… → agent 1.
		const { page } = manager;
		await page.goto("/en/inbox");
		await expect(rowOf(page, minji), "Minji waits in the manager's Unassigned").toBeVisible();
		// From `md` up the row shows its Assign to… on hover (#208).
		await rowOf(page, minji).hover();
		await expect(assignFromRow(page, minji), "the row has its own Assign to…").toBeVisible();
		await assignFromRow(page, minji).click();
		await expect(assignMenuItem(page, oneName), "the menu offers agent 1").toBeVisible();
		await assignMenuItem(page, oneName).click();
		await expect(rowOf(page, minji), "Minji leaves Unassigned").toHaveCount(0);

		// One assigned alert, agent 1's; the manager who assigned and agent 2 get none.
		await expect
			.poll(() => countOf(office, threadId, agent1, "assigned"), {
				...ON_THE_PHONES,
				message: "agent 1, given Minji, has an assigned alert",
			})
			.toBe(1);
		await laterGuestArrives(office);
		expect(
			await tally(office, threadId),
			"on Minji's thread: the manager's guest alert from before, and one assigned alert, agent 1's",
		).toEqual({ "manager: guest": 1, "agent 1: assigned": 1 });

		// Agent 1's bell: "A manager gave you a thread", naming no guest, and it opens the thread.
		await openBell(agent1.page, "en");
		const given = bellRow(agent1.page, BELL.en.assigned);
		await expect(given, "agent 1's bell: A manager gave you a thread").toHaveCount(1);
		await expect(
			shown(agent1.page.getByText("Minji")),
			"agent 1's bell names no guest",
		).toHaveCount(0);
		await given.click();
		await expect(agent1.page).toHaveURL(/\/en\/inbox/);
		await expect(
			openThread(agent1.page).getByText(minji.texts[0], { exact: true }),
			"the bell row opens Minji's thread",
		).toBeVisible();

		// The manager reassigns Minji to agent 2.
		await office.assign(minji, agent2);
		await expect
			.poll(() => countOf(office, threadId, agent2, "assigned"), {
				...ON_THE_PHONES,
				message: "agent 2, given Minji, has an assigned alert",
			})
			.toBe(1);
		await laterGuestArrives(office);
		expect(
			await tally(office, threadId),
			"one new assigned alert, agent 2's; agent 1, who lost Minji, gets no alert",
		).toEqual({ "manager: guest": 1, "agent 1: assigned": 1, "agent 2: assigned": 1 });

		// Agent 1's bell: Minji was moved to another agent, not to whom.
		await openBell(agent1.page, "en");
		await expect(
			bellRow(agent1.page, BELL.en.moved("Minji")),
			"agent 1's bell: Minji was moved to another agent",
		).toHaveCount(1);
		await expect(
			shown(agent1.page.getByText(twoName)),
			"agent 1's bell doesn't say to whom",
		).toHaveCount(0);

		// Agent 2's bell: A manager gave you a thread, once.
		await openBell(agent2.page, "en");
		await expect(
			bellRow(agent2.page, BELL.en.assigned),
			"agent 2's bell: A manager gave you a thread",
		).toHaveCount(1);
		await expect(shown(agent2.page.getByText(ANY_MOVED.en)), "agent 2 lost nothing").toHaveCount(0);
	});

	// scenario: docs/e2e-scenarios.md Alerts 3, a manager giving a thread to themselves
	test("a manager who gives a thread to themselves gets no alert and no bell row", async ({
		newOffice,
	}) => {
		test.setTimeout(300_000);
		const office = await newOffice();
		const { agent1, manager } = office;
		await setLocale(manager, "en");
		await setLocale(agent1, "en");
		await openBell(manager.page, "en");

		// Yuki writes and waits Unassigned; the manager takes her.
		const yuki = office.whatsAppGuest("Yuki");
		await yuki.write();
		const threadId = await office.threadOf(yuki);
		await alertOf(office.id, manager, threadId, "guest");
		await office.assign(yuki, manager);

		// Later, the manager gives another guest to agent 1, whose alert arrives: the manager's
		// own assignment has had its time.
		const later = office.zaloGuest();
		await later.write();
		const laterThread = await office.threadOf(later);
		await office.assign(later, agent1);
		await expect
			.poll(() => countOf(office, laterThread, agent1, "assigned"), {
				...ON_THE_PHONES,
				message: "agent 1, given the later guest, has an assigned alert",
			})
			.toBe(1);
		expect(
			await tally(office, threadId),
			"on Yuki's thread, only the manager's guest alert from before: none for taking it",
		).toEqual({ "manager: guest": 1 });

		// Agent 1's bell has its row; the manager's has none for Yuki.
		await openBell(agent1.page, "en");
		await expect(bellRow(agent1.page, BELL.en.assigned), "agent 1's bell row").toHaveCount(1);
		await openBell(manager.page, "en");
		await expect(
			bellRow(manager.page, BELL.en.assigned),
			"the manager's bell: no 'A manager gave you a thread'",
		).toHaveCount(0);
		await expect(
			shown(manager.page.getByText(ANY_MOVED.en)),
			"the manager's bell: nothing moved",
		).toHaveCount(0);
	});
});

// scenario: docs/e2e-scenarios.md Alerts 4 (#133; ADR 0019, ADR 0022 S2)
test.describe("Alerts 4 — a thread returned to Unassigned alerts the other managers", () => {
	test("manager 1 returns agent 1's Minji to Unassigned: one returned alert, manager 2's, and none for manager 1 who acted, either agent or the platform admin; agent 1, who lost her, gets only the bell row 'Minji đã được chuyển cho nhân viên khác'", async ({
		newOffice,
	}) => {
		test.setTimeout(360_000);
		const office = await newOffice({ managers: 2 });
		const { agent1 } = office;
		const [first, second] = office.managers;
		// The office is in Vietnamese (ADR 0025): agent 1 reads Nhịp, the bell included, in it.
		await setOfficeLanguage(first.page.request, "vi");
		await openBell(agent1.page, "vi");
		await expect(shown(agent1.page.getByText(ANY_MOVED.vi))).toHaveCount(0);

		// Minji writes and waits Unassigned: both managers are alerted (Alerts 1). Manager 1 gives
		// her to agent 1.
		const minji = office.whatsAppGuest("Minji");
		await minji.write();
		const threadId = await office.threadOf(minji);
		for (const manager of office.managers) {
			await alertOf(office.id, manager, threadId, "guest");
		}
		await office.assign(minji, agent1);

		// Manager 1 returns her to Unassigned.
		const returned = await first.api.post(
			`/api/conversations/${encodeURIComponent(threadId)}/owner`,
			{ ownerId: null },
		);
		expect(returned.status(), `manager 1 returns Minji: ${await returned.text()}`).toBe(200);

		await expect
			.poll(() => countOf(office, threadId, second, "returned"), {
				...ON_THE_PHONES,
				message: "manager 2 has a returned alert for Minji",
			})
			.toBe(1);
		await laterGuestArrives(office);
		expect(
			await tally(office, threadId),
			"one returned alert, manager 2's: none for manager 1, either agent or the platform admin",
		).toEqual({
			"manager 1: guest": 1,
			"manager 2: guest": 1,
			"agent 1: assigned": 1,
			"manager 2: returned": 1,
		});
		expect(
			(await alertState.alerts(office.id)).filter((row) => row.userId === office.platformAdminId),
			"the platform admin has no alert in the office",
		).toEqual([]);

		// Agent 1, who lost Minji: the bell row naming her, and (above) no alert.
		await openBell(agent1.page, "vi");
		await expect(
			bellRow(agent1.page, BELL.vi.moved("Minji")),
			"agent 1's bell: Minji đã được chuyển cho nhân viên khác",
		).toHaveCount(1);
	});
});

// scenario: docs/e2e-scenarios.md Alerts 8 (#136; ADR 0019, ADR 0022)
test.describe("Alerts 8 — an alert for a thread now someone else's shows a neutral notice", () => {
	test("agent 1's alert opens the thread while they hold it, and after it is reassigned shows only that a colleague is answering, with nothing of the thread and the queue usable; agent 2 opening agent 1's link and a made-up id get the notice too; the manager's own link still opens it; no address carries the thread id", async ({
		newOffice,
	}) => {
		test.setTimeout(300_000);
		const office = await newOffice();
		const { agent1, agent2, manager } = office;
		// The office is in Vietnamese (ADR 0025): every link and notice here is read in it.
		await setOfficeLanguage(manager.page.request, "vi");

		// H, agent 1's older guest, heads agent 1's queue: an Inbox that opens the first guest
		// in the queue does not open G by accident.
		const h = office.zaloGuest();
		await h.write();
		await office.assign(h, agent1);

		// G writes while Unassigned: the manager is alerted. Given to agent 1, G writes again:
		// agent 1 is alerted.
		const g = office.whatsAppGuest("Minji");
		await g.write(`Hello, is the flat in Tay Ho still free? ${randomUUID().slice(0, 8)}`);
		const threadId = await office.threadOf(g);
		const managersAlert = await alertOf(office.id, manager, threadId, "guest");
		await office.assign(g, agent1);
		await g.write(`Can I see it on Saturday? ${randomUUID().slice(0, 8)}`);
		const agent1sAlert = await alertOf(office.id, agent1, threadId, "guest");
		// The office is in Vietnamese, so its alerts' links are (Office language 8).
		expect(agent1sAlert.link, "agent 1's alert link").toMatch(/^\/vi\/inbox\?alert=/);

		// While agent 1 holds G, their own alert opens G's thread, not H's.
		await agent1.page.goto(agent1sAlert.link);
		await expect
			.soft(
				openThread(agent1.page).getByText(g.texts[1], { exact: true }),
				"agent 1's own alert opens G's thread",
			)
			.toBeVisible(WITHIN_A_POLL);
		await expect
			.soft(
				agent1.page.getByText(COLLEAGUE_IS_ANSWERING.vi, { exact: true }),
				"no notice on agent 1's own thread",
			)
			.toHaveCount(0);
		expectNoThreadIdInUrl(agent1.page, threadId, "agent 1's own alert");

		// The manager gives G to agent 2.
		await office.assign(g, agent2);

		// Agent 1 opens the same link: a colleague is answering, and nothing of G is on the page.
		await agent1.page.goto(agent1sAlert.link);
		await expect(rowOf(agent1.page, h), "agent 1's queue still lists H").toBeVisible();
		await expect
			.soft(
				agent1.page.getByText(COLLEAGUE_IS_ANSWERING.vi, { exact: true }),
				"agent 1 reads that a colleague is answering this guest",
			)
			.toBeVisible(ON_LOAD);
		await expect
			.soft(shown(agent1.page.getByText("Minji")), "no guest name on the page")
			.toHaveCount(0);
		for (const text of g.texts) {
			await expect
				.soft(shown(agent1.page.getByText(text)), "no message of G's on the page")
				.toHaveCount(0);
		}
		await expect
			.soft(shown(agent1.page.getByText("WhatsApp")), "no pipe of G's thread on the page")
			.toHaveCount(0);
		await expect
			.soft(agent1.page.getByTestId("approve-and-send"), "nothing to answer")
			.toHaveCount(0);
		expectNoThreadIdInUrl(agent1.page, threadId, "agent 1's alert, after the reassignment");
		// The queue is usable beside the notice: choosing H opens H.
		await rowOf(agent1.page, h).click();
		await expect(
			openThread(agent1.page).getByText(h.texts[0], { exact: true }),
			"choosing H beside the notice opens H's thread",
		).toBeVisible();

		// Agent 2, who now holds G, follows agent 1's link: the notice, and G is not opened.
		// (G is agent 2's own, so G's row in agent 2's list is legitimate.)
		await agent2.page.goto(agent1sAlert.link);
		await expect(rowOf(agent2.page, g), "agent 2's queue lists G").toBeVisible();
		await expect
			.soft(
				agent2.page.getByText(COLLEAGUE_IS_ANSWERING.vi, { exact: true }),
				"agent 2 opening agent 1's link reads that a colleague is answering",
			)
			.toBeVisible(ON_LOAD);
		for (const text of g.texts) {
			await expect
				.soft(openThread(agent2.page).getByText(text), "G's thread is not opened for agent 2")
				.toHaveCount(0);
		}
		await expect
			.soft(agent2.page.getByTestId("approve-and-send"), "nothing to answer")
			.toHaveCount(0);
		expectNoThreadIdInUrl(agent2.page, threadId, "agent 2 on agent 1's link");

		// An alert id that never existed, in the office's Vietnamese: the notice, with the queue
		// usable beside it.
		await agent1.page.goto(`/vi/inbox?alert=${randomUUID()}`);
		await expect(rowOf(agent1.page, h), "agent 1's queue lists H").toBeVisible();
		await expect(
			agent1.page.getByRole("button", { name: "Đến lượt bạn 1", exact: true }),
			"agent 1's Your turn view (Đến lượt bạn), with H",
		).toBeVisible();
		await expect
			.soft(
				agent1.page.getByText(COLLEAGUE_IS_ANSWERING.vi, { exact: true }),
				"an alert id that never existed reads that a colleague is answering",
			)
			.toBeVisible(ON_LOAD);
		await expect
			.soft(openThread(agent1.page).getByText(h.texts[0], { exact: true }), "H is not opened")
			.toHaveCount(0);
		await rowOf(agent1.page, h).click();
		await expect(
			openThread(agent1.page).getByText(h.texts[0], { exact: true }),
			"choosing H beside the notice opens H's thread",
		).toBeVisible();
		await expect
			.soft(
				agent1.page.getByText(COLLEAGUE_IS_ANSWERING.vi, { exact: true }),
				"the notice goes once a thread is chosen",
			)
			.toHaveCount(0);

		// The manager's own alert, from when G was Unassigned, still opens G's thread.
		expect(managersAlert.link, "the manager's alert link").toMatch(/^\/vi\/inbox\?alert=/);
		await manager.page.goto(managersAlert.link);
		await expect
			.soft(
				openThread(manager.page).getByText(g.texts[1], { exact: true }),
				"the manager's own alert opens G's thread",
			)
			.toBeVisible(WITHIN_A_POLL);
		await expect
			.soft(
				manager.page.getByText(COLLEAGUE_IS_ANSWERING.vi, { exact: true }),
				"no notice for the manager",
			)
			.toHaveCount(0);
		expectNoThreadIdInUrl(manager.page, threadId, "the manager's own alert");
	});
});

// scenario: docs/e2e-scenarios.md Alerts 12 (#136; ADR 0019, ADR 0022)
test.describe("Alerts 12 — while Nhịp is open, the tab and a toast say so", () => {
	// scenario: docs/e2e-scenarios.md Alerts 12, the tab title
	test("the tab title puts the count in front of the page's own title, (n) <Page> – Nhịp, on Settings, Home and the Inbox while n guests wait on the agent, as the nav counts them, in an English office and after moving to the Inbox through the nav; with none waiting it is the page's own title", async ({
		newOffice,
	}) => {
		test.setTimeout(300_000);
		// The office is left at English (ADR 0025); the Vietnamese titles are the next test's.
		const office = await newOffice();
		const { agent1: agent } = office;
		const { page } = agent;

		// Nothing waits on the agent yet: each page has its own title, "<Page> – Nhịp", ending on
		// the Inbox list.
		const en = await ownTitles(page, "en");

		// Two guests are given to the agent while they are on the Inbox list.
		const first = office.zaloGuest();
		const second = office.zaloGuest();
		await first.write();
		await second.write();
		await office.assign(first, agent);
		await office.assign(second, agent);
		await expectWaiting(page, 2, en.inbox, "the Inbox list, within its poll");

		// On Settings and Home alike, loaded afresh: the count in front of that page's own title.
		await openSettings(page);
		await expectWaiting(page, 2, en.settings, "Settings", ON_LOAD);
		await openHome(page);
		await expectWaiting(page, 2, en.home, "Home", ON_LOAD);

		// Settings → Inbox through the nav, without loading a page.
		await openSettings(page);
		await expectWaiting(page, 2, en.settings, "Settings", ON_LOAD);
		await page.getByRole("link", { name: /^Inbox\b/ }).click();
		await expect(page).toHaveURL(/\/en\/inbox/);
		await expect(rowOf(page, first)).toBeVisible();
		await expectWaiting(page, 2, en.inbox, "the Inbox, reached through the nav", ON_LOAD);

		// Answering lowers it, and with none waiting the title is the page's own again.
		await approveReply(page, first);
		await expectWaiting(page, 1, en.inbox, "the Inbox, one answered", ON_LOAD);
		await approveReply(page, second);
		await expect(navCount(page), "nothing waits").toHaveCount(0);
		await expect.soft(page, "the Inbox's own title, none waiting").toHaveTitle(en.inbox, ON_LOAD);
		await openSettings(page);
		await expect.soft(page, "Settings' own title, none waiting").toHaveTitle(en.settings, ON_LOAD);
	});

	// scenario: docs/e2e-scenarios.md Alerts 12, the tab title in Vietnamese
	test("in a Vietnamese office, the tab title puts the count in front of the page's own Vietnamese title on Settings, Home and the Inbox while n guests wait on the agent", async ({
		newOffice,
	}) => {
		test.setTimeout(240_000);
		const office = await newOffice();
		const { agent1: agent, manager } = office;
		const { page } = agent;
		await setOfficeLanguage(manager.page.request, "vi");

		// Nothing waits on the agent yet: each page's own Vietnamese title, ending on the Inbox list.
		const vi = await ownTitles(page, "vi");

		// Two guests are given to the agent while they are on the Inbox list.
		const first = office.zaloGuest();
		const second = office.zaloGuest();
		await first.write();
		await second.write();
		await office.assign(first, agent);
		await office.assign(second, agent);
		await expectWaiting(page, 2, vi.inbox, "the Vietnamese Inbox list, within its poll");

		// On Settings and Home alike, loaded afresh: the count in front of that page's own title.
		await page.goto("/vi/settings/general");
		await expectWaiting(page, 2, vi.settings, "Vietnamese Settings", ON_LOAD);
		await page.goto("/vi/home");
		await expectWaiting(page, 2, vi.home, "Vietnamese Home", ON_LOAD);
		await page.goto("/vi/inbox");
		await expectWaiting(page, 2, vi.inbox, "the Vietnamese Inbox", ON_LOAD);
	});

	// scenario: docs/e2e-scenarios.md Alerts 12, an agent's toasts
	test("an agent on Settings gets one toast per guest of theirs who writes, top-right, kept until tapped, at most three, none for a colleague's or an Unassigned guest or those already waiting at load; tapping one opens that thread without its id in the address; on the Inbox list the title moves and no toast shows", async ({
		newOffice,
	}) => {
		test.setTimeout(360_000);
		const office = await newOffice();
		const { agent1: agent, agent2 } = office;
		const { page } = agent;
		// The pages' own titles, read before any guest is the agent's.
		const own = await ownTitles(page, "en");

		// Four guests are the agent's, and one is agent 2's, all waiting before the agent's page
		// loads.
		const minji = office.whatsAppGuest("Minji");
		const zalo = office.zaloGuest();
		const alexei = office.whatsAppGuest("Alexei");
		const thao = office.whatsAppGuest("Thảo");
		const yuki = office.whatsAppGuest("Yuki");
		for (const guest of [minji, zalo, alexei, thao, yuki]) {
			await guest.write();
		}
		for (const guest of [minji, zalo, alexei, thao]) {
			await office.assign(guest, agent);
		}
		await office.assign(yuki, agent2);

		await openSettings(page);
		await expectWaiting(page, 4, own.settings, "Settings", ON_LOAD);
		await expect(toasts(page), "no toast at load").toHaveCount(0);
		await expect(page.getByText(/^Zalo(?: · .+)?$/), "no toast's pipe line yet").toHaveCount(0);

		// Minji writes: one toast, top-right.
		await minji.write();
		const minjisToast = toastOf(page, minji);
		await expect(minjisToast, "Minji writing raises 'Minji is waiting'").toBeVisible(WITHIN_A_POLL);
		await expectTopRight(page, minjisToast);
		await expect(
			toasts(page),
			"one toast: the guests already waiting when the page loaded raised none",
		).toHaveCount(1);

		// Minji writes again; a colleague's guest and a new Unassigned guest write; then the
		// agent's Zalo guest, who has no name.
		await minji.write();
		await yuki.write();
		const kenji = office.whatsAppGuest("Kenji");
		await kenji.write();
		await zalo.write();
		await expect(
			toastOf(page, zalo),
			"the nameless Zalo guest raises 'A guest is waiting'",
		).toBeVisible(WITHIN_A_POLL);
		await expect.soft(page.getByText(/^Zalo(?: · .+)?$/), "under it, the pipe: Zalo").toBeVisible();
		await expect(minjisToast, "Minji writing again keeps one toast, still up").toHaveCount(1);
		await expect(toastOf(page, yuki), "no toast for a colleague's guest").toHaveCount(0);
		await expect(toastOf(page, kenji), "no toast for a new Unassigned guest").toHaveCount(0);
		await expect(toasts(page), "two toasts").toHaveCount(2);
		await expectWaiting(
			page,
			4,
			own.settings,
			"Settings, neither raising the agent's count",
			ON_LOAD,
		);

		// A third, then a fourth: at most three, the oldest giving way.
		await alexei.write();
		await expect(toastOf(page, alexei), "Alexei's toast").toBeVisible(WITHIN_A_POLL);
		await expect(toasts(page), "three toasts").toHaveCount(3);
		await thao.write();
		await expect(toastOf(page, thao), "Thảo's toast").toBeVisible(WITHIN_A_POLL);
		await expect(toasts(page), "still three toasts").toHaveCount(3);
		await expect(minjisToast, "the oldest, Minji's, gave way").toHaveCount(0);
		await expect(toastOf(page, zalo), "the Zalo guest's stays").toBeVisible();
		await expect(toastOf(page, alexei), "Alexei's stays").toBeVisible();

		// Tapping Thảo's opens the Inbox on Thảo's thread, with no thread id in the address.
		const thaosThread = await office.threadOf(thao);
		await toastOf(page, thao).click();
		await expect(page).toHaveURL(/\/en\/inbox/);
		await expect(
			openThread(page).getByText(thao.texts.at(-1)!, { exact: true }),
			"tapping Thảo's toast opens Thảo's thread",
		).toBeVisible();
		expectNoThreadIdInUrl(page, thaosThread, "the toast's Inbox");
		await expect(toasts(page), "on the Inbox list, no toast").toHaveCount(0);

		// On the Inbox list a guest writing moves the title and raises no toast.
		await approveReply(page, alexei);
		await expectWaiting(page, 3, own.inbox, "the Inbox, Alexei answered", ON_LOAD);
		await alexei.write();
		await expectWaiting(page, 4, own.inbox, "the Inbox, Alexei writing again");
		await expect(toasts(page), "on the Inbox list, still no toast").toHaveCount(0);
	});

	// scenario: docs/e2e-scenarios.md Alerts 12, a manager's toasts
	test("a manager on Home gets a toast for a new Unassigned guest and for a thread they hold, none for an agent's thread, and the tab title follows their nav count; tapping opens that thread", async ({
		newOffice,
	}) => {
		test.setTimeout(300_000);
		const office = await newOffice();
		const { agent1, manager } = office;
		const { page } = manager;
		// The pages' own titles, read before any guest writes.
		const own = await ownTitles(page, "en");

		// Agent 1 holds one guest, the manager another, before the manager's page loads.
		const agents = office.zaloGuest();
		const held = office.whatsAppGuest("Yuki");
		await agents.write();
		await held.write();
		await office.assign(agents, agent1);
		await office.assign(held, manager);

		await openHome(page);
		await expect(navCount(page), "something waits on the manager").toBeVisible(WITHIN_A_POLL);
		const n = Number(await navCount(page).textContent());
		await expect
			.soft(page, "Home's tab title follows the nav")
			.toHaveTitle(tabTitle(n, own.home), ON_LOAD);
		await expect(toasts(page), "no toast at load").toHaveCount(0);

		// Agent 1's guest writes, then a new guest: only the new guest raises a toast.
		await agents.write();
		const newcomer = office.zaloGuest();
		await newcomer.write();
		await expect(
			toastOf(page, newcomer),
			"a new Unassigned guest raises 'A guest is waiting'",
		).toBeVisible(WITHIN_A_POLL);
		await expect(
			toasts(page),
			"one toast: agent 1's guest raised none for the manager",
		).toHaveCount(1);

		// The guest the manager holds writes.
		await held.write();
		await expect(
			toastOf(page, held),
			"the manager's own guest raises 'Yuki is waiting'",
		).toBeVisible(WITHIN_A_POLL);
		await expect(toasts(page), "two toasts").toHaveCount(2);
		const now = Number(await navCount(page).textContent());
		await expect
			.soft(page, "the tab title follows the nav")
			.toHaveTitle(tabTitle(now, own.home), ON_LOAD);

		// Tapping Yuki's opens the Inbox on Yuki's thread, with no thread id in the address.
		const heldThread = await office.threadOf(held);
		await toastOf(page, held).click();
		await expect(page).toHaveURL(/\/en\/inbox/);
		await expect(
			openThread(page).getByText(held.texts.at(-1)!, { exact: true }),
			"tapping Yuki's toast opens Yuki's thread",
		).toBeVisible();
		expectNoThreadIdInUrl(page, heldThread, "the toast's Inbox");
		await expect(toasts(page), "on the Inbox list, no toast").toHaveCount(0);
	});

	// scenario: docs/e2e-scenarios.md Alerts 12, an assignment raises a toast for the new owner
	test("an agent on Settings given a waiting guest gets one 'Minji was assigned to you' toast; reassigned, the new owner gets it and the old one loses theirs; tapping it opens the thread without its id in the address; the manager who assigns and a thread returned to Unassigned toast no one", async ({
		newOffice,
	}) => {
		test.setTimeout(420_000);
		const office = await newOffice();
		const { agent1, agent2, manager } = office;

		// Everyone is on Settings before any guest writes.
		await openSettings(agent1.page);
		await openSettings(agent2.page);
		await openSettings(manager.page);

		// Minji, and a nameless Zalo guest, wrote a minute ago and wait Unassigned. A thread new to a
		// list raises a "waiting" toast only if its guest wrote in the last 30 s (JUST_WROTE_MS,
		// guest-toasts.ts), and the app keeps the vendor's send time: so what agent 1 sees comes
		// from being given Minji, not from Minji writing.
		const minji = office.whatsAppGuest("Minji");
		const zalo = office.zaloGuest();
		const aMinuteAgo = new Date(Date.now() - 60_000);
		await minji.write(undefined, { at: aMinuteAgo });
		await zalo.write(undefined, { at: aMinuteAgo });
		const minjisThread = await office.threadOf(minji);

		// The manager gives Minji to agent 1: one toast, "Minji was assigned to you", over "WhatsApp".
		await office.assign(minji, agent1);
		const agent1sToast = assignedToastOf(agent1.page, minji);
		await expect(agent1sToast, "agent 1 given Minji gets 'Minji was assigned to you'").toBeVisible(
			WITHIN_A_POLL,
		);
		await expect(toasts(agent1.page), "one toast for agent 1").toHaveCount(1);
		// The pipe line sits under the link, outside its name, as in the waiting toasts.
		await expect
			.soft(agent1.page.getByText(/^WhatsApp(?: · .+)?$/), "under it, the pipe: WhatsApp")
			.toBeVisible();

		// The manager reassigns Minji to agent 2: agent 2 gets the toast, agent 1 loses theirs.
		await office.assign(minji, agent2);
		const agent2sToast = assignedToastOf(agent2.page, minji);
		await expect(agent2sToast, "agent 2 given Minji gets 'Minji was assigned to you'").toBeVisible(
			WITHIN_A_POLL,
		);
		await expect(toasts(agent2.page), "one toast for agent 2").toHaveCount(1);
		await expect(
			toasts(agent1.page),
			"agent 1, who lost Minji, has no toast: theirs went and no new one came",
		).toHaveCount(0, WITHIN_A_POLL);
		await expect(
			assignedToasts(manager.page),
			"the manager who assigned gets no assignment toast",
		).toHaveCount(0);

		// Tapping agent 2's toast opens the Inbox on Minji's thread, with no thread id in the address.
		await agent2sToast.click();
		await expect(agent2.page).toHaveURL(/\/en\/inbox/);
		await expect(
			openThread(agent2.page).getByText(minji.texts.at(-1)!, { exact: true }),
			"tapping the toast opens Minji's thread",
		).toBeVisible();
		expectNoThreadIdInUrl(agent2.page, minjisThread, "the toast's Inbox");
		await expect(toasts(agent2.page), "on the Inbox list, no toast").toHaveCount(0);

		// Agent 2 back on Settings, the manager returns Minji to Unassigned, then gives the Zalo
		// guest to agent 1: agent 1's "A guest was assigned to you" is the later toast against which
		// the return's toasts are judged absent.
		await openSettings(agent2.page);
		const returned = await manager.api.post(
			`/api/conversations/${encodeURIComponent(minjisThread)}/owner`,
			{ ownerId: null },
		);
		expect(returned.status(), `the manager returns Minji: ${await returned.text()}`).toBe(200);
		await office.assign(zalo, agent1);
		await expect(
			assignedToastOf(agent1.page, zalo),
			"agent 1 given the nameless Zalo guest gets 'A guest was assigned to you'",
		).toBeVisible(WITHIN_A_POLL);
		await expect(
			toasts(agent1.page),
			"one toast for agent 1: Minji's return raised none",
		).toHaveCount(1);
		await expect(toasts(agent2.page), "Minji's return toasts agent 2 nothing").toHaveCount(0);
		await expect(
			assignedToasts(manager.page),
			"the manager gets no assignment toast, for either assignment or the return",
		).toHaveCount(0);
	});
});
