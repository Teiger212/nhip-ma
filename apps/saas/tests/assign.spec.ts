import { randomUUID } from "node:crypto";

import type { APIRequestContext, Browser, Locator, Page } from "@playwright/test";

import { assignerAs, userIdOf } from "./support/assign";
import { ownerCopy } from "./support/copy";
import { expect, test as base } from "./support/fixtures";
import type { Joined } from "./support/operators";
import { joinOffice } from "./support/operators";
import { connectZaloOa, releaseZaloOa } from "./support/pipes";
import type { Login } from "./support/seed";
import {
	AGENT,
	AGENT_2,
	DEMO_AGENT2_NAME,
	DEMO_AGENT_NAME,
	DEMO_OFFICE_ID,
	MANAGER,
} from "./support/seed";
import type { Api } from "./support/session";
import { clientIpHeaders, withOrigin } from "./support/session";
import { signInContext } from "./support/session-state";
import { sendZaloText } from "./support/zalo";

const copy = ownerCopy("en");

/** The seeded operators' names, as the manager sees them (demo-user.ts). */
const NAME = {
	agent: DEMO_AGENT_NAME,
	agent2: DEMO_AGENT2_NAME,
} as const;

/** A guest of this test, writing on Zalo to an OA of the test's own. */
type Guest = {
	/** Zalo's id for the guest; a guest without a name is listed by it. */
	id: string;
	/** The guest writes (again); resolves with the text. */
	write: (text?: string) => Promise<string>;
	/** A reply the office sent from the Zalo app itself: Zalo echoes it to the webhook. */
	echoFromZaloApp: (text: string) => Promise<void>;
};

/** Someone signed in, in a browser of their own: what they see (`page`) and their API calls. */
type Person = { label: string; page: Page; api: Api };

/** An operator who joined an office of the test's own, known to the test by a label. */
type Member = Person & { userId: string };

/**
 * An office of the test's own (the platform admin creates it; deleted afterwards), with a Zalo OA
 * of its own, two agents and one or two managers (the kit's `admin`) who accepted their
 * invitations into it. No other spec writes to it, so its counts are exact.
 */
type OwnOffice = {
	id: string;
	agents: [Member, Member];
	managers: Member[];
	/** A new guest writes to the office for the first time. */
	newGuest: () => Promise<Guest>;
};

const test = base.extend<{
	newGuest: () => Promise<Guest>;
	signedIn: (who: Login) => Promise<Person>;
	newOffice: (options?: { managers?: 1 | 2 }) => Promise<OwnOffice>;
}>({
	// A guest writes to the walk office the way Zalo delivers it, on an OA of this test's own
	// (released afterwards, even when the test failed), so no other spec shares the thread.
	newGuest: async ({ request }, use) => {
		let oaId: string | undefined;
		await use(async () => {
			if (!oaId) {
				oaId = uniqueId("oa");
				await connectZaloOa(DEMO_OFFICE_ID, oaId);
			}
			return firstWordOf(request, oaId);
		});
		if (oaId) {
			await releaseZaloOa(oaId);
		}
	},
	signedIn: async ({ browser }, use) => {
		const people = new People(browser);
		await use((who) => people.signIn(who));
		await people.closeAll();
	},
	newOffice: async ({ admin, browser, request }, use) => {
		const oaIds: string[] = [];
		const contexts: Joined[] = [];
		await use(async ({ managers = 1 } = {}) => {
			const office = await admin.createOffice("Assign");
			const oaId = uniqueId("oa");
			oaIds.push(oaId);
			await connectZaloOa(office.id, oaId);
			const join = async (label: string, role: "member" | "admin"): Promise<Member> => {
				const joined = await joinOffice(
					admin,
					browser,
					office.id,
					role,
					role === "admin" ? "assign-manager" : "assign-agent",
				);
				contexts.push(joined);
				return { label, page: joined.page, api: joined.api, userId: joined.userId };
			};
			// Everyone joins at once (setup); each keeps their place in the list.
			const [agent1, agent2, ...joinedManagers] = await Promise.all([
				join("agent 1", "member"),
				join("agent 2", "member"),
				join("manager 1", "admin"),
				...(managers === 2 ? [join("manager 2", "admin")] : []),
			]);
			const agents: [Member, Member] = [agent1, agent2];
			return {
				id: office.id,
				agents,
				managers: joinedManagers,
				newGuest: () => firstWordOf(request, oaId),
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

class People {
	private contexts: { close: () => Promise<void> }[] = [];

	constructor(private browser: Browser) {}

	async signIn(who: Login): Promise<Person> {
		const context = await this.browser.newContext({
			extraHTTPHeaders: clientIpHeaders(who.email),
		});
		this.contexts.push(context);
		await signInContext(context, who);
		return { label: who.email, page: await context.newPage(), api: withOrigin(context.request) };
	}

	async closeAll() {
		for (const context of this.contexts) {
			await context.close();
		}
	}
}

/** A vendor id (OA, guest) no other test, repeat or earlier run uses. */
function uniqueId(kind: string): string {
	return `e2e-assign-${kind}-${randomUUID()}`;
}

/** A new guest of the OA, who has written their first message. */
async function firstWordOf(request: APIRequestContext, oaId: string): Promise<Guest> {
	const id = uniqueId("guest");
	const guest: Guest = {
		id,
		write: async (text = `Hello from ${id}, ${randomUUID().slice(0, 8)}`) => {
			await sendZaloText(request, { guestId: id, oaId, text });
			return text;
		},
		echoFromZaloApp: (text) => sendZaloText(request, { guestId: id, oaId, text, from: "office" }),
	};
	await guest.write();
	return guest;
}

/* ---------------------------------------------------------------- what a person sees */

/**
 * The Inbox, with its threads loaded: a thread is listed, or the empty Inbox says so. (The
 * view buttons show counts before the threads arrive, so they are no sign of it; an absence
 * judged before then would prove nothing.)
 */
async function openInbox(page: Page) {
	await page.goto("/en/inbox");
	await expect(
		// A row (it carries its owner flag), or the list saying it is empty, caught up, unmatched,
		// that every lead is assigned (a manager's Unassigned), or that only Quiet threads wait.
		// The view buttons above the list are buttons too, so a button proves nothing.
		threadList(page)
			.locator(
				'[data-test="thread-owner"], [data-test="inbox-empty"], [data-test="inbox-caught-up"], [data-test="inbox-no-matches"], [data-test="inbox-all-assigned"]',
			)
			// A Quiet row sits folded away until opened, so only a shown one counts.
			.filter({ visible: true })
			.or(threadList(page).getByText(copy.onlyQuiet, { exact: true }))
			.first(),
	).toBeVisible();
}

/**
 * A view button (Unassigned, a manager's only / Your turn, which a manager's names Waiting
 * (#210) / Sent / All) with its count.
 */
function view(
	page: Page,
	name: "Unassigned" | "Your turn" | "Waiting" | "Sent" | "All",
	count?: number,
) {
	return page.getByRole("button", {
		name: count === undefined ? new RegExp(`^${name} \\d+$`) : `${name} ${count}`,
		exact: count !== undefined,
	});
}

/** Every thread, answered or not. */
async function showAll(page: Page) {
	await view(page, "All").click();
	await expect(view(page, "All")).toHaveAttribute("aria-pressed", "true");
}

/** The view buttons, left to right: each read as its view's name. */
const VIEW_TAB = /^(Unassigned|Your turn|Waiting|Sent|All) \d+$/;

/** Any of this file's guests, by the Zalo id they are listed by. */
const ANY_GUEST = /^e2e-assign-guest-/;

/** Every guest's row in the list, top to bottom. */
function guestRows(page: Page) {
	return threadList(page).getByRole("button", { name: ANY_GUEST });
}

/** Text that holds this guest's id (a row, a Waiting now entry): for ordered `toHaveText`. */
function naming(guest: Guest) {
	return new RegExp(escapeRegExp(guest.id));
}

/**
 * The row's own "Assign to…" (a manager's Unassigned view): a button beside the row's button, in
 * the same list item. The inner locator is rooted at the page, as `filter({ has })` looks for it
 * inside each list item.
 */
function assignFromRow(page: Page, guest: Guest) {
	return threadList(page)
		.getByRole("listitem")
		.filter({ has: page.getByRole("button", { name: new RegExp(`^${guest.id}\\b`) }) })
		.getByRole("button", { name: copy.assignTo, exact: true });
}

/**
 * The manager points at the guest's row, which shows its "Assign to…" (from `md` up it shows on
 * hover, focus or selection, #208), and opens its menu.
 */
async function openAssignFromRow(
	page: Page,
	guest: Guest,
	message = "the row has its own Assign to…",
) {
	await rowOf(page, guest).hover();
	await expect(assignFromRow(page, guest), message).toBeVisible();
	await assignFromRow(page, guest).click();
}

/** The open "Assign to…" menu's item for an operator, by their name. */
function assignMenuItem(page: Page, name: string) {
	return page.getByRole("menu").getByRole("menuitem", { name, exact: true });
}

/** Home, with Waiting now drawn. */
async function openHome(page: Page) {
	await page.goto("/en/home");
	await expect(page.getByRole("heading", { name: "Waiting now" })).toBeVisible();
}

/** Every guest Home's Waiting now lists, top to bottom: each is a link named by the guest. */
function waitingNow(page: Page) {
	return page.getByRole("main").getByRole("link", { name: ANY_GUEST });
}

async function search(page: Page, text: string) {
	await page.getByRole("textbox", { name: "Search threads" }).fill(text);
}

/** The thread list (not the open thread). */
function threadList(page: Page) {
	return page.getByRole("complementary");
}

/** A guest's row in the list; a nameless Zalo guest is listed by their id. */
function rowOf(page: Page, guest: Guest | string) {
	const name = typeof guest === "string" ? guest : guest.id;
	return threadList(page).getByRole("button", { name: new RegExp(`^${name}\\b`) });
}

/** The open thread, its header included. */
function openThread(page: Page) {
	return page.getByRole("article");
}

/** The amber number beside Inbox in the sidebar (gone at 0). */
function navCount(page: Page) {
	return page.getByRole("link", { name: /^Inbox\b/ }).getByTestId("nav-your-turn-count");
}

/** The manager's owner filter (All threads, Unassigned, or one operator). */
function ownerFilter(page: Page) {
	return page.getByTestId("owner-filter");
}

/** The open thread header's owner control, a manager's "Assign to…". */
function assignControl(page: Page) {
	return openThread(page).getByTestId("thread-owner-select");
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

function escapeRegExp(text: string) {
	return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Whose a thread is, as its row or header shows it. */
type Owner = "unassigned" | "mine" | { other: string };

async function expectOwner(where: Locator, owner: Owner, message?: string) {
	const flag = where.getByTestId("thread-owner");
	if (owner === "unassigned") {
		await expect(flag, message).toHaveAttribute("data-owner", "unassigned");
		await expect(flag, message).toHaveText(copy.unassigned);
	} else if (owner === "mine") {
		await expect(flag, message).toHaveAttribute("data-owner", "mine");
		await expect(flag, message).toHaveText(copy.mine);
	} else {
		await expect(flag, message).toHaveAttribute("data-owner", "other");
		await expect(flag, message).toHaveText(owner.other);
	}
}

/**
 * The person has the guest's thread: under All, searching the guest finds exactly it (the
 * All count says 1), marked with its owner.
 */
async function expectHas(person: Person, guest: Guest, owner: Owner) {
	const { page } = person;
	await openInbox(page);
	await showAll(page);
	await search(page, guest.id);
	await expect(rowOf(page, guest), `${person.label} has ${guest.id}`).toBeVisible();
	await expect(view(page, "All", 1)).toBeVisible();
	await expectOwner(rowOf(page, guest), owner, `${person.label} sees who owns it`);
}

/**
 * The thread does not exist for the person: not listed, not counted, not found by search; its
 * `?thread=` link opens nothing of it, and its address in the API answers 404.
 */
async function expectHasNot(person: Person, guest: Guest, threadId: string) {
	const { page, api } = person;
	await openInbox(page);
	await showAll(page);
	await search(page, guest.id);
	for (const name of ["Your turn", "Sent", "All"] as const) {
		await expect(
			view(page, name, 0),
			`${person.label}: searching it, ${name} counts nothing`,
		).toBeVisible();
	}
	await expect(rowOf(page, guest), `${person.label} does not list ${guest.id}`).toHaveCount(0);

	await page.goto(`/en/inbox?thread=${encodeURIComponent(threadId)}`);
	await expect(
		page.getByTestId("thread-not-found"),
		`${person.label}: the thread's link says the conversation isn't here`,
	).toBeVisible();
	await expect(
		page.getByText(guest.id),
		`${person.label}: nothing on the page names ${guest.id}`,
	).toHaveCount(0);

	const listed = await api.get("/api/conversations");
	expect(listed.status()).toBe(200);
	const threads = (await listed.json()) as ListedThread[];
	expect(
		threads.map((t) => t.guestId),
		`${person.label}: the conversations API does not list it`,
	).not.toContain(guest.id);
	const opened = await api.get(threadAddress(threadId));
	expect(opened.status(), `${person.label}: opening it by its address finds nothing`).toBe(404);
}

/* ---------------------------------------------------------------- through the API */

type ListedThread = { id: string; guestId: string; unansweredInboundId: string | null };

function threadAddress(threadId: string) {
	return `/api/conversations/${encodeURIComponent(threadId)}`;
}

/** The person (a manager) asks the owner API to give the thread to `ownerId`, or to no one. */
function setOwner(person: Person, threadId: string, ownerId: string | null) {
	return person.api.post(`${threadAddress(threadId)}/owner`, { ownerId });
}

/** An operator's id, from the manager's list of the office's operators (exact name, once). */
async function operatorId(manager: Person, name: string): Promise<string> {
	const res = await manager.api.get("/api/office/agents");
	expect(res.status(), "the manager lists the office's operators").toBe(200);
	const matches = ((await res.json()) as { id: string; name: string }[]).filter(
		(o) => o.name === name,
	);
	expect(matches, `exactly one operator is named ${name}`).toHaveLength(1);
	return matches[0].id;
}

/** The operator takes a name of their own, through the kit's user update (setup). */
async function rename(member: Member): Promise<string> {
	const name = `E2E ${member.label} ${randomUUID().slice(0, 8)}`;
	const res = await member.api.post("/api/auth/update-user", { name });
	expect(res.ok(), `${member.label} takes a name of their own (${res.status()})`).toBe(true);
	return name;
}

// ---------------------------------------------------------------------------------------

// Each person's Inbox is opened afresh for every look, several times a test.
test.describe.configure({ timeout: 120_000 });

// scenario: docs/e2e-scenarios.md Assigning leads 1
test.describe("Assign 1 — a new guest waits in Unassigned, for managers only", () => {
	test("the manager finds the new guest in the Unassigned view, marked Unassigned in the list and the thread; for both agents it is not listed, counted or searched, its link opens nothing and the API answers 404", async ({
		newOffice,
	}) => {
		test.setTimeout(180_000);
		const office = await newOffice();
		const [manager] = office.managers;
		const guest = await office.newGuest();
		const threadId = await assignerAs(manager.api).threadOf(guest.id);

		// The manager: in the Unassigned view, which their Inbox opens on, marked so in the list
		// and the thread.
		const { page } = manager;
		await openInbox(page);
		await expect(view(page, "Unassigned", 1), "the Inbox opens on Unassigned").toHaveAttribute(
			"aria-pressed",
			"true",
		);
		const row = rowOf(page, guest);
		await expect(row, "the new guest is under Unassigned").toBeVisible();
		await expectOwner(row, "unassigned", "the row says Unassigned");
		await row.click();
		await expectOwner(openThread(page), "unassigned", "the thread's header says Unassigned");

		// Each agent: nothing at all in the office's Inbox, the nav counts nothing, and the
		// thread can't be found or opened.
		for (const agent of office.agents) {
			await openInbox(agent.page);
			for (const name of ["Your turn", "Sent", "All"] as const) {
				await expect(
					view(agent.page, name, 0),
					`${agent.label}: ${name} counts nothing`,
				).toBeVisible();
			}
			await expect(navCount(agent.page), `${agent.label}: the nav counts nothing`).toHaveCount(0);
			await expectHasNot(agent, guest, threadId);
		}
	});
});

// scenario: docs/e2e-scenarios.md Assigning leads 2
test.describe("Assign 2 — assigning gives the thread to that agent only", () => {
	test("from the row's Assign to… in the manager's Unassigned view, choosing agent 1 takes the thread out of Unassigned; agent 1 has it in Your turn, marked Yours, agent 2 finds nothing (404); agent 1 approves a reply and the thread stays theirs", async ({
		newOffice,
	}) => {
		test.setTimeout(180_000);
		const office = await newOffice();
		const [one, two] = office.agents;
		const [manager] = office.managers;
		// Agent 1 goes by a name of their own, so the menu item and the owner flag name them.
		const oneName = await rename(one);
		const guest = await office.newGuest();
		const threadId = await assignerAs(manager.api).threadOf(guest.id);

		// The manager, in Unassigned: the row's Assign to… → agent 1.
		const { page } = manager;
		await openInbox(page);
		await expect(view(page, "Unassigned"), "the manager has an Unassigned view").toBeVisible();
		await view(page, "Unassigned").click();
		await expect(view(page, "Unassigned", 1), "the guest waits in Unassigned").toHaveAttribute(
			"aria-pressed",
			"true",
		);
		await expect(rowOf(page, guest)).toBeVisible();
		await openAssignFromRow(page, guest);
		await expect(assignMenuItem(page, oneName), "the menu offers agent 1").toBeVisible();
		await assignMenuItem(page, oneName).click();
		await expect(rowOf(page, guest), "the thread leaves Unassigned").toHaveCount(0);
		await expect(view(page, "Unassigned", 0), "Unassigned counts nothing").toBeVisible();

		// Agent 1: Your turn, theirs.
		await openInbox(one.page);
		await expect(view(one.page, "Unassigned"), "an agent has no Unassigned view").toHaveCount(0);
		await search(one.page, guest.id);
		await expect(view(one.page, "Your turn", 1)).toHaveAttribute("aria-pressed", "true");
		const row = rowOf(one.page, guest);
		await expect(row, "the guest is waiting on agent 1").toBeVisible();
		await expectOwner(row, "mine", "agent 1's row says Yours");

		// Agent 2: nothing.
		await expectHasNot(two, guest, threadId);

		// Agent 1 answers: the reply goes out, and the thread is still theirs.
		await openInbox(one.page);
		await search(one.page, guest.id);
		await rowOf(one.page, guest).click();
		await expect(openThread(one.page).getByText(guest.id).first()).toBeVisible();
		await one.page.getByRole("textbox", { name: "Reply" }).fill(`Reply to ${guest.id}`);
		const sent = one.page.waitForResponse((r) => r.url().endsWith("/approve"));
		await one.page.getByTestId("approve-and-send").click();
		expect((await sent).status(), "agent 1's reply is sent").toBe(200);
		await view(one.page, "Sent").click();
		await expect(view(one.page, "Sent", 1), "the answered thread is under Sent").toHaveAttribute(
			"aria-pressed",
			"true",
		);
		await expectOwner(rowOf(one.page, guest), "mine", "after the reply, still agent 1's");
		await expectHas(manager, guest, { other: oneName });
		await expectHasNot(two, guest, threadId);
	});
});

// scenario: docs/e2e-scenarios.md Assigning leads 3
test.describe("Assign 3 — two managers assign at once: the last one wins", () => {
	test("manager 1 gives a new guest to agent 1 and manager 2 to agent 2 within the same second: both managers see agent 2 as owner, agent 2 has it as theirs, and agent 1 finds nothing (404)", async ({
		newOffice,
	}) => {
		test.setTimeout(240_000);
		const office = await newOffice({ managers: 2 });
		const [one, two] = office.agents;
		const [m1, m2] = office.managers;
		// Agent 2 goes by a name of their own, so "agent 2 is the owner" can be read off the badge.
		const twoName = await rename(two);
		const guest = await office.newGuest();
		const threadId = await assignerAs(m1.api).threadOf(guest.id);
		expect(await assignerAs(m2.api).threadOf(guest.id), "both managers see the thread").toBe(
			threadId,
		);

		const started = Date.now();
		const first = await setOwner(m1, threadId, one.userId);
		const second = await setOwner(m2, threadId, two.userId);
		expect(Date.now() - started, "both assignments within the same second").toBeLessThan(1_000);
		expect(first.status(), "manager 1's assignment is taken").toBe(200);
		expect(second.status(), "manager 2's assignment is taken").toBe(200);

		for (const manager of [m1, m2]) {
			await expectHas(manager, guest, { other: twoName });
			await rowOf(manager.page, guest).click();
			await expectOwner(
				openThread(manager.page),
				{ other: twoName },
				`${manager.label}'s thread header`,
			);
		}
		await expectHas(two, guest, "mine");
		await expectHasNot(one, guest, threadId);
	});
});

// scenario: docs/e2e-scenarios.md Assigning leads 4
test.describe("Assign 4 — the guest's next message goes to the owner", () => {
	test("the guest writes again on a thread the manager gave agent 1: it is Your turn for agent 1, theirs, and agent 2 still does not see it", async ({
		newGuest,
		signedIn,
	}) => {
		const guest = await newGuest();
		const one = await signedIn(AGENT);
		const two = await signedIn(AGENT_2);
		const manager = await signedIn(MANAGER);
		const assigner = assignerAs(manager.api);
		const threadId = await assigner.threadOf(guest.id);
		await assigner.assignTo(threadId, await userIdOf(one.api));

		const next = await guest.write(`Is it still available? ${guest.id}`);

		// Agent 1: Your turn, theirs, with the new message.
		await openInbox(one.page);
		await search(one.page, guest.id);
		await expect(view(one.page, "Your turn", 1)).toHaveAttribute("aria-pressed", "true");
		const row = rowOf(one.page, guest);
		await expect(row, "the guest is waiting on agent 1").toBeVisible();
		await expectOwner(row, "mine");
		await row.click();
		await expect(openThread(one.page).getByText(next, { exact: true })).toBeVisible();

		// Agent 2: still nothing.
		await expectHasNot(two, guest, threadId);
	});
});

// scenario: docs/e2e-scenarios.md Assigning leads 5
test.describe("Assign 5 — the manager sees every thread and reassigns", () => {
	test("the manager sees Unassigned threads and each agent's threads, each marked with its owner", async ({
		newGuest,
		signedIn,
	}) => {
		const unassigned = await newGuest();
		const agentOnes = await newGuest();
		const manager = await signedIn(MANAGER);
		await assignerAs(manager.api).assignGuestTo(
			agentOnes.id,
			await operatorId(manager, NAME.agent),
		);

		await expectHas(manager, unassigned, "unassigned");
		await expectHas(manager, agentOnes, { other: NAME.agent });
		// The seed's threads, one per agent (read only: nothing here changes them).
		for (const [guestName, owner] of [
			["Minji", NAME.agent],
			["Yuki", NAME.agent2],
		] as const) {
			await search(manager.page, guestName);
			await expectOwner(rowOf(manager.page, guestName), { other: owner }, `${guestName}'s owner`);
		}
	});

	test("from the thread header's Assign to…, reassigning agent 1's thread to agent 2 moves it; returning it to Unassigned takes it from agent 2, and neither agent sees it", async ({
		newGuest,
		signedIn,
	}) => {
		const guest = await newGuest();
		const one = await signedIn(AGENT);
		const two = await signedIn(AGENT_2);
		const manager = await signedIn(MANAGER);
		const assigner = assignerAs(manager.api);
		const threadId = await assigner.threadOf(guest.id);
		await assigner.assignTo(threadId, await userIdOf(one.api));

		// The manager gives it to agent 2, from the thread's header.
		await expectHas(manager, guest, { other: NAME.agent });
		await rowOf(manager.page, guest).click();
		const header = openThread(manager.page);
		const control = assignControl(manager.page);
		await expect(control).toBeVisible();
		await expect(control, "the header's owner control is Assign to…").toHaveAccessibleName(
			copy.assignTo,
		);
		const toTwo = manager.page.waitForResponse((r) => r.url().endsWith("/owner"));
		await choose(control, NAME.agent2);
		expect((await toTwo).status(), "the reassignment is saved").toBe(200);
		await expectOwner(header, { other: NAME.agent2 });

		await expectHas(two, guest, "mine");
		await expectHasNot(one, guest, threadId);

		// Back to Unassigned: neither agent has it; the manager still does.
		await expectHas(manager, guest, { other: NAME.agent2 });
		await rowOf(manager.page, guest).click();
		const back = manager.page.waitForResponse((r) => r.url().endsWith("/owner"));
		await choose(assignControl(manager.page), copy.unassigned);
		expect((await back).status(), "the return to Unassigned is saved").toBe(200);
		await expectOwner(openThread(manager.page), "unassigned");

		await expectHas(manager, guest, "unassigned");
		await expectHasNot(one, guest, threadId);
		await expectHasNot(two, guest, threadId);
	});
});

// scenario: docs/e2e-scenarios.md Assigning leads 6
test.describe("Assign 6 — a reply from the vendor's own app assigns nothing", () => {
	test("a reply sent from the Zalo app shows in the manager's thread, and the thread stays Unassigned: neither agent sees it", async ({
		newGuest,
		signedIn,
	}) => {
		const guest = await newGuest();
		const one = await signedIn(AGENT);
		const two = await signedIn(AGENT_2);
		const manager = await signedIn(MANAGER);
		const threadId = await assignerAs(manager.api).threadOf(guest.id);

		const fromZaloApp = `Sent from the Zalo app to ${guest.id}`;
		await guest.echoFromZaloApp(fromZaloApp);

		await expectHas(manager, guest, "unassigned");
		await rowOf(manager.page, guest).click();
		const thread = openThread(manager.page);
		// The office's reply is in the thread: the echo arrived, and it assigned nothing.
		await expect(thread.getByText(fromZaloApp, { exact: true })).toBeVisible();
		await expectOwner(thread, "unassigned", "the thread is still Unassigned");

		await expectHasNot(one, guest, threadId);
		await expectHasNot(two, guest, threadId);
	});
});

// scenario: docs/e2e-scenarios.md Assigning leads 7
test.describe("Assign 7 — the manager filters by owner", () => {
	test("the Inbox filter shows all threads or only one operator's threads, and offers no Unassigned (its own view)", async ({
		newGuest,
		signedIn,
	}) => {
		const unassigned = await newGuest();
		const agentOnes = await newGuest();
		const agentTwos = await newGuest();
		const manager = await signedIn(MANAGER);
		const assigner = assignerAs(manager.api);
		await assigner.assignGuestTo(agentOnes.id, await operatorId(manager, NAME.agent));
		await assigner.assignGuestTo(agentTwos.id, await operatorId(manager, NAME.agent2));

		const { page } = manager;
		await openInbox(page);
		await showAll(page);
		const filter = ownerFilter(page);
		const flags = threadList(page).getByTestId("thread-owner");
		const expectListed = async (listed: (Guest | string)[], notListed: (Guest | string)[]) => {
			for (const guest of listed) {
				await expect(rowOf(page, guest)).toBeVisible();
			}
			for (const guest of notListed) {
				await expect(rowOf(page, guest)).toHaveCount(0);
			}
		};

		await expect(filter).toBeVisible();
		await expect(filter, "the filter is Showing").toHaveAccessibleName(copy.filter);
		await expectListed([unassigned, agentOnes, agentTwos, "Minji", "Yuki"], []);
		// Unassigned is a view of its own (Assign 10), not an owner to filter by.
		await filter.click();
		await expect(
			page.getByRole("option", { name: copy.allThreads, exact: true }),
			"the filter's list is open",
		).toBeVisible();
		await expect(
			page.getByRole("option", { name: copy.unassigned, exact: true }),
			"the filter offers no Unassigned",
		).toHaveCount(0);
		await page.keyboard.press("Escape");
		await expect(page.getByRole("option"), "the filter's list is closed").toHaveCount(0);

		await choose(filter, NAME.agent);
		await expectListed([agentOnes, "Minji"], [unassigned, agentTwos, "Yuki"]);
		await expect(flags.filter({ hasNotText: new RegExp(`^${NAME.agent}$`) })).toHaveCount(0);

		await choose(filter, NAME.agent2);
		await expectListed([agentTwos, "Yuki"], [unassigned, agentOnes, "Minji"]);
		await expect(flags.filter({ hasNotText: new RegExp(`^${NAME.agent2}$`) })).toHaveCount(0);

		await choose(filter, copy.allThreads);
		await expectListed([unassigned, agentOnes, agentTwos, "Minji", "Yuki"], []);
	});
});

// scenario: docs/e2e-scenarios.md Assigning leads 8
test.describe("Assign 8 — a new agent's first day", () => {
	test("an agent who just joined the walk office, which has Unassigned guests, sees no thread at all, and the Inbox says nothing is assigned to them yet", async ({
		admin,
		browser,
		newGuest,
	}) => {
		test.setTimeout(120_000);
		// A guest of the test's own waits in Unassigned, beside the seed's Alexei and Thảo.
		const unassigned = await newGuest();
		const newcomer = await joinOffice(admin, browser, DEMO_OFFICE_ID, "member", "assign-newcomer");
		try {
			const { page, api } = newcomer;
			await openInbox(page);
			await expect(page.getByTestId("inbox-empty")).toHaveText(copy.emptyAssigned);
			for (const name of ["Your turn", "Sent", "All"] as const) {
				await expect(view(page, name, 0), `${name} counts nothing`).toBeVisible();
			}
			await expect(threadList(page).getByTestId("thread-owner"), "no thread is listed").toHaveCount(
				0,
			);
			for (const guest of [unassigned, "Alexei", "Thảo", "Minji", "Yuki"]) {
				await expect(rowOf(page, guest)).toHaveCount(0);
			}
			await expect(navCount(page), "the nav counts nothing").toHaveCount(0);

			const listed = await api.get("/api/conversations");
			expect(listed.status()).toBe(200);
			expect(await listed.json(), "nothing is listed for them").toEqual([]);
		} finally {
			await newcomer.close();
		}
	});
});

// scenario: docs/e2e-scenarios.md Assigning leads 9
test.describe("Assign 9 — an agent cannot assign", () => {
	test("an agent's thread has no Assign to… and no owner filter; the manager's same thread has Assign to…", async ({
		newGuest,
		signedIn,
	}) => {
		const guest = await newGuest();
		const one = await signedIn(AGENT);
		const manager = await signedIn(MANAGER);
		await assignerAs(manager.api).assignGuestTo(guest.id, await userIdOf(one.api));

		await expectHas(one, guest, "mine");
		await rowOf(one.page, guest).click();
		const thread = openThread(one.page);
		await expectOwner(thread, "mine");
		await expect(assignControl(one.page), "no owner control").toHaveCount(0);
		await expect(
			one.page.getByRole("combobox", { name: copy.assignTo }),
			"no Assign to…",
		).toHaveCount(0);
		await expect(one.page.getByText(copy.assignTo), "no Assign to… anywhere").toHaveCount(0);
		await expect(ownerFilter(one.page), "no owner filter either").toHaveCount(0);

		// The same thread, as the manager: Assign to… is there.
		await expectHas(manager, guest, { other: NAME.agent });
		await rowOf(manager.page, guest).click();
		await expect(
			openThread(manager.page).getByRole("combobox", { name: copy.assignTo }),
			"the manager's header has Assign to…",
		).toBeVisible();
	});

	test("the owner API refuses an agent (403) for handing their thread on, returning it to Unassigned and taking an Unassigned thread, and nothing moves", async ({
		newGuest,
		signedIn,
	}) => {
		const theirs = await newGuest();
		const unassigned = await newGuest();
		const one = await signedIn(AGENT);
		const two = await signedIn(AGENT_2);
		const manager = await signedIn(MANAGER);
		const [oneId, twoId] = [await userIdOf(one.api), await userIdOf(two.api)];
		const assigner = assignerAs(manager.api);
		const theirsId = await assigner.threadOf(theirs.id);
		const unassignedId = await assigner.threadOf(unassigned.id);
		await assigner.assignTo(theirsId, oneId);

		expect((await setOwner(one, theirsId, twoId)).status(), "handing it on").toBe(403);
		expect((await setOwner(one, theirsId, null)).status(), "returning it to Unassigned").toBe(403);
		expect((await setOwner(one, unassignedId, oneId)).status(), "taking an Unassigned thread").toBe(
			403,
		);
		expect((await setOwner(two, unassignedId, twoId)).status(), "taking an Unassigned thread").toBe(
			403,
		);

		// Nothing moved.
		await expectHas(one, theirs, "mine");
		await expectHasNot(two, theirs, theirsId);
		await expectHas(manager, theirs, { other: NAME.agent });
		await expectHas(manager, unassigned, "unassigned");
		await expectHasNot(one, unassigned, unassignedId);
		await expectHasNot(two, unassigned, unassignedId);
	});
});

// scenario: docs/e2e-scenarios.md Assigning leads 10
test.describe("Assign 10 — Unassigned comes first, oldest first", () => {
	test("the manager's Inbox opens on Unassigned, the first view, listing three new guests oldest first with its count; Assign to… on the oldest row, not selecting it, gives it to agent 1: the row leaves, the count drops and the next guest heads the list", async ({
		newOffice,
	}) => {
		test.setTimeout(180_000);
		const office = await newOffice();
		const [one] = office.agents;
		const [manager] = office.managers;
		const oneName = await rename(one);
		const assigner = assignerAs(manager.api);
		// One after another, each filed before the next writes, so their order is certain.
		const guests: Guest[] = [];
		for (let i = 0; i < 3; i++) {
			const guest = await office.newGuest();
			await assigner.threadOf(guest.id);
			guests.push(guest);
		}
		const [oldest, middle, newest] = guests;

		// The Inbox opens on Unassigned, the first of the views.
		const { page } = manager;
		await openInbox(page);
		await expect(view(page, "Unassigned", 3), "the Inbox opens on Unassigned").toHaveAttribute(
			"aria-pressed",
			"true",
		);
		await expect(
			page.getByRole("button", { name: VIEW_TAB }),
			"Unassigned comes before Waiting, Sent and All",
		).toHaveText([/^Unassigned\s*3$/, /^Waiting\s*\d+$/, /^Sent\s*\d+$/, /^All\s*\d+$/]);
		await expect(guestRows(page), "oldest first").toHaveText(guests.map(naming));

		// Assign to… never selects its row: with the newest guest open, the oldest's pill opens
		// the menu, and the newest stays open.
		await rowOf(page, newest).click();
		await expect(rowOf(page, newest)).toHaveAttribute("aria-current", "true");
		await expect(openThread(page).getByText(newest.id).first()).toBeVisible();
		await openAssignFromRow(page, oldest, "the oldest row has its own Assign to…");
		await expect(assignMenuItem(page, oneName), "the menu offers agent 1").toBeVisible();
		await page.keyboard.press("Escape");
		await expect(page.getByRole("menu")).toHaveCount(0);
		await expect(
			rowOf(page, oldest),
			"the oldest row is not selected by its Assign to…",
		).not.toHaveAttribute("aria-current", "true");
		await expect(rowOf(page, newest), "the newest is still selected").toHaveAttribute(
			"aria-current",
			"true",
		);
		await expect(
			openThread(page).getByText(oldest.id),
			"the oldest guest's thread is not opened",
		).toHaveCount(0);

		// Given to agent 1: it leaves Unassigned, and the next guest heads the list.
		await openAssignFromRow(page, oldest);
		await assignMenuItem(page, oneName).click();
		await expect(rowOf(page, oldest), "the oldest row leaves Unassigned").toHaveCount(0);
		await expect(view(page, "Unassigned", 2), "its count drops").toBeVisible();
		await expect(
			rowOf(page, newest),
			"choosing someone selects nothing: the newest is still selected",
		).toHaveAttribute("aria-current", "true");
		await expect(
			openThread(page).getByText(newest.id).first(),
			"the newest guest's thread is still the one open",
		).toBeVisible();
		await expect(guestRows(page), "the next guest heads the list").toHaveText(
			[middle, newest].map(naming),
		);
		await expectHas(one, oldest, "mine");
	});
});

// scenario: docs/e2e-scenarios.md Assigning leads 11
test.describe("Assign 11 — Waiting now lists Unassigned leads first for a manager", () => {
	test("an Unassigned guest, then agent 1's guest, then a newer Unassigned guest write: the manager's Waiting now lists both Unassigned guests oldest first, then agent 1's; agent 1's lists only their own", async ({
		newOffice,
	}) => {
		test.setTimeout(180_000);
		const office = await newOffice();
		const [one] = office.agents;
		const [manager] = office.managers;
		const assigner = assignerAs(manager.api);
		// Each filed before the next writes, so who waited longer is certain.
		const olderUnassigned = await office.newGuest();
		await assigner.threadOf(olderUnassigned.id);
		const onesGuest = await office.newGuest();
		await assigner.assignGuestTo(onesGuest.id, one.userId);
		const newerUnassigned = await office.newGuest();
		await assigner.threadOf(newerUnassigned.id);

		// Agent 1: only their own guest.
		await openHome(one.page);
		await expect(waitingNow(one.page), "agent 1's Waiting now lists only their own").toHaveText([
			naming(onesGuest),
		]);

		// The manager: the Unassigned guests first, oldest first, then agent 1's, though it waited
		// longer than the newer Unassigned guest.
		await openHome(manager.page);
		await expect(
			waitingNow(manager.page),
			"Unassigned first, each group oldest waiting first",
		).toHaveText([olderUnassigned, newerUnassigned, onesGuest].map(naming));
	});
});
