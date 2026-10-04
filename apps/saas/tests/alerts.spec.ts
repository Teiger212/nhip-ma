import { randomUUID } from "node:crypto";

import type { APIRequestContext, Browser, Page } from "@playwright/test";

import type { AlertRow } from "./support/alerts";
import { alertState } from "./support/alerts";
import type { Admin } from "./support/fixtures";
import { expect, test as base } from "./support/fixtures";
import { openInboxAsNewAccount, signUpByInvitationLink } from "./support/invitee";
import { connectZaloOa, releaseZaloOa } from "./support/pipes";
import { PLATFORM_ADMIN } from "./support/seed";
import type { Api } from "./support/session";
import { clientIpHeaders, withOrigin } from "./support/session";
import { deliverZalo, sendZaloText, signedZaloText } from "./support/zalo";

/**
 * Alerts are decided after the webhook has answered (ADR 0019: in the background), and reading
 * the log runs tsx (a second or two), so every look at it polls.
 */
const ON_THE_PHONES = { timeout: 30_000, intervals: [1_000, 2_000] };

/** An operator of the test's office, signed in in a browser of their own, on their Inbox. */
type Operator = {
	/** How the test speaks of them ("agent 1"). */
	label: string;
	/** Their account's id, as their own session tells it. */
	id: string;
	page: Page;
	api: Api;
};

/** A guest of this test, writing on Zalo to the office's OA. */
type Guest = {
	/** Zalo's id for the guest; a nameless Zalo guest is listed by it. */
	id: string;
	/** The guest writes; resolves with the text. */
	write: (text?: string) => Promise<string>;
	/** One message, delivered by Zalo twice: the same signed body, the same message id. */
	writeDeliveredTwice: (text: string) => Promise<void>;
};

/**
 * An office of the test's own (the platform admin creates it, so the admin is its kit `owner`),
 * with a Zalo OA of its own and two agents and a manager who joined it through their invitation
 * links. Recipients are exact: no other spec writes to it.
 */
type AlertOffice = {
	id: string;
	agent1: Operator;
	agent2: Operator;
	manager: Operator;
	/** The platform admin's account id. */
	platformAdminId: string;
	/** A guest who has not written yet. */
	newGuest: () => Guest;
};

const test = base.extend<{ newOffice: () => Promise<AlertOffice> }>({
	newOffice: async ({ admin, browser, request }, use) => {
		const oaIds: string[] = [];
		const contexts: { close: () => Promise<void> }[] = [];
		await use(async () => {
			const office = await admin.createOffice("Alerts");
			const oaId = uniqueId("oa");
			oaIds.push(oaId);
			connectZaloOa(office.id, oaId);
			const join = async (label: string, role: "member" | "admin") => {
				const operator = await newOperatorOf(admin, browser, office.id, label, role);
				contexts.push(operator);
				return operator;
			};
			return {
				id: office.id,
				agent1: await join("agent 1", "member"),
				agent2: await join("agent 2", "member"),
				manager: await join("manager", "admin"),
				platformAdminId: await ownId(admin.api),
				newGuest: () => newGuestOf(request, oaId),
			};
		});
		for (const context of contexts) {
			await context.close();
		}
		for (const oaId of oaIds) {
			releaseZaloOa(oaId);
		}
	},
});

/** A vendor id (OA, guest, message) no other test, repeat or earlier run uses. */
function uniqueId(kind: string): string {
	return `e2e-alerts-${kind}-${randomUUID()}`;
}

function newGuestOf(request: APIRequestContext, oaId: string): Guest {
	const id = uniqueId("guest");
	return {
		id,
		write: async (text = `Hello from ${id}, ${randomUUID().slice(0, 8)}`) => {
			await sendZaloText(request, { guestId: id, oaId, text });
			return text;
		},
		writeDeliveredTwice: async (text) => {
			const delivery = signedZaloText({ guestId: id, oaId, text, msgId: uniqueId("msg") });
			await deliverZalo(request, delivery);
			await deliverZalo(request, delivery);
		},
	};
}

/**
 * A newly joined operator of `officeId`, signed up through the invitation link, on their Inbox:
 * an agent (the kit's `member`) or a manager (the kit's `admin`).
 */
async function newOperatorOf(
	admin: Admin,
	browser: Browser,
	officeId: string,
	label: string,
	role: "member" | "admin",
): Promise<Operator & { close: () => Promise<void> }> {
	const email = admin.newEmail(role === "admin" ? "alerts-manager" : "alerts-agent");
	const invitationId = await admin.invite(email, officeId, role);
	const context = await browser.newContext({ extraHTTPHeaders: clientIpHeaders(email) });
	const page = await context.newPage();
	await signUpByInvitationLink(page, invitationId, email);
	await openInboxAsNewAccount(page);
	const api = withOrigin(context.request);
	return { label, id: await ownId(api), page, api, close: () => context.close() };
}

/** The kit's session, as the signed-in person's own browser reads it. */
type SessionUser = { id: string; locale?: string | null };

async function sessionUser(api: Api): Promise<SessionUser> {
	const res = await api.get("/api/auth/get-session");
	expect(res.status(), "the session is readable").toBe(200);
	const session = (await res.json()) as { user: SessionUser } | null;
	expect(session?.user, "someone is signed in").toBeTruthy();
	return session!.user;
}

async function ownId(api: Api): Promise<string> {
	return (await sessionUser(api)).id;
}

/** The operator sets their language, through the kit's own user update (setup). */
async function setLocale(operator: Operator, locale: "en") {
	const res = await operator.api.post("/api/auth/update-user", { locale });
	expect(res.ok(), `${operator.label} sets their language (${res.status()})`).toBe(true);
	expect((await sessionUser(operator.api)).locale, `${operator.label} is in English`).toBe(locale);
}

/* ---------------------------------------------------------------- the thread */

type ListedThread = { id: string; guestId: string; unansweredInboundId: string | null };

/** The guest's thread as this operator's conversations API lists it, once it is there. */
async function threadSeenBy(operator: Operator, guest: Guest): Promise<ListedThread> {
	let thread: ListedThread | undefined;
	await expect(async () => {
		const res = await operator.api.get("/api/conversations");
		expect(res.status()).toBe(200);
		thread = ((await res.json()) as ListedThread[]).find((t) => t.guestId === guest.id);
		expect(thread, `${operator.label} lists ${guest.id}`).toBeDefined();
	}).toPass({ timeout: 10_000 });
	return thread!;
}

/** The operator answers the guest's waiting message in Nhịp, which claims a pool thread. */
async function answer(operator: Operator, guest: Guest) {
	const thread = await threadSeenBy(operator, guest);
	expect(thread.unansweredInboundId, "the guest is waiting on a reply").toBeTruthy();
	const res = await operator.api.post(
		`/api/conversations/${encodeURIComponent(thread.id)}/approve`,
		{
			inboundId: thread.unansweredInboundId,
			reply: `Reply to ${guest.id}`,
		},
	);
	expect(res.status(), `${operator.label} answers ${guest.id}`).toBe(200);
}

/* ---------------------------------------------------------------- the operators' phones */

/** Whose phone an alert went to, as the test speaks of them. */
function whose(office: AlertOffice, userId: string): string {
	if (userId === office.platformAdminId) return "platform admin";
	const operator = [office.agent1, office.agent2, office.manager].find((o) => o.id === userId);
	return operator?.label ?? `someone else (${userId})`;
}

/** The office's alerts on one thread. */
function alertsOn(office: AlertOffice, threadId: string): AlertRow[] {
	return alertState.alerts(office.id).filter((row) => row.conversationId === threadId);
}

/** How many alerts each person has on the thread. */
function countsOn(office: AlertOffice, threadId: string): Record<string, number> {
	const counts: Record<string, number> = {};
	for (const row of alertsOn(office, threadId)) {
		const who = whose(office, row.userId);
		counts[who] = (counts[who] ?? 0) + 1;
	}
	return counts;
}

/** Each of agent 1, agent 2 and the manager has this many alerts on the thread, nobody else any. */
function everyOperator(count: number): Record<string, number> {
	return { "agent 1": count, "agent 2": count, manager: count };
}

/**
 * A later guest writes and their alerts reach the three operators: whatever the earlier
 * messages were going to write has had its time. Absences are judged after this.
 */
async function laterGuestArrives(office: AlertOffice) {
	const later = office.newGuest();
	await later.write();
	const { id: threadId } = await threadSeenBy(office.manager, later);
	await expect
		.poll(() => countsOn(office, threadId), {
			...ON_THE_PHONES,
			message: "a later pool guest alerts the three operators",
		})
		.toEqual(everyOperator(1));
}

// ---------------------------------------------------------------------------------------

// scenario: docs/e2e-scenarios.md Alerts 1, 2, 5, 6, 7 (ADR 0019, #132)
test.describe("Alerts — who a guest's message alerts, decided and logged", () => {
	test.describe.configure({ timeout: 180_000 });

	// scenario: docs/e2e-scenarios.md Alerts 1
	test("a pool guest alerts every agent and manager, each in their own language, and no one else", async ({
		newOffice,
	}) => {
		const office = await newOffice();
		// Agent 1 is in English; agent 2 and the manager never chose a language.
		await setLocale(office.agent1, "en");
		for (const operator of [office.agent2, office.manager]) {
			expect(
				(await sessionUser(operator.api)).locale ?? null,
				`${operator.label} has no language set`,
			).toBeNull();
		}

		const guest = office.newGuest();
		await guest.write();
		const { id: threadId } = await threadSeenBy(office.agent1, guest);

		await expect
			.poll(() => countsOn(office, threadId), {
				...ON_THE_PHONES,
				message: "the pool guest alerts agent 1, agent 2 and the manager, once each",
			})
			.toEqual(everyOperator(1));
		await laterGuestArrives(office);

		const alerts = alertsOn(office, threadId);
		expect(
			alerts.map((row) => whose(office, row.userId)).sort(),
			"one alert each for agent 1, agent 2 and the manager, and none for anyone else",
		).toEqual(["agent 1", "agent 2", "manager"]);
		for (const row of alerts) {
			const who = whose(office, row.userId);
			expect(row.kind, `${who}'s alert is a guest's message`).toBe("guest");
			expect(row.sounded, `${who}'s alert sounds`).toBe(true);
			const locale = who === "agent 1" ? "en" : "vi";
			expect(row.link, `${who}'s alert opens the Inbox in their language`).toMatch(
				new RegExp(`^/${locale}/inbox\\?alert=`),
			);
			expect(row.link.endsWith(row.id), `${who}'s link carries the alert's own id`).toBe(true);
			expect(row.link, `${who}'s link carries no thread id`).not.toContain(threadId);
			expect(row.link, `${who}'s link names no guest`).not.toContain(guest.id);
		}
	});

	// scenario: docs/e2e-scenarios.md Alerts 2
	test("an owned thread's guest alerts only its owner", async ({ newOffice }) => {
		const office = await newOffice();
		const guest = office.newGuest();
		await guest.write();
		const { id: threadId } = await threadSeenBy(office.agent1, guest);
		await expect
			.poll(() => countsOn(office, threadId), {
				...ON_THE_PHONES,
				message: "the pool guest's first message alerts the three operators",
			})
			.toEqual(everyOperator(1));

		await answer(office.agent1, guest);
		await guest.write(`Is it still available? ${guest.id}`);

		// One new alert, agent 1's (within two minutes of the first, so it may not sound).
		await expect
			.poll(() => countsOn(office, threadId), {
				...ON_THE_PHONES,
				message: "the guest writing again on agent 1's thread alerts agent 1",
			})
			.toEqual({ "agent 1": 2, "agent 2": 1, manager: 1 });
		await laterGuestArrives(office);
		expect(
			countsOn(office, threadId),
			"agent 2 and the manager got nothing for the owned thread's message",
		).toEqual({ "agent 1": 2, "agent 2": 1, manager: 1 });
		expect(
			alertsOn(office, threadId).every((row) => row.kind === "guest"),
			"every alert on the thread is a guest's message",
		).toBe(true);
	});

	// scenario: docs/e2e-scenarios.md Alerts 5
	test("a vendor retry alerts no one: the same signed Zalo message twice is one message and one alert each", async ({
		newOffice,
	}) => {
		const office = await newOffice();
		const guest = office.newGuest();
		const text = `Only once, ${guest.id}`;
		await guest.writeDeliveredTwice(text);
		const { id: threadId } = await threadSeenBy(office.agent1, guest);

		await expect
			.poll(() => countsOn(office, threadId), {
				...ON_THE_PHONES,
				message: "the guest's message alerts the three operators",
			})
			.toEqual(everyOperator(1));
		await laterGuestArrives(office);
		expect(countsOn(office, threadId), "one alert per operator, not two").toEqual(everyOperator(1));

		// Agent 1 opens the thread: the message is in it once.
		const { page } = office.agent1;
		await page.goto("/en/inbox");
		const row = page
			.getByRole("complementary")
			.getByRole("button", { name: new RegExp(`^${guest.id}\\b`) });
		await expect(row, "agent 1 has the guest's thread").toBeVisible();
		await row.click();
		await expect(
			page.getByRole("article").getByText(text, { exact: true }),
			"the thread holds the message once",
		).toHaveCount(1);
	});

	// scenario: docs/e2e-scenarios.md Alerts 6
	test("a burst makes one sounding alert per operator; the rest are silent replacements", async ({
		newOffice,
	}) => {
		const office = await newOffice();
		const guest = office.newGuest();
		const started = Date.now();
		await guest.write(`One, ${guest.id}`);
		const { id: threadId } = await threadSeenBy(office.agent1, guest);
		await guest.write(`Two, ${guest.id}`);
		await guest.write(`Three, ${guest.id}`);
		// Two at the same moment.
		await Promise.all([guest.write(`Four, ${guest.id}`), guest.write(`Five, ${guest.id}`)]);
		expect(Date.now() - started, "five messages within 20 seconds").toBeLessThan(20_000);

		await expect
			.poll(() => countsOn(office, threadId), {
				...ON_THE_PHONES,
				message: "each of the five messages alerts the three operators",
			})
			.toEqual(everyOperator(5));
		await laterGuestArrives(office);

		const sounding: Record<string, number> = {};
		for (const row of alertsOn(office, threadId)) {
			const who = whose(office, row.userId);
			sounding[who] = (sounding[who] ?? 0) + (row.sounded ? 1 : 0);
		}
		expect(sounding, "exactly one sounding alert each on the thread").toEqual(everyOperator(1));
		expect(countsOn(office, threadId), "nothing more arrived").toEqual(everyOperator(5));
	});

	// scenario: docs/e2e-scenarios.md Alerts 7
	test("the platform admin, the office's owner, is never alerted", async ({ admin, newOffice }) => {
		const office = await newOffice();
		// The platform admin made the office, so the kit holds them as a member (its owner).
		expect(await admin.memberEmails(office.id)).toContain(PLATFORM_ADMIN.email);

		const guest = office.newGuest();
		await guest.write();
		const { id: threadId } = await threadSeenBy(office.agent1, guest);
		await expect
			.poll(() => countsOn(office, threadId), {
				...ON_THE_PHONES,
				message: "the pool guest alerts the agents and the manager",
			})
			.toEqual(everyOperator(1));

		await answer(office.agent1, guest);
		await guest.write(`One more thing, ${guest.id}`);
		await expect
			.poll(() => countsOn(office, threadId), {
				...ON_THE_PHONES,
				message: "the guest writing again on agent 1's thread alerts agent 1",
			})
			.toEqual({ "agent 1": 2, "agent 2": 1, manager: 1 });
		await laterGuestArrives(office);

		expect(
			alertState.alerts(office.id).filter((row) => row.userId === office.platformAdminId),
			"the platform admin has no alert in the office",
		).toEqual([]);
	});
});
