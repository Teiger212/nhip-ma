import { createECDH, randomBytes, randomUUID } from "node:crypto";

import type {
	APIRequestContext,
	APIResponse,
	Browser,
	BrowserContext,
	Page,
} from "@playwright/test";

import type { AlertRow } from "./support/alerts";
import { alertState } from "./support/alerts";
import { assignerAs } from "./support/assign";
import type { Admin } from "./support/fixtures";
import { expect, test as base } from "./support/fixtures";
import { LoginPage } from "./support/login-page";
import type { Joined } from "./support/operators";
import { joinOffice } from "./support/operators";
import { connectZaloOa, releaseZaloOa } from "./support/pipes";
import { NEW_PASSWORD, PLATFORM_ADMIN } from "./support/seed";
import type { Api } from "./support/session";
import { appOrigin, clientIpHeaders, withOrigin } from "./support/session";
import { deliverZalo, sendZaloText, signedZaloText } from "./support/zalo";

/**
 * Alerts are decided after the webhook has answered (ADR 0019: in the background), so every
 * look at the log polls: at Playwright's default intervals, since a read is one query (#203).
 */
const ON_THE_PHONES = { timeout: 30_000 };

/** An operator of the test's office, signed in in a browser of their own. */
type Operator = {
	/** How the test speaks of them ("agent 1", "manager 2"). */
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
 * with a Zalo OA of its own, two agents and one or two managers (the kit's `admin`) who accepted
 * their invitations into it. Recipients are exact: no other spec writes to it.
 */
type AlertOffice = {
	id: string;
	agent1: Operator;
	agent2: Operator;
	/** Manager 1, who assigns. */
	manager: Operator;
	managers: Operator[];
	/** The platform admin's account id. */
	platformAdminId: string;
	/** A guest who has not written yet. */
	newGuest: () => Guest;
	/** The manager gives the guest's thread to the agent, through the owner API (setup). */
	assign: (guest: Guest, agent: Operator) => Promise<void>;
};

const test = base.extend<{ newOffice: (options?: { managers?: 1 | 2 }) => Promise<AlertOffice> }>({
	newOffice: async ({ admin, browser, request }, use) => {
		const oaIds: string[] = [];
		const contexts: Joined[] = [];
		await use(async ({ managers = 1 } = {}) => {
			const office = await admin.createOffice("Alerts");
			const oaId = uniqueId("oa");
			oaIds.push(oaId);
			await connectZaloOa(office.id, oaId);
			const join = async (label: string, role: "member" | "admin"): Promise<Operator> => {
				const joined = await joinOffice(
					admin,
					browser,
					office.id,
					role,
					role === "admin" ? "alerts-manager" : "alerts-agent",
				);
				contexts.push(joined);
				return { label, id: joined.userId, page: joined.page, api: joined.api };
			};
			// Everyone joins at once (setup); each keeps their place in the list.
			const [agent1, agent2, ...joinedManagers] = await Promise.all([
				join("agent 1", "member"),
				join("agent 2", "member"),
				join("manager 1", "admin"),
				...(managers === 2 ? [join("manager 2", "admin")] : []),
			]);
			const assigner = assignerAs(joinedManagers[0].api);
			return {
				id: office.id,
				agent1,
				agent2,
				manager: joinedManagers[0],
				managers: joinedManagers,
				platformAdminId: await ownId(admin.api),
				newGuest: () => newGuestOf(request, oaId),
				assign: (guest, agent) => assigner.assignGuestTo(guest.id, agent.id),
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
 * A newly joined operator of `officeId`: an agent (the kit's `member`) or a
 * manager (the kit's `admin`).
 */
async function newOperatorOf(
	admin: Admin,
	browser: Browser,
	officeId: string,
	label: string,
	role: "member" | "admin",
): Promise<Operator & { email: string; close: () => Promise<void> }> {
	const joined = await joinOffice(
		admin,
		browser,
		officeId,
		role,
		role === "admin" ? "alerts-manager" : "alerts-agent",
	);
	return { label, ...joined, id: await ownId(joined.api) };
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

type ListedThread = { id: string; guestId: string };

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

/* ---------------------------------------------------------------- the operators' phones */

/** Whose phone an alert went to, as the test speaks of them. */
function whose(office: AlertOffice, userId: string): string {
	if (userId === office.platformAdminId) return "platform admin";
	const operator = [office.agent1, office.agent2, ...office.managers].find((o) => o.id === userId);
	return operator?.label ?? `someone else (${userId})`;
}

/** The office's alerts on one thread, of every kind. */
async function alertsOn(office: AlertOffice, threadId: string): Promise<AlertRow[]> {
	return (await alertState.alerts(office.id)).filter((row) => row.conversationId === threadId);
}

/** The office's alerts for a guest's message on one thread (not an assignment's, #133). */
async function guestAlertsOn(office: AlertOffice, threadId: string): Promise<AlertRow[]> {
	return (await alertsOn(office, threadId)).filter((row) => row.kind === "guest");
}

/** How many guest alerts each person has on the thread. */
async function countsOn(office: AlertOffice, threadId: string): Promise<Record<string, number>> {
	const counts: Record<string, number> = {};
	for (const row of await guestAlertsOn(office, threadId)) {
		const who = whose(office, row.userId);
		counts[who] = (counts[who] ?? 0) + 1;
	}
	return counts;
}

/** Each of the office's managers has this many guest alerts on the thread, nobody else any. */
function everyManager(office: AlertOffice, count: number): Record<string, number> {
	return Object.fromEntries(office.managers.map((m) => [m.label, count]));
}

/**
 * A later guest writes and their alerts reach the managers: whatever the earlier messages were
 * going to write has had its time. Absences are judged after this.
 */
async function laterGuestArrives(office: AlertOffice) {
	const later = office.newGuest();
	await later.write();
	const { id: threadId } = await threadSeenBy(office.manager, later);
	await expect
		.poll(() => countsOn(office, threadId), {
			...ON_THE_PHONES,
			message: "a later Unassigned guest alerts the managers",
		})
		.toEqual(everyManager(office, 1));
}

// ---------------------------------------------------------------------------------------

// scenario: docs/e2e-scenarios.md Alerts 1, 2, 5, 6, 7 (ADR 0019, ADR 0022, #132)
test.describe("Alerts — who a guest's message alerts, decided and logged", () => {
	test.describe.configure({ timeout: 180_000 });

	// scenario: docs/e2e-scenarios.md Alerts 1
	test(
		"a new guest alerts the managers only, each in their own language, and no agent or anyone else",
		{ tag: "@core" },
		async ({ newOffice }) => {
			test.setTimeout(240_000);
			const office = await newOffice({ managers: 2 });
			const [first, second] = office.managers;
			// Manager 1 is in English; manager 2 never chose a language.
			await setLocale(first, "en");
			expect(
				(await sessionUser(second.api)).locale ?? null,
				`${second.label} has no language set`,
			).toBeNull();

			const guest = office.newGuest();
			await guest.write();
			const { id: threadId } = await threadSeenBy(first, guest);

			await expect
				.poll(() => countsOn(office, threadId), {
					...ON_THE_PHONES,
					message: "the new guest alerts manager 1 and manager 2, once each, and no agent",
				})
				.toEqual(everyManager(office, 1));
			await laterGuestArrives(office);

			const alerts = await alertsOn(office, threadId);
			expect(
				alerts.map((row) => whose(office, row.userId)).sort(),
				"one alert each for the two managers, and none for either agent or anyone else",
			).toEqual(["manager 1", "manager 2"]);
			for (const row of alerts) {
				const who = whose(office, row.userId);
				expect(row.kind, `${who}'s alert is a guest's message`).toBe("guest");
				expect(row.sounded, `${who}'s alert sounds`).toBe(true);
				const locale = who === first.label ? "en" : "vi";
				expect(row.link, `${who}'s alert opens the Inbox in their language`).toMatch(
					new RegExp(`^/${locale}/inbox\\?alert=`),
				);
				expect(row.link.endsWith(row.id), `${who}'s link carries the alert's own id`).toBe(true);
				expect(row.link, `${who}'s link carries no thread id`).not.toContain(threadId);
				expect(row.link, `${who}'s link names no guest`).not.toContain(guest.id);
			}
		},
	);

	// scenario: docs/e2e-scenarios.md Alerts 2
	test("an owned thread's guest alerts only its owner", async ({ newOffice }) => {
		const office = await newOffice();
		const guest = office.newGuest();
		await guest.write();
		const { id: threadId } = await threadSeenBy(office.manager, guest);
		await expect
			.poll(() => countsOn(office, threadId), {
				...ON_THE_PHONES,
				message: "the new guest's first message alerts the manager only",
			})
			.toEqual(everyManager(office, 1));

		await office.assign(guest, office.agent1);
		await guest.write(`Is it still available? ${guest.id}`);

		// One new guest alert, agent 1's.
		const after = { "agent 1": 1, ...everyManager(office, 1) };
		await expect
			.poll(() => countsOn(office, threadId), {
				...ON_THE_PHONES,
				message: "the guest writing again on agent 1's thread alerts agent 1",
			})
			.toEqual(after);
		await laterGuestArrives(office);
		expect(
			await countsOn(office, threadId),
			"agent 2 and the manager got nothing for the owned thread's message",
		).toEqual(after);
	});

	// scenario: docs/e2e-scenarios.md Alerts 5
	test("a vendor retry alerts no one: the same signed Zalo message twice is one message and one alert per manager", async ({
		newOffice,
	}) => {
		const office = await newOffice();
		const guest = office.newGuest();
		const text = `Only once, ${guest.id}`;
		await guest.writeDeliveredTwice(text);
		const { id: threadId } = await threadSeenBy(office.manager, guest);

		await expect
			.poll(() => countsOn(office, threadId), {
				...ON_THE_PHONES,
				message: "the guest's message alerts the manager",
			})
			.toEqual(everyManager(office, 1));
		await laterGuestArrives(office);
		expect(await countsOn(office, threadId), "one alert per manager, not two").toEqual(
			everyManager(office, 1),
		);

		// The manager opens the thread: the message is in it once.
		const { page } = office.manager;
		await page.goto("/en/inbox");
		const row = page
			.getByRole("complementary")
			.getByRole("button", { name: new RegExp(`^${guest.id}\\b`) });
		await expect(row, "the manager has the guest's thread").toBeVisible();
		await row.click();
		await expect(
			page.getByRole("article").getByText(text, { exact: true }),
			"the thread holds the message once",
		).toHaveCount(1);
	});

	// scenario: docs/e2e-scenarios.md Alerts 6
	test("a burst makes one sounding alert per manager; the rest are silent replacements", async ({
		newOffice,
	}) => {
		const office = await newOffice();
		const guest = office.newGuest();
		const started = Date.now();
		await guest.write(`One, ${guest.id}`);
		const { id: threadId } = await threadSeenBy(office.manager, guest);
		await guest.write(`Two, ${guest.id}`);
		await guest.write(`Three, ${guest.id}`);
		// Two at the same moment.
		await Promise.all([guest.write(`Four, ${guest.id}`), guest.write(`Five, ${guest.id}`)]);
		expect(Date.now() - started, "five messages within 20 seconds").toBeLessThan(20_000);

		await expect
			.poll(() => countsOn(office, threadId), {
				...ON_THE_PHONES,
				message: "each of the five messages alerts the manager, and no agent",
			})
			.toEqual(everyManager(office, 5));
		await laterGuestArrives(office);

		const sounding: Record<string, number> = {};
		for (const row of await guestAlertsOn(office, threadId)) {
			const who = whose(office, row.userId);
			sounding[who] = (sounding[who] ?? 0) + (row.sounded ? 1 : 0);
		}
		expect(sounding, "exactly one sounding alert on the thread").toEqual(everyManager(office, 1));
		expect(await countsOn(office, threadId), "nothing more arrived").toEqual(
			everyManager(office, 5),
		);
	});

	// scenario: docs/e2e-scenarios.md Alerts 7
	test("the platform admin, the office's owner, is never alerted", async ({ admin, newOffice }) => {
		const office = await newOffice();
		// The platform admin made the office, so the kit holds them as a member (its owner).
		expect(await admin.memberEmails(office.id)).toContain(PLATFORM_ADMIN.email);

		const guest = office.newGuest();
		await guest.write();
		const { id: threadId } = await threadSeenBy(office.manager, guest);
		await expect
			.poll(() => countsOn(office, threadId), {
				...ON_THE_PHONES,
				message: "the new guest alerts the manager",
			})
			.toEqual(everyManager(office, 1));

		await office.assign(guest, office.agent1);
		await guest.write(`One more thing, ${guest.id}`);
		await expect
			.poll(() => countsOn(office, threadId), {
				...ON_THE_PHONES,
				message: "the guest writing again on agent 1's thread alerts agent 1",
			})
			.toEqual({ "agent 1": 1, ...everyManager(office, 1) });
		await laterGuestArrives(office);

		expect(
			(await alertState.alerts(office.id)).filter((row) => row.userId === office.platformAdminId),
			"the platform admin has no alert in the office",
		).toEqual([]);
	});
});

/* ---------------------------------------------------------------- devices */

/**
 * A push subscription as a browser hands it over (docs/e2e-scenarios.md "A device"): an endpoint
 * on an allow-listed push service no other test uses, a real P-256 public key (65 bytes,
 * uncompressed) and a 16-byte auth secret, both base64url.
 */
function newSubscription() {
	const ecdh = createECDH("prime256v1");
	ecdh.generateKeys();
	return {
		endpoint: `https://fcm.googleapis.com/fcm/send/e2e-${randomUUID()}`,
		keys: {
			p256dh: ecdh.getPublicKey().toString("base64url"),
			auth: randomBytes(16).toString("base64url"),
		},
	};
}

/** The operator's browser adds this session's device, through the app's own API. */
async function addDevice(context: BrowserContext, who: string) {
	const res = await withOrigin(context.request).post("/api/alerts/devices", newSubscription());
	expect(res.status(), `${who} adds a device (${res.status()} ${await res.text()})`).toBe(201);
}

/** The browser's `DELETE /api/alerts/devices`, carrying the Origin as the app's own calls do. */
function removeDevices(context: BrowserContext): Promise<APIResponse> {
	return context.request.delete("/api/alerts/devices", { headers: { origin: appOrigin() } });
}

/** The user menu (the ⋯ beside the person's name in the desktop sidebar) → Log out. */
async function logOutThroughUserMenu(page: Page) {
	await page.getByRole("button", { name: "User menu" }).click();
	await page.getByRole("menuitem", { name: "Log out", exact: true }).click();
	await expect(page, "logging out lands on the login page").toHaveURL(/\/en\/login/);
}

// scenario: docs/e2e-scenarios.md Alerts 10 (#134)
test.describe("Alerts 10 — signing out removes the device", () => {
	test.describe.configure({ timeout: 120_000 });

	test("signing out removes the device (Alerts 10): the session that signs out loses its device, the other session keeps its own, and the device API refuses it signed out", async ({
		admin,
		browser,
	}) => {
		// An agent of the test's own: signing out ends the session it uses.
		const office = await admin.createOffice("Alerts 10");
		const agent = await newOperatorOf(admin, browser, office.id, "agent", "member");
		const first = agent.page.context();
		const second = await browser.newContext({
			extraHTTPHeaders: clientIpHeaders(`${agent.email}#2`),
		});
		try {
			// The same agent signs in again in a second browser: a second session of one login.
			const secondPage = await second.newPage();
			const login = new LoginPage(secondPage);
			await login.goto("en");
			await login.signIn(agent.email, NEW_PASSWORD);
			await expect(secondPage, "the second browser signs in to the Inbox").toHaveURL(
				/\/en\/inbox/,
				{ timeout: 15_000 },
			);
			const secondApi = withOrigin(second.request);
			expect(await ownId(secondApi), "both browsers are the same agent").toBe(agent.id);

			// One device from each browser.
			await addDevice(first, "the first browser");
			const afterFirst = await alertState.devices(agent.id);
			expect(afterFirst, "the agent has the first browser's device").toHaveLength(1);
			const firstDevice = afterFirst[0]!.id;

			await addDevice(second, "the second browser");
			const afterSecond = await alertState.devices(agent.id);
			expect(
				afterSecond.map((d) => d.id),
				"the agent has both browsers' devices, the first browser's first",
			).toHaveLength(2);
			expect(afterSecond[0]!.id).toBe(firstDevice);
			const secondDevice = afterSecond[1]!.id;

			// The agent signs out in the first browser, through the user menu.
			await agent.page.goto("/en/inbox");
			await logOutThroughUserMenu(agent.page);
			const firstSession = await first.request.get("/api/auth/get-session");
			expect(firstSession.status(), "the first browser's session is readable").toBe(200);
			expect(await firstSession.json(), "nobody is signed in in the first browser").toBeNull();
			expect(await ownId(secondApi), "the second browser is still signed in").toBe(agent.id);

			await expect
				.poll(async () => (await alertState.devices(agent.id)).map((d) => d.id), {
					timeout: 15_000,
					intervals: [1_000],
					message: "only the second browser's device is left",
				})
				.toEqual([secondDevice]);

			// Signed out, the device API refuses the first browser.
			const signedOut = await removeDevices(first);
			expect(signedOut.status(), "DELETE /api/alerts/devices signed out").toBe(401);
			// The same request from the signed-in second browser is taken.
			const signedIn = await removeDevices(second);
			expect(signedIn.status(), "DELETE /api/alerts/devices signed in").toBe(204);
		} finally {
			await second.close();
			await agent.close();
		}
	});
});
