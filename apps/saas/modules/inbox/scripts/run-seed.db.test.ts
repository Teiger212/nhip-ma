import { type ConversationSummary, createInboxStore, type InboxViewer } from "@repo/database/inbox";
import { afterEach, expect, test } from "vitest";

import { settleBackgroundWork } from "../lib/background";
import { mockInboxConfig } from "../lib/config";
import { toE164 } from "../lib/crm/phone";
import { SeedRefused } from "../lib/dev-seed/guard";
import { SEED_OFFICES } from "../lib/dev-seed/seed-offices";
import { noDraftAdapter } from "../lib/drafts";
import { inQueue, inView, isQuiet, threadStatus } from "../lib/queue";
import { peekTestRuntime, setRuntimeForTests } from "../lib/runtime";
import { DEMO_THREADS } from "../lib/seed";
import { testDb, useTestDatabaseForAppClient } from "../lib/test-store";
import { needsTranslation } from "../lib/translate";
import {
	RIVER_AGENT_EMAIL,
	RIVER_MANAGER_EMAIL,
	RIVER_OFFICE_ID,
	WALK_AGENT2_EMAIL,
	WALK_MANAGER_EMAIL,
	WALK_OFFICE_ID,
	WALK_USER_EMAIL,
} from "../lib/walk-user";
import { runSeed } from "./run-seed";

/**
 * `pnpm seed` (#69): a rich local-dev and demo dataset, every Inbox, CRM and alert state in two
 * offices, written through the app's own calls; idempotent; `--reset` rewrites it; never in
 * production; and under E2E the walk's four demo threads alone, as before.
 */

// The seed writes through the app's client (`db`): point it at the test database.
useTestDatabaseForAppClient();

const quiet = () => {};
/** A full seed takes a few seconds (sixty guests, seven password hashes); a test runs up to three. */
const SEEDING = { timeout: 60_000 };
const DAY = 24 * 60 * 60 * 1000;
/** The test database is local; nothing else in the seed's environment. */
const localEnv = () => ({ DATABASE_URL: process.env.DATABASE_URL });

afterEach(async () => {
	await settleBackgroundWork();
	const runtime = peekTestRuntime();
	if (runtime) await runtime.store.close();
	setRuntimeForTests(null);
});

const store = createInboxStore(testDb);

async function userId(email: string): Promise<string> {
	return (await testDb.user.findUniqueOrThrow({ where: { email } })).id;
}

async function viewOf(email: string, officeId: string, role: "agent" | "manager") {
	const viewer: InboxViewer = { userId: await userId(email), officeId, role };
	return { viewer, threads: await store.listConversationSummaries(viewer) };
}

const count = (threads: ConversationSummary[], keep: (thread: ConversationSummary) => boolean) =>
	threads.filter(keep).length;

/** Every row the seed writes, by table. */
async function rowCounts() {
	return {
		users: await testDb.user.count(),
		offices: await testDb.organization.count(),
		members: await testDb.member.count(),
		threads: await testDb.conversation.count(),
		messages: await testDb.message.count(),
		answers: await testDb.answer.count(),
		translations: await testDb.translation.count(),
		qualifications: await testDb.qualification.count(),
		alerts: await testDb.inboxAlert.count(),
		bellRows: await testDb.notification.count(),
		crmConnections: await testDb.crmConnection.count(),
		crmLinks: await testDb.crmLink.count(),
		crmWriteFailures: await testDb.crmWriteFailure.count(),
		mockCrmLeads: await testDb.mockCrmLead.count(),
		receipts: await testDb.guestDeletion.count(),
		leadTallies: await testDb.leadTally.count(),
		officeSettings: await testDb.officeSetting.count(),
	};
}

test(
	"the seed writes every Inbox, CRM and alert state the ticket lists, in two offices (#69)",
	SEEDING,
	async () => {
		const now = Date.now();
		await runSeed({ env: localEnv(), reset: false, now, log: quiet });

		// The walk office's manager: every tab has two-digit counts.
		const manager = await viewOf(WALK_MANAGER_EMAIL, WALK_OFFICE_ID, "manager");
		const walk = manager.threads;
		expect(walk.length).toBeGreaterThanOrEqual(40);
		expect(count(walk, (thread) => inView(thread, "unassigned"))).toBeGreaterThanOrEqual(10);
		expect(count(walk, (thread) => inView(thread, "yourTurn"))).toBeGreaterThanOrEqual(10);
		expect(count(walk, (thread) => inView(thread, "sent"))).toBeGreaterThanOrEqual(10);
		expect(count(walk, (thread) => isQuiet(thread, now))).toBeGreaterThanOrEqual(3);
		// Owned by each agent and by the manager, each with something waiting and something sent.
		for (const email of [WALK_USER_EMAIL, WALK_AGENT2_EMAIL, WALK_MANAGER_EMAIL]) {
			const owner = await userId(email);
			const own = walk.filter((thread) => thread.owner?.id === owner);
			expect(
				count(own, (thread) => inView(thread, "yourTurn")),
				email,
			).toBeGreaterThanOrEqual(1);
			expect(
				count(own, (thread) => inView(thread, "sent")),
				email,
			).toBeGreaterThanOrEqual(1);
		}
		for (const email of [WALK_USER_EMAIL, WALK_AGENT2_EMAIL]) {
			const agent = await viewOf(email, WALK_OFFICE_ID, "agent");
			expect(
				count(agent.threads, (thread) => isQuiet(thread, now)),
				email,
			).toBeGreaterThanOrEqual(1);
			expect(agent.threads.every((thread) => thread.owner?.id === agent.viewer.userId)).toBe(true);
		}
		// A guest who wrote back after a reply is Your turn again.
		expect(
			count(
				walk,
				(thread) =>
					thread.sentAt !== null &&
					inQueue(thread) &&
					Date.parse(thread.lastGuestInboundAt ?? "") > Date.parse(thread.sentAt),
			),
		).toBeGreaterThanOrEqual(2);

		// Both pipes; Vietnamese, English, Korean, Japanese and Russian, with French and Chinese
		// (which read as English) among the English.
		const all = [
			...walk,
			...(await viewOf(RIVER_MANAGER_EMAIL, RIVER_OFFICE_ID, "manager")).threads,
		];
		expect(new Set(all.map((thread) => thread.pipe))).toEqual(new Set(["whatsapp", "zalo"]));
		expect(new Set(all.map((thread) => thread.guestLanguage))).toEqual(
			new Set(["vi", "en", "ko", "ja", "ru"]),
		);
		expect(all.some((thread) => /Bonjour|Salut/.test(thread.lastInboundText))).toBe(true);
		expect(all.some((thread) => /[一-鿿]/.test(thread.lastInboundText))).toBe(true);
		// Qualifiers filled, and every guest message translated wherever the app would translate it.
		for (const summary of all) {
			const thread = await store.getOfficeConversation(summary.officeId, summary.id);
			expect(thread?.oneShot?.qualification.areaOfInterest, summary.guestId).toBeTruthy();
			expect(thread?.oneShot?.qualification.rentOrBuy, summary.guestId).toBeTruthy();
			for (const message of thread?.messages ?? []) {
				expect(needsTranslation(message, "en"), message.text).toBe(false);
				expect(needsTranslation(message, "vi"), message.text).toBe(false);
			}
		}

		// Greeted guests, with the greeting row, in the walk office only (the river office's is off).
		expect(
			await testDb.message.count({ where: { officeId: WALK_OFFICE_ID, source: "auto_reply" } }),
		).toBeGreaterThanOrEqual(5);
		expect(
			await testDb.message.count({ where: { officeId: RIVER_OFFICE_ID, source: "auto_reply" } }),
		).toBe(0);
		expect((await store.officeAutoReply(WALK_OFFICE_ID))?.on).toBe(true);
		expect((await store.officeAutoReply(RIVER_OFFICE_ID))?.on).toBe(false);

		// A deleted guest: its receipt, with its reason, and its lead tally.
		const receipts = await testDb.guestDeletion.findMany({ where: { officeId: WALK_OFFICE_ID } });
		expect(receipts.map((receipt) => receipt.reason)).toEqual(["guest_request"]);
		expect(await testDb.leadTally.count({ where: { officeId: WALK_OFFICE_ID } })).toBe(1);

		// Bell rows (assigned, and moved away from the first agent) and the alert log.
		expect(await testDb.notification.count({ where: { type: "THREAD_ASSIGNED" } })).toBeGreaterThan(
			0,
		);
		expect(
			await testDb.notification.count({
				where: { type: "THREAD_MOVED", userId: await userId(WALK_USER_EMAIL) },
			}),
		).toBeGreaterThan(0);
		expect(await testDb.inboxAlert.count({ where: { kind: "guest" } })).toBeGreaterThan(0);
		expect(await testDb.inboxAlert.count({ where: { kind: "assigned" } })).toBeGreaterThan(0);

		// The CRM: in it (made, or found by phone or Zalo id), Not in CRM yet with a recorded
		// failure, won, lost, lost and written back, two leads sharing a phone, an unmatched lead.
		expect(count(walk, (thread) => thread.crm?.method === "created")).toBeGreaterThan(10);
		expect(count(walk, (thread) => thread.crm?.method === "phone")).toBe(1);
		expect(count(walk, (thread) => thread.crm?.method === "zaloId")).toBe(1);
		const notInCrm = walk.filter((thread) => !thread.crm);
		expect(notInCrm).toHaveLength(2);
		for (const thread of notInCrm) {
			expect(await store.crmWriteFailure(WALK_OFFICE_ID, thread.id), thread.guestId).not.toBeNull();
		}
		expect(count(walk, (thread) => threadStatus(thread) === "won")).toBeGreaterThanOrEqual(1);
		expect(count(walk, (thread) => threadStatus(thread) === "lost")).toBeGreaterThanOrEqual(1);
		expect(
			count(walk, (thread) => thread.crm?.outcome === "lost" && inQueue(thread)),
		).toBeGreaterThanOrEqual(1);
		const sharedPhone = await store.findMockCrmLeads(WALK_OFFICE_ID, { phone: "+12025550104" });
		expect(sharedPhone).toHaveLength(2);
		expect(walk.some((thread) => toE164(thread.guestId) === "+12025550104" && !thread.crm)).toBe(
			true,
		);
		const unmatched = await store.findMockCrmLeads(WALK_OFFICE_ID, { phone: "+12025550188" });
		expect(unmatched).toHaveLength(1);
		expect(await store.crmLinksForLeads(WALK_OFFICE_ID, [unmatched[0].id])).toEqual([]);

		// Home has shape: 30 days of leads, engaged and in conversation, response times spread.
		const funnel = await store.funnel(manager.viewer, {
			since: new Date(now - 30 * DAY),
			countMock: true,
			timeZone: "Asia/Ho_Chi_Minh",
		});
		expect(funnel.leadsIn).toBe(walk.length + 1);
		expect(funnel.engaged).toBeGreaterThanOrEqual(20);
		expect(funnel.inConversation).toBeGreaterThanOrEqual(3);
		expect(
			Object.values(funnel.responseTime?.buckets ?? {}).every((answered) => answered > 0),
		).toBe(true);
		expect(funnel.byDay.filter((day) => day.leads > 0).length).toBeGreaterThanOrEqual(15);

		// Tenancy: each office's operators see their own office's threads, never the other's.
		const river = await viewOf(RIVER_MANAGER_EMAIL, RIVER_OFFICE_ID, "manager");
		expect(river.threads.length).toBeGreaterThanOrEqual(10);
		expect(river.threads.every((thread) => thread.officeId === RIVER_OFFICE_ID)).toBe(true);
		expect(walk.every((thread) => thread.officeId === WALK_OFFICE_ID)).toBe(true);
		const riverAgent = await viewOf(RIVER_AGENT_EMAIL, RIVER_OFFICE_ID, "agent");
		expect(riverAgent.threads.length).toBeGreaterThan(0);
		// Members of their own office alone (a member of two offices opens nothing, ADR 0010).
		for (const email of [RIVER_MANAGER_EMAIL, RIVER_AGENT_EMAIL, WALK_MANAGER_EMAIL]) {
			expect(await testDb.member.count({ where: { user: { email } } }), email).toBe(1);
		}

		// Invented numbers only: every WhatsApp guest's is in North America's range for fiction.
		for (const guest of SEED_OFFICES.flatMap((office) => office.guests)) {
			if (guest.pipe !== "whatsapp" || guest.guestId.startsWith("demo-")) continue;
			expect(toE164(guest.guestId), guest.guestId).toMatch(/^\+1\d{3}55501\d{2}$/);
		}
	},
);

test(
	"a second run adds nothing, and --reset rewrites the same rows as of now (#69)",
	SEEDING,
	async () => {
		const firstRun = Date.now() - 2 * DAY;
		await runSeed({ env: localEnv(), reset: false, now: firstRun, log: quiet });
		const seeded = await rowCounts();
		expect(seeded.threads).toBeGreaterThanOrEqual(55);

		await runSeed({ env: localEnv(), reset: false, log: quiet });
		expect(await rowCounts()).toEqual(seeded);

		const now = Date.now();
		await runSeed({ env: localEnv(), reset: true, now, log: quiet });
		expect(await rowCounts()).toEqual(seeded);
		// As of now: the guest who wrote 40 minutes before this run is fresh again.
		const { threads } = await viewOf(WALK_MANAGER_EMAIL, WALK_OFFICE_ID, "manager");
		const latest = Math.max(
			...threads.map((thread) => Date.parse(thread.lastGuestInboundAt ?? "")),
		);
		expect(now - latest).toBeLessThan(60 * 60 * 1000);
	},
);

test("refuses production, and a database that isn't local, before writing anything (#69)", async () => {
	const before = await rowCounts();
	await expect(
		runSeed({ env: { ...localEnv(), VERCEL_ENV: "production" }, reset: false, log: quiet }),
	).rejects.toThrow(SeedRefused);
	await expect(
		runSeed({
			env: { DATABASE_URL: "postgresql://app:secret@ep-quiet-river-0000.aws.neon.tech/neondb" },
			reset: true,
			log: quiet,
		}),
	).rejects.toThrow(SeedRefused);
	expect(await rowCounts()).toEqual(before);
});

test(
	"under E2E the seed writes the walk's four demo threads and nothing more (#69)",
	SEEDING,
	async () => {
		setRuntimeForTests({
			store: createInboxStore(testDb),
			config: mockInboxConfig(),
			drafts: noDraftAdapter,
		});
		await runSeed({ env: { ...localEnv(), E2E: "1" }, reset: true, log: quiet });
		const threads = await testDb.conversation.findMany({
			select: { officeId: true, guestId: true },
		});
		expect(threads.map((thread) => thread.guestId).sort()).toEqual(
			DEMO_THREADS.map((thread) => thread.guestId).sort(),
		);
		expect(threads.every((thread) => thread.officeId === WALK_OFFICE_ID)).toBe(true);
		expect(await testDb.organization.findUnique({ where: { id: RIVER_OFFICE_ID } })).toBeNull();
		expect(await testDb.user.count({ where: { email: RIVER_MANAGER_EMAIL } })).toBe(0);
	},
);
