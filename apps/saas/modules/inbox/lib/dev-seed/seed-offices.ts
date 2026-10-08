import { db, getUserByEmail } from "@repo/database";
import { createInboxStore } from "@repo/database/inbox";

import { mockInboxConfig } from "../config";
import { crmAdapterFor } from "../crm/adapters";
import { toE164 } from "../crm/phone";
import { createCrmSync } from "../crm/sync";
import { CrmError } from "../crm/types";
import { noDraftAdapter } from "../drafts";
import { alertGuestMessage } from "../guest-alerts";
import { alertOwnerChange } from "../guest-alerts/owner-change";
import { mockAlertTransport } from "../guest-alerts/transport";
import { createGuestDeletion } from "../guest-deletion";
import { applyOneShot, refreshTemplate, sendAutoReply, threadUrl } from "../inbox";
import { transmit } from "../pipes";
import type { Runtime } from "../runtime";
import { needsTranslation } from "../translate";
import type { Conversation, InboxViewer } from "../types";
import { atTime } from "./clock";
import { DEMO_SEED_OFFICE } from "./demo-office";
import { RIVER_SEED_OFFICE } from "./river-office";
import {
	type Actor,
	daysAgo,
	SEED_DELETION_NOTE,
	type SeedGuest,
	type SeedOffice,
	type StoryStep,
} from "./story";

/** The offices the rich seed fills (#69), each with its own operators and guests. */
export const SEED_OFFICES: readonly SeedOffice[] = [DEMO_SEED_OFFICE, RIVER_SEED_OFFICE];

/** How long after a guest's first message the auto-reply lands. */
const GREETING_DELAY_MS = 4_000;

/** How long the deletion may run behind the seed's `now` (it runs first in its moved clock). */
const TALLY_SLACK_MS = 30_000;

type Sync = ReturnType<typeof createCrmSync>;

type OfficeSeed = {
	office: SeedOffice;
	runtime: Runtime;
	operators: Record<Actor, string>;
	/** The office's CRM sync, when its CRM is the mock CRM; null with no CRM. */
	crm: Sync | null;
	/** The same sync while the mock CRM is down (#211): every call fails. */
	crmDown: Sync | null;
	now: number;
};

export type OfficeSeedResult = {
	officeId: string;
	written: number;
	skipped: number;
	warnings: string[];
};

/**
 * The seed's runtime: the store the app writes through, sends and alerts mock whatever
 * SEND_MODE says (#134), and no model, so no guest text leaves this machine and every draft is
 * the template. Translations are the dataset's own.
 */
function seedRuntime(): Runtime {
	return { store: createInboxStore(db), config: mockInboxConfig(), drafts: noDraftAdapter };
}

const managerView = (officeId: string): InboxViewer => ({
	userId: "seed",
	officeId,
	role: "manager",
});

const guestKey = (guest: { pipe: string; guestId: string }) => `${guest.pipe}:${guest.guestId}`;

/** How long before the seed a guest first wrote. */
const firstWrote = (guest: SeedGuest) =>
	Math.max(...guest.story.filter((step) => step.kind === "writes").map((step) => step.ago));

/**
 * Fills the seed offices with their invented guests (#69), each guest's story played through the
 * app's own calls at its own time (`clock.ts`): the inbound path, the one-shot, alerts, the
 * auto-reply, the CRM sync, assignments with their bell rows, approvals and a guest deletion. A
 * guest whose thread exists is left alone, so a re-run writes nothing; `reset` first removes
 * what the seed wrote (and only that), then writes it all again as of `now`. Every step is
 * awaited in turn: nothing runs in the background.
 */
export async function seedDevOffices({
	reset = false,
	now = Date.now(),
}: { reset?: boolean; now?: number } = {}): Promise<OfficeSeedResult[]> {
	const runtime = seedRuntime();
	const results: OfficeSeedResult[] = [];
	for (const office of SEED_OFFICES) {
		results.push(await seedOffice(office, runtime, { reset, now }));
	}
	return results;
}

async function seedOffice(
	office: SeedOffice,
	runtime: Runtime,
	{ reset, now }: { reset: boolean; now: number },
): Promise<OfficeSeedResult> {
	const { store } = runtime;
	const { officeId } = office;
	const warnings: string[] = [];
	const operators = await operatorIds(office);
	const ctx: OfficeSeed = { office, runtime, operators, crm: null, crmDown: null, now };

	if (office.mockCrm) {
		const current = await store.getCrmConnection(officeId);
		if (current && current.kind !== "mock") {
			// Replacing another CRM would drop its links: leave it, and its states unseeded.
			warnings.push(
				`${officeId}'s CRM is ${current.kind}, not the mock CRM: its CRM states are not seeded.`,
			);
		} else {
			const sync = createCrmSync({ store, threadUrl });
			// The same kind again writes nothing, so a re-run keeps every link (spec #59, Q6).
			await sync.connectOffice(officeId, "mock");
			ctx.crm = sync;
			ctx.crmDown = createCrmSync({
				store,
				threadUrl,
				adapterFor: (connection, deps) => {
					const adapter = crmAdapterFor(connection, deps);
					const down = async (): Promise<never> => {
						throw new CrmError("The mock CRM is down", "other");
					};
					return { ...adapter, findLeads: down, createLead: down, outcomesFor: down };
				},
			});
		}
	}
	if (!office.autoReply) {
		// Only ever turned off: turning it on stamps now, and no older thread would be greeted (S1).
		await store.setOfficeAutoReply(officeId, false);
	}

	if (reset) await removeSeeded(ctx);

	if (ctx.crm) await writeCrmLeads(ctx);

	const existing = new Set(
		(await store.listConversationSummaries(managerView(officeId))).map(guestKey),
	);
	const deletionDone =
		(await db.guestDeletion.count({ where: { officeId, note: SEED_DELETION_NOTE } })) > 0;
	let written = 0;
	let skipped = 0;
	let ungreeted = 0;
	for (const guest of office.guests) {
		if (existing.has(guestKey(guest)) || (guest.deleted && deletionDone)) {
			skipped += 1;
			continue;
		}
		const greeted = await playGuest(ctx, guest);
		if (guest.greeted && !greeted) ungreeted += 1;
		written += 1;
	}
	if (ungreeted > 0) {
		warnings.push(
			`${officeId}: ${ungreeted} guest(s) were not greeted: its auto-reply is off, or was turned on after they wrote (ADR 0021, S1).`,
		);
	}
	return { officeId, written, skipped, warnings };
}

async function operatorIds(office: SeedOffice): Promise<Record<Actor, string>> {
	const ids: Partial<Record<Actor, string>> = {};
	for (const [actor, email] of Object.entries(office.operators) as [Actor, string][]) {
		const user = await getUserByEmail(email);
		if (!user) throw new Error(`dev seed: seed the login ${email} before ${office.officeId}`);
		ids[actor] = user.id;
	}
	return ids as Record<Actor, string>;
}

/** The leads already in the office's mock CRM: each written once, found by its phone or Zalo id. */
async function writeCrmLeads({ office, runtime: { store }, now }: OfficeSeed): Promise<void> {
	for (const lead of office.crmLeads) {
		const found = await store.findMockCrmLeads(
			office.officeId,
			lead.phone ? { phone: lead.phone } : { zaloUserId: lead.zaloUserId },
		);
		if (found.some((existing) => existing.name === lead.name)) continue;
		await atTime(now - daysAgo(200), () =>
			store.createMockCrmLead({
				officeId: office.officeId,
				name: lead.name,
				phone: lead.phone ?? null,
				zaloUserId: lead.zaloUserId ?? null,
				pipe: lead.pipe,
				language: null,
				fields: null,
				// Entered in the CRM by hand: no thread of Nhịp's.
				threadUrl: "",
			}),
		);
	}
}

/** Plays one guest's story; returns whether the auto-reply greeted them. */
async function playGuest(ctx: OfficeSeed, guest: SeedGuest): Promise<boolean> {
	const { store } = ctx.runtime;
	const { officeId } = ctx.office;
	let threadId: string | null = null;
	let messages = 0;
	let greeted = false;
	const thread = async (): Promise<Conversation> => {
		const found = threadId ? await store.getOfficeConversation(officeId, threadId) : null;
		if (!found) throw new Error(`dev seed: ${guest.guestId} has no thread yet`);
		return found;
	};
	for (const step of guest.story) {
		const at = ctx.now - step.ago;
		await atTime(at, async () => {
			if (step.kind === "writes") {
				threadId = (await guestWrites(ctx, guest, step, at, messages)).id;
				messages += 1;
			} else if (step.kind === "assigns") {
				await managerAssigns(ctx, await thread(), step.to);
			} else if (step.kind === "replies") {
				await operatorReplies(ctx, await thread(), step);
			} else {
				await crmDecides(ctx, await thread(), step);
			}
		});
		if (step.kind === "writes" && messages === 1 && guest.greeted) {
			greeted = await atTime(at + GREETING_DELAY_MS, async () => {
				await sendAutoReply(ctx.runtime, await thread());
				return (await thread()).messages.some((message) => message.source === "auto-reply");
			});
		}
	}
	if (guest.deleted) {
		// As the seed runs, at the guest's request: the receipt is dated `now` (`removeSeeded`
		// finds its lead tally by that).
		const reason = guest.deleted;
		const result = await atTime(ctx.now, async () =>
			createGuestDeletion({ store, countMock: true }).deleteGuest(
				{ userId: ctx.operators.manager, officeId, role: "manager" },
				(await thread()).id,
				{ deleteInCrm: false, reason, note: SEED_DELETION_NOTE },
			),
		);
		if (!result.ok)
			throw new Error(`dev seed: deleting ${guest.guestId} refused (${result.reason})`);
	}
	return greeted;
}

/**
 * A guest message, as a webhook files it and as `afterGuestInbound` follows it up, every step
 * awaited: the one-shot, its translations (the dataset's, where the app would translate), the
 * alert to whoever can open the thread, and the CRM lead while the thread has none.
 */
async function guestWrites(
	ctx: OfficeSeed,
	guest: SeedGuest,
	step: Extract<StoryStep, { kind: "writes" }>,
	at: number,
	index: number,
): Promise<Conversation> {
	const { store } = ctx.runtime;
	const { officeId } = ctx.office;
	const { conversation, inserted } = await store.upsertInbound(
		{
			pipe: guest.pipe,
			source: "guest",
			guestId: guest.guestId,
			guestName: guest.name,
			text: step.text,
			vendorMessageId: `seed-${guest.guestId}-${index}`,
			at,
		},
		officeId,
	);
	const updated = (await applyOneShot(store, conversation)) ?? conversation;
	const message = updated.messages.find((each) => each.id === updated.unansweredInboundId);
	if (!message) throw new Error(`dev seed: ${guest.guestId}'s message did not land`);
	for (const locale of ["en", "vi"] as const) {
		if (!needsTranslation(message, locale, updated.oneShot?.guestLanguage)) continue;
		const text = step.translations[locale];
		if (!text)
			throw new Error(`dev seed: ${guest.guestId}'s message needs its ${locale} translation`);
		await store.setTranslation(officeId, message.id, locale, text);
	}
	if (inserted) await alertGuestMessage(ctx.runtime, updated, { transport: mockAlertTransport });
	if (ctx.crm && !updated.crm) {
		const down = guest.crmDown && index === 0;
		try {
			await (down && ctx.crmDown ? ctx.crmDown : ctx.crm).newGuest(updated);
		} catch (error) {
			// The outage is the story: the failure is on record (#211), the thread "Not in CRM yet".
			if (!down) throw error;
		}
	}
	return updated;
}

/** A manager gives the thread to an operator, or back to Unassigned, as the owner route does. */
async function managerAssigns(
	ctx: OfficeSeed,
	conversation: Conversation,
	to: Actor | null,
): Promise<void> {
	const { store } = ctx.runtime;
	const ownerId = to ? ctx.operators[to] : null;
	const moved = await store.reassign(conversation.id, ownerId, conversation.officeId);
	if (!moved) throw new Error(`dev seed: ${to} cannot be given ${conversation.guestId}'s thread`);
	const reassigned = await store.getOfficeConversation(conversation.officeId, conversation.id);
	if (reassigned) await refreshTemplate(store, reassigned);
	await alertOwnerChange(
		ctx.runtime,
		conversation,
		{ previousOwnerId: moved.previousOwnerId, newOwnerId: ownerId, actorId: ctx.operators.manager },
		{ transport: mockAlertTransport },
	);
}

/** Approve and send (ADR 0011): the Answer on record, the mock send, then the Answer sent. */
async function operatorReplies(
	ctx: OfficeSeed,
	conversation: Conversation,
	step: Extract<StoryStep, { kind: "replies" }>,
): Promise<void> {
	const { store, config } = ctx.runtime;
	const { officeId, id } = conversation;
	const inboundId = conversation.unansweredInboundId;
	if (!inboundId) throw new Error(`dev seed: ${conversation.guestId} has nothing to answer`);
	const begun = await store.beginAnswer({
		officeId,
		conversationId: id,
		inboundId,
		text: step.text,
		operatorId: ctx.operators[step.by],
	});
	if (!begun.ok)
		throw new Error(`dev seed: answering ${conversation.guestId} refused (${begun.reason})`);
	const sent = await transmit({ conversation, text: step.text, from: null, config, store });
	await store.completeAnswer(officeId, begun.answer.id, sent);
}

/** The CRM marks the lead won or lost (its own record), and Nhịp hears of it at once. */
async function crmDecides(
	ctx: OfficeSeed,
	conversation: Conversation,
	step: Extract<StoryStep, { kind: "crm" }>,
): Promise<void> {
	if (!ctx.crm) return;
	const leadId = conversation.crm?.leadId;
	if (!leadId) throw new Error(`dev seed: ${conversation.guestId} has no CRM lead to decide`);
	const { store } = ctx.runtime;
	await store.setMockCrmLeadOutcome(conversation.officeId, leadId, {
		status: step.outcome,
		at: new Date(),
		reason: step.reason,
	});
	await ctx.crm.outcomesChanged(conversation.officeId, [leadId], new Date());
}

/**
 * What `--reset` removes before writing again: the seed guests' threads (with everything under
 * them), the bell rows that name them or open their alerts, their leads in the mock CRM and the
 * ones it starts with, and the seed's deletion receipt with its lead tally. Nothing else in the
 * office: a thread of someone else's stays.
 */
async function removeSeeded({ office, runtime: { store }, operators }: OfficeSeed): Promise<void> {
	const { officeId } = office;
	const keys = new Set(office.guests.map(guestKey));
	const threads = (await store.listConversationSummaries(managerView(officeId))).filter((thread) =>
		keys.has(guestKey(thread)),
	);
	const threadIds = threads.map((thread) => thread.id);
	const leadIds = threads.flatMap((thread) => (thread.crm ? [thread.crm.leadId] : []));

	// Bell rows: "moved" names the thread; "assigned" opens an alert, which goes with its thread.
	const alertIds = new Set(
		(
			await db.inboxAlert.findMany({
				where: { officeId, conversationId: { in: threadIds } },
				select: { id: true },
			})
		).map((alert) => alert.id),
	);
	const bellRows = await db.notification.findMany({
		where: {
			userId: { in: Object.values(operators) },
			type: { in: ["THREAD_ASSIGNED", "THREAD_MOVED"] },
		},
		select: { id: true, data: true, link: true },
	});
	// The seed's deleted guest is never assigned, so none of its "assigned" rows outlives its
	// thread's alerts. One whose alert the app's 30-day retention pruned stays: it is no longer
	// told apart from anyone else's.
	const seeded = bellRows.filter((row) => {
		const threadId = threadIdOf(row.data);
		const alertId = alertIdOf(row.link);
		return (
			(threadId !== null && threadIds.includes(threadId)) ||
			(alertId !== null && alertIds.has(alertId))
		);
	});
	await db.notification.deleteMany({ where: { id: { in: seeded.map((row) => row.id) } } });

	await store.deleteConversations(officeId, threadIds);

	const phones = [
		...office.guests.flatMap((guest) =>
			guest.pipe === "whatsapp" ? (toE164(guest.guestId) ?? []) : [],
		),
		...office.crmLeads.flatMap((lead) => lead.phone ?? []),
	];
	const zaloIds = [
		...office.guests.flatMap((guest) => (guest.pipe === "zalo" ? [guest.guestId] : [])),
		...office.crmLeads.flatMap((lead) => lead.zaloUserId ?? []),
	];
	await db.mockCrmLead.deleteMany({
		where: {
			officeId,
			OR: [{ id: { in: leadIds } }, { phone: { in: phones } }, { zaloUserId: { in: zaloIds } }],
		},
	});

	// The seed deletes its guest at its run's `now` (milliseconds go by before the receipt), and
	// the guest first wrote exactly `firstWrote` before that `now`: so their lead tally is the one
	// on their pipe whose first contact is that, give or take those milliseconds.
	const receipts = await db.guestDeletion.findMany({
		where: { officeId, note: SEED_DELETION_NOTE },
		select: { id: true, at: true },
	});
	for (const receipt of receipts) {
		for (const guest of office.guests.filter((each) => each.deleted)) {
			const firstContact = receipt.at.getTime() - firstWrote(guest);
			await db.leadTally.deleteMany({
				where: {
					officeId,
					pipe: guest.pipe,
					firstInboundAt: {
						gte: new Date(firstContact - TALLY_SLACK_MS),
						lte: new Date(firstContact),
					},
				},
			});
		}
	}
	await db.guestDeletion.deleteMany({
		where: { id: { in: receipts.map((receipt) => receipt.id) } },
	});
}

function threadIdOf(data: unknown): string | null {
	if (typeof data !== "object" || data === null || !("threadId" in data)) return null;
	return typeof data.threadId === "string" ? data.threadId : null;
}

/** The alert an "assigned" bell row opens: its link is `/<locale>/inbox?alert=<id>` (ADR 0019). */
function alertIdOf(link: string | null): string | null {
	return link?.match(/[?&]alert=([^&#]+)/)?.[1] ?? null;
}
