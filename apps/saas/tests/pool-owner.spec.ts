import { createHash, randomUUID } from "node:crypto";

import type { APIRequestContext, Browser, Locator, Page } from "@playwright/test";

import { ownerCopy } from "./support/copy";
import type { Admin } from "./support/fixtures";
import { expect, test as base } from "./support/fixtures";
import { openInboxAsNewAccount, signUpByInvitationLink } from "./support/invitee";
import { connectZaloOa, releaseZaloOa } from "./support/pipes";
import type { Login } from "./support/seed";
import { AGENT, AGENT_2, MANAGER, WALK_OFFICE_ID } from "./support/seed";
import type { Api } from "./support/session";
import { clientIpHeaders, withOrigin } from "./support/session";
import { signInContext } from "./support/session-state";

const copy = ownerCopy("en");

/** The seeded operators' names, as the manager sees them (walk-user.ts). */
const NAME = {
	agent: "Walk Operator",
	agent2: "Walk Operator Two",
} as const;

/** A guest of this test, writing to the walk office on the test's own Zalo OA. */
type Guest = {
	/** Zalo's id for the guest; a guest without a name is listed by it. */
	id: string;
	/** The guest writes (again); resolves with the text. */
	write: (text?: string) => Promise<string>;
	/** A reply the office sent from the Zalo app itself: Zalo echoes it to the webhook. */
	echoFromZaloApp: (text: string) => Promise<void>;
};

/** Someone signed in, in a browser of their own: what they see (`page`) and their API calls. */
type Person = { who: Login; page: Page; api: Api };

const test = base.extend<{
	newGuest: () => Promise<Guest>;
	signedIn: (who: Login) => Promise<Person>;
}>({
	// A guest writes to the walk office the way Zalo delivers it, on an OA of this test's own
	// (released afterwards, even when the test failed), so no other spec shares the thread.
	newGuest: async ({ request }, use) => {
		let oaId: string | undefined;
		await use(async () => {
			if (!oaId) {
				oaId = uniqueId("oa");
				connectZaloOa(WALK_OFFICE_ID, oaId);
			}
			const oa = oaId;
			const id = uniqueId("guest");
			const guest: Guest = {
				id,
				write: async (text = `Hello from ${id}, ${randomUUID().slice(0, 8)}`) => {
					await zaloWebhook(request, "user_send_text", { from: id, to: oa, text });
					return text;
				},
				echoFromZaloApp: (text) => zaloWebhook(request, "oa_send_text", { from: oa, to: id, text }),
			};
			await guest.write();
			return guest;
		});
		if (oaId) {
			releaseZaloOa(oaId);
		}
	},
	signedIn: async ({ browser }, use) => {
		const people = new People(browser);
		await use((who) => people.signIn(who));
		await people.closeAll();
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
		return { who, page: await context.newPage(), api: withOrigin(context.request) };
	}

	async closeAll() {
		for (const context of this.contexts) {
			await context.close();
		}
	}
}

/** A vendor id (OA, guest) no other test, repeat or earlier run uses. */
function uniqueId(kind: string): string {
	return `e2e-pool-${kind}-${randomUUID()}`;
}

/** A webhook as Zalo sends and signs it (the E2E env's app and secret). */
async function zaloWebhook(
	request: APIRequestContext,
	eventName: "user_send_text" | "oa_send_text",
	message: { from: string; to: string; text: string },
) {
	const appId = process.env.ZALO_APP_ID;
	const secret = process.env.ZALO_OA_SECRET_KEY;
	if (!appId || !secret)
		throw new Error("ZALO_APP_ID and ZALO_OA_SECRET_KEY come from the E2E env");
	const timestamp = String(Date.now());
	const body = JSON.stringify({
		app_id: appId,
		event_name: eventName,
		timestamp,
		sender: { id: message.from },
		recipient: { id: message.to },
		message: { text: message.text, msg_id: randomUUID() },
	});
	const mac = createHash("sha256")
		.update(appId + body + timestamp + secret)
		.digest("hex");
	const res = await request.post("/webhooks/zalo", {
		data: body,
		headers: { "content-type": "application/json", "X-ZEvent-Signature": `mac=${mac}` },
	});
	expect(res.ok(), `the Zalo webhook (${eventName}) is taken (${res.status()})`).toBe(true);
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
		threadList(page).getByRole("button").first().or(page.getByTestId("inbox-empty")),
	).toBeVisible();
}

/** A view button (Your turn / Sent / All) with its count. */
function view(page: Page, name: "Your turn" | "Sent" | "All", count?: number) {
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

/** The open thread. */
function openThread(page: Page) {
	return page.getByRole("article");
}

/** Whose a thread is, as its row or header shows it. */
type Owner = "pool" | "mine" | { other: string };

async function expectOwner(where: Locator, owner: Owner, message?: string) {
	const flag = where.getByTestId("thread-owner");
	if (owner === "pool") {
		await expect(flag, message).toHaveAttribute("data-owner", "pool");
		await expect(flag, message).toHaveText(copy.pool);
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
	await expect(rowOf(page, guest), `${person.who.email} has ${guest.id}`).toBeVisible();
	await expect(view(page, "All", 1)).toBeVisible();
	await expectOwner(rowOf(page, guest), owner, `${person.who.email} sees who owns it`);
}

/**
 * The thread does not exist for the person: not listed, not counted, not found by search, and
 * its address in the API answers 404.
 */
async function expectHasNot(person: Person, guest: Guest, threadId: string) {
	const { page, api } = person;
	await openInbox(page);
	await showAll(page);
	await search(page, guest.id);
	await expect(rowOf(page, guest), `${person.who.email} does not list ${guest.id}`).toHaveCount(0);
	for (const name of ["Your turn", "Sent", "All"] as const) {
		await expect(view(page, name, 0), `${name} does not count it`).toBeVisible();
	}

	const listed = await api.get("/api/conversations");
	expect(listed.status()).toBe(200);
	const threads = (await listed.json()) as ListedThread[];
	expect(
		threads.map((t) => t.guestId),
		"the conversations API does not list it",
	).not.toContain(guest.id);
	const opened = await api.get(threadAddress(threadId));
	expect(opened.status(), "opening it by its address finds nothing").toBe(404);
}

/* ---------------------------------------------------------------- through the API */

type ListedThread = { id: string; guestId: string; unansweredInboundId: string | null };

function threadAddress(threadId: string) {
	return `/api/conversations/${encodeURIComponent(threadId)}`;
}

/** The guest's thread as this person's conversations API lists it, once it is there. */
async function threadSeenBy(api: Api, guest: Guest): Promise<ListedThread> {
	let thread: ListedThread | undefined;
	await expect(async () => {
		const res = await api.get("/api/conversations");
		expect(res.status()).toBe(200);
		thread = ((await res.json()) as ListedThread[]).find((t) => t.guestId === guest.id);
		expect(thread, `${guest.id} is listed`).toBeDefined();
	}).toPass({ timeout: 10_000 });
	return thread!;
}

/** Approves a reply to the guest's waiting message, as the app's send button does. */
async function approve(api: Api, thread: ListedThread, reply: string) {
	expect(thread.unansweredInboundId, "the guest is waiting on a reply").toBeTruthy();
	return api.post(`${threadAddress(thread.id)}/approve`, {
		inboundId: thread.unansweredInboundId,
		reply,
	});
}

/** The person answers the guest's waiting message in Nhịp (setup: it claims a pool thread). */
async function answerAs(person: Person, guest: Guest) {
	const res = await approve(
		person.api,
		await threadSeenBy(person.api, guest),
		`Reply to ${guest.id}`,
	);
	expect(res.status(), `${person.who.email} answers ${guest.id}`).toBe(200);
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

/** A newly joined agent of `officeId`, signed up through the invitation link, on their Inbox. */
async function newAgentOf(admin: Admin, browser: Browser, officeId: string) {
	const email = admin.newEmail("pool-newcomer");
	const invitationId = await admin.invite(email, officeId);
	const context = await browser.newContext({ extraHTTPHeaders: clientIpHeaders("newcomer") });
	const page = await context.newPage();
	await signUpByInvitationLink(page, invitationId, email);
	await openInboxAsNewAccount(page);
	return { page, api: withOrigin(context.request), close: () => context.close() };
}

// ---------------------------------------------------------------------------------------

// scenario: docs/e2e-scenarios.md Pool then owner 1
test.describe("Pool 1 — a new guest lands in the pool", () => {
	test("a guest writing for the first time is in both agents' Inboxes and the manager's, marked Pool", async ({
		newGuest,
		signedIn,
	}) => {
		const guest = await newGuest();

		for (const who of [AGENT, AGENT_2, MANAGER]) {
			const { page } = await signedIn(who);
			await openInbox(page);
			// A new guest is waiting: in the Your turn queue the Inbox opens on.
			const row = rowOf(page, guest);
			await expect(row, `${who.email} has the new guest in Your turn`).toBeVisible();
			await expectOwner(row, "pool", `${who.email} sees it in the pool`);
			await row.click();
			await expectOwner(openThread(page), "pool", `the thread's header says Pool`);
		}
	});
});

// scenario: docs/e2e-scenarios.md Pool then owner 2
test.describe("Pool 2 — the first agent to answer owns it", () => {
	test("agent 1 approves a reply on a pool thread: it stays in their Inbox as Yours, and leaves agent 2's Inbox, counts, search and API (404)", async ({
		newGuest,
		signedIn,
	}) => {
		const guest = await newGuest();
		const one = await signedIn(AGENT);
		const two = await signedIn(AGENT_2);
		// Before: both agents have it, in the pool.
		const thread = await threadSeenBy(two.api, guest);
		await expectHas(two, guest, "pool");

		// Agent 1 answers it in Nhịp.
		await openInbox(one.page);
		await rowOf(one.page, guest).click();
		const reply = `Reply to ${guest.id}`;
		await one.page.getByRole("textbox", { name: "Reply" }).fill(reply);
		const sent = one.page.waitForResponse((r) => r.url().endsWith("/approve"));
		await one.page.getByTestId("approve-and-send").click();
		expect((await sent).status(), "the reply is sent").toBe(200);

		// It stays in agent 1's Inbox (reloaded), shown as theirs, in the list and the thread.
		await expectHas(one, guest, "mine");
		await rowOf(one.page, guest).click();
		await expectOwner(openThread(one.page), "mine", "the open thread is agent 1's");

		// For agent 2 it no longer exists.
		await expectHasNot(two, guest, thread.id);
	});
});

// scenario: docs/e2e-scenarios.md Pool then owner 3
test.describe("Pool 3 — two agents answering at once end with one owner", () => {
	test("both agents approve the same pool thread at the same moment: one reply is sent, and the thread is its sender's", async ({
		newGuest,
		signedIn,
	}) => {
		const guest = await newGuest();
		const one = await signedIn(AGENT);
		const two = await signedIn(AGENT_2);
		const manager = await signedIn(MANAGER);
		const replies = new Map([
			[one, `Agent 1's reply to ${guest.id}`],
			[two, `Agent 2's reply to ${guest.id}`],
		]);
		const [threadOne, threadTwo] = [
			await threadSeenBy(one.api, guest),
			await threadSeenBy(two.api, guest),
		];

		const [fromOne, fromTwo] = await Promise.all([
			approve(one.api, threadOne, replies.get(one)!),
			approve(two.api, threadTwo, replies.get(two)!),
		]);

		const statuses = [fromOne.status(), fromTwo.status()];
		expect(
			statuses.filter((s) => s === 200),
			`exactly one approval is sent (answers: ${statuses.join(", ")})`,
		).toHaveLength(1);
		const [winner, loser] = fromOne.status() === 200 ? [one, two] : [two, one];
		const winnerName = winner === one ? NAME.agent : NAME.agent2;

		// The manager sees one reply, the sender's, and the thread is the sender's.
		await expectHas(manager, guest, { other: winnerName });
		await rowOf(manager.page, guest).click();
		const thread = openThread(manager.page);
		await expectOwner(thread, { other: winnerName }, "the thread belongs to whoever sent");
		await expect(thread.getByText(replies.get(winner)!, { exact: true })).toHaveCount(1);
		await expect(thread.getByText(replies.get(loser)!, { exact: true })).toHaveCount(0);

		// The sender has it as theirs; for the other agent it is gone.
		await expectHas(winner, guest, "mine");
		await expectHasNot(loser, guest, threadOne.id);
	});
});

// scenario: docs/e2e-scenarios.md Pool then owner 4
test.describe("Pool 4 — the guest's next message goes to the owner", () => {
	test("the guest writes again on agent 1's thread: it is Your turn for agent 1, and agent 2 still does not see it", async ({
		newGuest,
		signedIn,
	}) => {
		const guest = await newGuest();
		const one = await signedIn(AGENT);
		const two = await signedIn(AGENT_2);
		const { id: threadId } = await threadSeenBy(two.api, guest);
		await answerAs(one, guest);

		const next = await guest.write(`Is it still available? ${guest.id}`);

		// Agent 1: back in Your turn, theirs, with the new message.
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

// scenario: docs/e2e-scenarios.md Pool then owner 5
test.describe("Pool 5 — the manager sees every thread and reassigns", () => {
	test("the manager sees pool threads and each agent's threads with their owner", async ({
		newGuest,
		signedIn,
	}) => {
		const inPool = await newGuest();
		const agentOnes = await newGuest();
		const one = await signedIn(AGENT);
		const manager = await signedIn(MANAGER);
		await answerAs(one, agentOnes);

		await expectHas(manager, inPool, "pool");
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

	test("reassigning agent 1's thread to agent 2 moves it; returning it to the pool shows it to both agents again", async ({
		newGuest,
		signedIn,
	}) => {
		const guest = await newGuest();
		const one = await signedIn(AGENT);
		const two = await signedIn(AGENT_2);
		const manager = await signedIn(MANAGER);
		const { id: threadId } = await threadSeenBy(manager.api, guest);
		await answerAs(one, guest);

		// The manager gives it to agent 2, from the thread's header.
		await expectHas(manager, guest, { other: NAME.agent });
		await rowOf(manager.page, guest).click();
		const header = openThread(manager.page);
		const ownerSelect = header.getByTestId("thread-owner-select");
		await expect(ownerSelect).toBeVisible();
		const toTwo = manager.page.waitForResponse((r) => r.url().endsWith("/owner"));
		await ownerSelect.selectOption({ label: NAME.agent2 });
		expect((await toTwo).status(), "the reassignment is saved").toBe(200);
		await expectOwner(header, { other: NAME.agent2 });

		await expectHas(two, guest, "mine");
		await expectHasNot(one, guest, threadId);

		// Back to the pool: both agents have it again.
		const toPool = manager.page.waitForResponse((r) => r.url().endsWith("/owner"));
		await ownerSelect.selectOption({ label: copy.pool });
		expect((await toPool).status(), "the return to the pool is saved").toBe(200);
		await expectOwner(header, "pool");

		await expectHas(one, guest, "pool");
		await expectHas(two, guest, "pool");
	});
});

// scenario: docs/e2e-scenarios.md Pool then owner 6
test.describe("Pool 6 — a reply from the vendor's own app claims nothing", () => {
	test("a reply sent from the Zalo app shows in the thread, and the thread stays in the pool for anyone to answer", async ({
		newGuest,
		signedIn,
	}) => {
		const guest = await newGuest();
		const one = await signedIn(AGENT);
		const two = await signedIn(AGENT_2);
		const manager = await signedIn(MANAGER);
		const { id: threadId } = await threadSeenBy(manager.api, guest);

		const fromZaloApp = `Sent from the Zalo app to ${guest.id}`;
		await guest.echoFromZaloApp(fromZaloApp);

		for (const person of [one, two, manager]) {
			await expectHas(person, guest, "pool");
			await rowOf(person.page, guest).click();
			const thread = openThread(person.page);
			// The office's reply is in the thread: the echo arrived; it claimed nothing.
			await expect(thread.getByText(fromZaloApp, { exact: true })).toBeVisible();
			await expectOwner(thread, "pool", `${person.who.email} sees it still in the pool`);
		}

		// Still unclaimed: when the guest writes again, the agent who answers in Nhịp owns it.
		await guest.write(`One more question, ${guest.id}`);
		await answerAs(two, guest);
		await expectHas(two, guest, "mine");
		await expectHasNot(one, guest, threadId);
	});
});

// scenario: docs/e2e-scenarios.md Pool then owner 7
test.describe("Pool 7 — the manager filters by owner", () => {
	test("the Inbox filter shows all threads, only the pool, or only one operator's threads", async ({
		newGuest,
		signedIn,
	}) => {
		const inPool = await newGuest();
		const agentOnes = await newGuest();
		const agentTwos = await newGuest();
		const one = await signedIn(AGENT);
		const two = await signedIn(AGENT_2);
		const { page } = await signedIn(MANAGER);
		await answerAs(one, agentOnes);
		await answerAs(two, agentTwos);

		await openInbox(page);
		await showAll(page);
		const filter = page.getByTestId("owner-filter");
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
		await expectListed([inPool, agentOnes, agentTwos, "Minji", "Yuki"], []);

		await filter.selectOption({ label: copy.pool });
		await expectListed([inPool], [agentOnes, agentTwos, "Minji", "Yuki"]);
		await expect(flags.filter({ hasNotText: new RegExp(`^${copy.pool}$`) })).toHaveCount(0);

		await filter.selectOption({ label: NAME.agent });
		await expectListed([agentOnes, "Minji"], [inPool, agentTwos, "Yuki"]);
		await expect(flags.filter({ hasNotText: new RegExp(`^${NAME.agent}$`) })).toHaveCount(0);

		await filter.selectOption({ label: NAME.agent2 });
		await expectListed([agentTwos, "Yuki"], [inPool, agentOnes, "Minji"]);
		await expect(flags.filter({ hasNotText: new RegExp(`^${NAME.agent2}$`) })).toHaveCount(0);

		await filter.selectOption({ label: "All threads" });
		await expectListed([inPool, agentOnes, agentTwos, "Minji", "Yuki"], []);
	});
});

// scenario: docs/e2e-scenarios.md Pool then owner 8
test.describe("Pool 8 — a new agent's first day", () => {
	test("an agent who just joined the walk office sees the pool and nothing of anyone else's", async ({
		admin,
		browser,
		newGuest,
	}) => {
		const inPool = await newGuest();
		const newcomer = await newAgentOf(admin, browser, WALK_OFFICE_ID);
		try {
			const { page } = newcomer;
			await showAll(page);
			await expect(rowOf(page, inPool), "the pool is theirs to answer").toBeVisible();
			await expectOwner(rowOf(page, inPool), "pool");
			// The seed's agents' threads are not theirs to see.
			await expect(rowOf(page, "Minji")).toHaveCount(0);
			await expect(rowOf(page, "Yuki")).toHaveCount(0);
			await expect(
				threadList(page)
					.getByTestId("thread-owner")
					.filter({ hasNotText: new RegExp(`^${copy.pool}$`) }),
				"every thread they see is in the pool",
			).toHaveCount(0);
		} finally {
			await newcomer.close();
		}
	});

	test("with nothing in the pool, the new agent's Inbox says guests waiting for anyone appear there", async ({
		admin,
		browser,
	}) => {
		// An office of its own: no guest has written to it yet.
		const office = await admin.createOffice("Pool 8");
		const newcomer = await newAgentOf(admin, browser, office.id);
		try {
			await expect(newcomer.page.getByTestId("inbox-empty")).toHaveText(copy.emptyPool);
			await expect(threadList(newcomer.page).getByTestId("thread-owner")).toHaveCount(0);
			const listed = await newcomer.api.get("/api/conversations");
			expect(listed.status()).toBe(200);
			expect(await listed.json(), "nothing is listed for them").toEqual([]);
		} finally {
			await newcomer.close();
		}
	});
});

// scenario: docs/e2e-scenarios.md Pool then owner 9
test.describe("Pool 9 — an agent cannot reassign", () => {
	test("an agent's thread has no Owner control; the manager's has one", async ({
		newGuest,
		signedIn,
	}) => {
		const guest = await newGuest();
		const one = await signedIn(AGENT);
		const manager = await signedIn(MANAGER);
		await answerAs(one, guest);

		await expectHas(one, guest, "mine");
		await rowOf(one.page, guest).click();
		const thread = openThread(one.page);
		await expectOwner(thread, "mine");
		await expect(thread.getByTestId("thread-owner-select")).toHaveCount(0);
		await expect(one.page.getByRole("combobox", { name: "Owner" })).toHaveCount(0);
		await expect(one.page.getByTestId("owner-filter"), "no owner filter either").toHaveCount(0);

		// The same thread, as the manager: the control is there.
		await expectHas(manager, guest, { other: NAME.agent });
		await rowOf(manager.page, guest).click();
		await expect(openThread(manager.page).getByTestId("thread-owner-select")).toBeVisible();
	});

	test("the reassign API refuses an agent (403), for their own thread and for a pool thread, and nothing moves", async ({
		newGuest,
		signedIn,
	}) => {
		const theirs = await newGuest();
		const inPool = await newGuest();
		const one = await signedIn(AGENT);
		const two = await signedIn(AGENT_2);
		const manager = await signedIn(MANAGER);
		const { id: theirsId } = await threadSeenBy(two.api, theirs);
		const { id: poolId } = await threadSeenBy(two.api, inPool);
		await answerAs(one, theirs);
		const [oneId, twoId] = [
			await operatorId(manager, NAME.agent),
			await operatorId(manager, NAME.agent2),
		];

		const reassign = (person: Person, threadId: string, ownerId: string | null) =>
			person.api.post(`${threadAddress(threadId)}/owner`, { ownerId });
		expect((await reassign(one, theirsId, twoId)).status(), "handing it on").toBe(403);
		expect((await reassign(one, theirsId, null)).status(), "returning it to the pool").toBe(403);
		expect((await reassign(two, poolId, twoId)).status(), "taking a pool thread").toBe(403);
		expect((await reassign(one, poolId, oneId)).status(), "taking a pool thread").toBe(403);

		// Nothing moved.
		await expectHas(one, theirs, "mine");
		await expectHasNot(two, theirs, theirsId);
		await expectHas(two, inPool, "pool");
		await expectHas(one, inPool, "pool");
	});
});
