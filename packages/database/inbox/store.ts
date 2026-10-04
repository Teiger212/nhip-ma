import { createId as cuid } from "@paralleldrive/cuid2";
import { z } from "zod";

import { Prisma, type PrismaClient } from "../prisma/generated/client";
import { operatorNameOf } from "../prisma/queries/operators";
import {
	AnswerStatus,
	CrmLinkMethod,
	CrmOutcomeStatus,
	DbMessageSource,
	type Funnel,
	GuestLanguage,
	MessageSource,
	OperatorLanguage,
	Pipe,
	RentOrBuy,
} from "./schema";
import type {
	Answer,
	BeginAnswerResult,
	Conversation,
	ConversationCrm,
	ConversationSummary,
	Draft,
	InboundEvent,
	InboxStore,
	InboxViewer,
	Message,
	MockCrmLead,
	OneShot,
	Qualification,
	SendResult,
	PipeCredentialState,
	Translations,
	WebhookDelivery,
} from "./types";
import { storedVendorMessageId } from "./vendor-id";

export function nowIso(at?: number | string | Date): string {
	if (at instanceof Date) {
		return at.toISOString();
	}
	if (typeof at === "number") {
		return new Date(at).toISOString();
	}
	if (typeof at === "string" && at) {
		return new Date(at).toISOString();
	}
	return new Date().toISOString();
}

/** Everything a `Conversation` is built from, in one read. */
const CONVERSATION_INCLUDE = {
	messages: { orderBy: [{ at: "asc" }, { seq: "asc" }], include: { translations: true } },
	qualification: true,
	draft: true,
	paperwork: true,
	answers: { orderBy: [{ approvedAt: "asc" }, { seq: "asc" }] },
	owner: { select: { id: true, name: true, email: true } },
	crmLink: true,
} satisfies Prisma.ConversationInclude;

/** What a viewer may read (ADR 0015): the office, and for an agent only its pool and their own. */
function visibleTo(viewer: InboxViewer): Prisma.ConversationWhereInput {
	return viewer.role === "manager"
		? { officeId: viewer.officeId }
		: { officeId: viewer.officeId, OR: [{ ownerId: null }, { ownerId: viewer.userId }] };
}

type ConversationRecord = Prisma.ConversationGetPayload<{ include: typeof CONVERSATION_INCLUDE }>;
type MessageRecord = ConversationRecord["messages"][number];
type AnswerRecord = ConversationRecord["answers"][number];
type Db = PrismaClient | Prisma.TransactionClient;

/** An Answer that counts as the office's reply: in flight, delivered, or possibly delivered. */
const ANSWERING_STATUSES: readonly AnswerStatus[] = ["sending", "sent", "unknown"];

/** `visibleTo` for the raw reads of thread `c`: the office, and for an agent its pool and their own. */
function visibleSql(viewer: InboxViewer): Prisma.Sql {
	return viewer.role === "manager"
		? Prisma.sql`"c"."officeId" = ${viewer.officeId}`
		: Prisma.sql`"c"."officeId" = ${viewer.officeId}
			AND ("c"."ownerId" IS NULL OR "c"."ownerId" = ${viewer.userId})`;
}

/**
 * The guest's latest message on thread `c`, as `latest`: last in the thread's order (time,
 * then arrival), the same message `mapConversation` walks back to.
 */
const LATEST_INBOUND = Prisma.sql`
	LEFT JOIN LATERAL (
		SELECT "m"."id", "m"."text", "m"."at", "m"."seq"
		FROM "inbox_message" "m"
		WHERE "m"."conversationId" = "c"."id" AND "m"."direction" = 'in'
		ORDER BY "m"."at" DESC, "m"."seq" DESC
		LIMIT 1
	) "latest" ON TRUE`;

/**
 * Your turn (ADR 0004, ADR 0011) in SQL, exactly as `mapConversation` derives
 * `unansweredInboundId`: there is a latest guest message, no Answer to it is sending, sent or
 * of unknown outcome, and no reply from the vendor's own app comes after it in thread order.
 */
const LATEST_UNANSWERED = Prisma.sql`(
	"latest"."id" IS NOT NULL
	AND NOT EXISTS (
		SELECT 1 FROM "inbox_answer" "a"
		WHERE "a"."inboundId" = "latest"."id"
			AND "a"."status"::text IN (${Prisma.join([...ANSWERING_STATUSES])})
	)
	AND NOT EXISTS (
		SELECT 1 FROM "inbox_message" "echo"
		WHERE "echo"."conversationId" = "c"."id"
			AND "echo"."direction" = 'out' AND "echo"."source" = 'oa_echo'
			AND ("echo"."at", "echo"."seq") > ("latest"."at", "latest"."seq")
	)
)`;

type SummaryRow = {
	id: string;
	pipe: string;
	guestId: string;
	guestName: string | null;
	officeId: string;
	language: string | null;
	lastGuestInboundAt: Date | null;
	sentAt: Date | null;
	updatedAt: Date;
	ownerId: string | null;
	ownerName: string | null;
	ownerEmail: string | null;
	lastInboundText: string | null;
	unansweredInboundId: string | null;
	crmLeadId: string | null;
	crmLeadName: string | null;
	crmMethod: string | null;
	crmOutcome: string | null;
	crmOutcomeAt: Date | null;
	crmOutcomeReason: string | null;
	crmOutcomeObservedAt: Date | null;
};

/** A thread's CRM link row, as either read shapes it. */
type CrmLinkRow = {
	leadId: string | null;
	leadName: string | null;
	method: string | null;
	outcome: string | null;
	outcomeAt: Date | null;
	outcomeReason: string | null;
	outcomeObservedAt: Date | null;
};

/** The thread's linked lead, or null while it has none (a claim in progress, or no CRM). */
function mapCrmLink(row: CrmLinkRow | null | undefined): ConversationCrm | null {
	if (!row?.leadId || row.leadName === null || row.method === null) return null;
	return {
		leadId: row.leadId,
		leadName: row.leadName,
		method: vocab(CrmLinkMethod, row.method, "CrmLink.method"),
		outcome: row.outcome === null ? null : vocab(CrmOutcomeStatus, row.outcome, "CrmLink.outcome"),
		outcomeAt: isoOrNull(row.outcomeAt),
		outcomeReason: row.outcomeReason,
		outcomeObservedAt: isoOrNull(row.outcomeObservedAt),
	};
}

/**
 * Languages and rent-or-buy are text on disk (ADR 0012) so the lists can grow without a
 * schema change. This store is their only writer, so a value outside the vocabulary is
 * corrupt state: fail at the read rather than hand the domain something it cannot name.
 */
function vocab<Schema extends z.ZodType>(
	schema: Schema,
	value: unknown,
	where: string,
): z.infer<Schema> {
	const parsed = schema.safeParse(value);
	if (!parsed.success) {
		throw new Error(
			`Inbox store: ${where} holds a value outside the vocabulary.\n${z.prettifyError(parsed.error)}`,
		);
	}
	return parsed.data;
}

const iso = (at: Date): string => at.toISOString();
const isoOrNull = (at: Date | null): string | null => (at ? at.toISOString() : null);

function mapMockCrmLead(row: Prisma.MockCrmLeadGetPayload<object>): MockCrmLead {
	return {
		id: row.id,
		officeId: row.officeId,
		name: row.name,
		phone: row.phone,
		zaloUserId: row.zaloUserId,
		pipe: row.pipe,
		language: row.language,
		fields: (row.fields as Qualification | null) ?? null,
		threadUrl: row.threadUrl,
		outcome: row.outcome,
		outcomeAt: isoOrNull(row.outcomeAt),
		outcomeReason: row.outcomeReason,
		createdAt: iso(row.createdAt),
	};
}

function toDbSource(source: MessageSource): DbMessageSource {
	return source === "oa-echo" ? "oa_echo" : source;
}

function fromDbSource(source: DbMessageSource): MessageSource {
	return source === "oa_echo" ? "oa-echo" : source;
}

function mapMessage(row: MessageRecord): Message {
	const translations: Translations = {};
	for (const translation of row.translations) {
		translations[vocab(OperatorLanguage, translation.locale, "Translation.locale")] =
			translation.text;
	}
	return {
		id: row.id,
		direction: row.direction,
		source: fromDbSource(row.source),
		text: row.text,
		at: iso(row.at),
		vendorMessageId: row.vendorMessageId,
		mock: row.mock ? true : undefined,
		pipeExternalId: row.pipeExternalId,
		translations,
	};
}

function mapAnswer(row: AnswerRecord): Answer {
	return {
		id: row.id,
		conversationId: row.conversationId,
		inboundId: row.inboundId,
		text: row.text,
		operatorId: row.operatorId,
		operatorName: row.operatorName,
		status: row.status,
		mock: row.mock,
		pipe: row.pipe,
		pipeExternalId: row.pipeExternalId,
		vendorMessageId: row.vendorMessageId,
		approvedAt: iso(row.approvedAt),
		sentAt: isoOrNull(row.sentAt),
		failedAt: isoOrNull(row.failedAt),
		failureReason: row.failureReason,
	};
}

/**
 * Every method that returns a `Conversation` bottoms out here. "Your turn" is derived
 * here too (ADR 0011): the guest's latest message is unanswered unless an Answer is in
 * flight, sent or of unknown outcome for it, or the agent replied from the OA app after
 * it. Message order alone does not decide, so a guest message that lands mid-send is not
 * hidden by the outbound that answers an earlier one.
 */
function mapConversation(record: ConversationRecord): Conversation {
	const messages = record.messages.map(mapMessage);
	const answers = record.answers.map(mapAnswer);

	const oneShot: OneShot | null =
		record.language && record.qualification && record.draft && record.paperwork
			? {
					language: vocab(GuestLanguage, record.language, "Conversation.language"),
					qualification: {
						areaOfInterest: record.qualification.areaOfInterest,
						nationality: record.qualification.nationality,
						inVietnamNow: record.qualification.inVietnamNow,
						rentOrBuy: vocab(
							RentOrBuy.nullable(),
							record.qualification.rentOrBuy,
							"Qualification.rentOrBuy",
						),
						timeframe: record.qualification.timeframe,
						budgetBand: record.qualification.budgetBand,
						bedsOrHousehold: record.qualification.bedsOrHousehold,
					},
					paperwork: { mentioned: record.paperwork.mentioned, flag: record.paperwork.flag },
					draft: {
						reply: record.draft.reply,
						answersMessageId: record.draft.answersMessageId,
						source: record.draft.source,
					},
				}
			: null;

	let unansweredInboundId: string | null = null;
	for (let i = messages.length - 1; i >= 0; i -= 1) {
		const message = messages[i];
		if (message.direction === "in") {
			const answered = answers.some(
				(answer) => answer.inboundId === message.id && ANSWERING_STATUSES.includes(answer.status),
			);
			const echoedAfter = messages
				.slice(i + 1)
				.some((later) => later.direction === "out" && later.source === "oa-echo");
			unansweredInboundId = answered || echoedAfter ? null : message.id;
			break;
		}
	}

	return {
		id: record.id,
		pipe: record.pipe,
		guestId: record.guestId,
		guestName: record.guestName,
		officeId: record.officeId,
		owner: record.owner ? { id: record.owner.id, name: operatorNameOf(record.owner) } : null,
		crm: mapCrmLink(record.crmLink),
		messages,
		lastGuestInboundAt: isoOrNull(record.lastGuestInboundAt),
		sentAt: isoOrNull(record.sentAt),
		unansweredInboundId,
		oneShot,
		answers,
		lastAnswer: answers.length > 0 ? answers[answers.length - 1] : null,
		updatedAt: iso(record.updatedAt),
	};
}

function mapSummary(row: SummaryRow): ConversationSummary {
	return {
		id: row.id,
		pipe: vocab(Pipe, row.pipe, "Conversation.pipe"),
		guestId: row.guestId,
		guestName: row.guestName,
		officeId: row.officeId,
		owner:
			row.ownerId !== null
				? {
						id: row.ownerId,
						name: operatorNameOf({ name: row.ownerName ?? "", email: row.ownerEmail ?? "" }),
					}
				: null,
		lastGuestInboundAt: isoOrNull(row.lastGuestInboundAt),
		sentAt: isoOrNull(row.sentAt),
		unansweredInboundId: row.unansweredInboundId,
		updatedAt: iso(row.updatedAt),
		guestLanguage: row.language
			? vocab(GuestLanguage, row.language, "Conversation.language")
			: null,
		lastInboundText: row.lastInboundText ?? "",
		crm: mapCrmLink({
			leadId: row.crmLeadId,
			leadName: row.crmLeadName,
			method: row.crmMethod,
			outcome: row.crmOutcome,
			outcomeAt: row.crmOutcomeAt,
			outcomeReason: row.crmOutcomeReason,
			outcomeObservedAt: row.crmOutcomeObservedAt,
		}),
	};
}

/** Prisma's unique-violation code. Duck-typed so no error class has to be imported. */
function isUniqueViolation(error: unknown): boolean {
	return (
		typeof error === "object" && error !== null && (error as { code?: unknown }).code === "P2002"
	);
}

/** The nearest-rank percentile of an ascending list: `p` in (0, 1], never interpolated. */
function nearestRank(sorted: number[], p: number): number {
	return sorted[Math.max(0, Math.ceil(p * sorted.length) - 1)];
}

const MINUTE_MS = 60_000;

/** The response-time bands (ResponseTime.buckets), each lower bound inclusive. */
function responseBuckets(durations: number[]): NonNullable<Funnel["responseTime"]>["buckets"] {
	const buckets = { under5m: 0, from5to15m: 0, from15to60m: 0, over60m: 0 };
	for (const ms of durations) {
		if (ms < 5 * MINUTE_MS) buckets.under5m += 1;
		else if (ms < 15 * MINUTE_MS) buckets.from5to15m += 1;
		else if (ms < 60 * MINUTE_MS) buckets.from15to60m += 1;
		else buckets.over60m += 1;
	}
	return buckets;
}

/** `YYYY-MM-DD` of the calendar day after `day`, by calendar arithmetic, never by 24 hours. */
function nextDay(day: string): string {
	const [year, month, date] = day.split("-").map(Number);
	return new Date(Date.UTC(year, month - 1, date + 1)).toISOString().slice(0, 10);
}

/**
 * Leads by local calendar day (Funnel.byDay): every day from `since`'s to `until`'s in
 * `timeZone`, zero-filled. A first contact stamped after `until` (a vendor clock ahead of
 * ours) counts on the last day, so the days still add up to the cohort.
 */
function leadsByDay(
	firstContacts: Date[],
	since: Date,
	until: Date,
	timeZone: string,
): Funnel["byDay"] {
	const dayKey = new Intl.DateTimeFormat("en-CA", {
		timeZone,
		year: "numeric",
		month: "2-digit",
		day: "2-digit",
	});
	const last = dayKey.format(until);
	const days = new Map<string, number>();
	for (let day = dayKey.format(since); day <= last; day = nextDay(day)) {
		days.set(day, 0);
	}
	for (const at of firstContacts) {
		const day = dayKey.format(at);
		const key = day > last ? last : day;
		days.set(key, (days.get(key) ?? 0) + 1);
	}
	return [...days].map(([day, leads]) => ({ day, leads }));
}

export function createInboxStore(db: PrismaClient): InboxStore {
	/** The office's thread, or null: an id never reaches another office's (#95). */
	async function load(officeId: string, id: string, client: Db = db): Promise<Conversation | null> {
		const record = await client.conversation.findUnique({
			where: { id_officeId: { id, officeId } },
			include: CONVERSATION_INCLUDE,
		});
		return record ? mapConversation(record) : null;
	}

	async function exists(officeId: string, id: string): Promise<boolean> {
		return (await db.conversation.count({ where: { id, officeId } })) > 0;
	}

	return {
		async listConversations(viewer) {
			const records = await db.conversation.findMany({
				where: visibleTo(viewer),
				orderBy: { updatedAt: "desc" },
				include: CONVERSATION_INCLUDE,
			});
			return records.map(mapConversation);
		},

		async listConversationSummaries(viewer) {
			// One row per thread, never per message: the latest guest message is one indexed
			// lookup per thread (`inbox_message (conversationId, direction, at)`).
			const rows = await db.$queryRaw<SummaryRow[]>`
				SELECT "c"."id", "c"."pipe"::text AS "pipe", "c"."guestId", "c"."guestName",
					"c"."officeId", "c"."language", "c"."lastGuestInboundAt", "c"."sentAt",
					"c"."updatedAt",
					"owner"."id" AS "ownerId", "owner"."name" AS "ownerName",
					"owner"."email" AS "ownerEmail",
					"latest"."text" AS "lastInboundText",
					CASE WHEN ${LATEST_UNANSWERED} THEN "latest"."id" END AS "unansweredInboundId",
					"crm"."leadId" AS "crmLeadId", "crm"."leadName" AS "crmLeadName",
					"crm"."method"::text AS "crmMethod", "crm"."outcome"::text AS "crmOutcome",
					"crm"."outcomeAt" AS "crmOutcomeAt", "crm"."outcomeReason" AS "crmOutcomeReason",
					"crm"."outcomeObservedAt" AS "crmOutcomeObservedAt"
				FROM "inbox_conversation" "c"
				LEFT JOIN "user" "owner" ON "owner"."id" = "c"."ownerId"
				LEFT JOIN "inbox_crm_link" "crm" ON "crm"."conversationId" = "c"."id"
				${LATEST_INBOUND}
				WHERE ${visibleSql(viewer)}
				ORDER BY "c"."updatedAt" DESC, "c"."id"
			`;
			return rows.map(mapSummary);
		},

		async getConversation(id, viewer) {
			const record = await db.conversation.findFirst({
				where: { id, ...visibleTo(viewer) },
				include: CONVERSATION_INCLUDE,
			});
			return record ? mapConversation(record) : null;
		},

		async getOfficeConversation(officeId, id) {
			return load(officeId, id);
		},

		async upsertInbound(event: InboundEvent, officeId: string) {
			const at = new Date(nowIso(event.at));
			// Stored and compared only as its keyed hash: the raw id can carry the guest's number.
			const vendorMessageId = storedVendorMessageId(event.vendorMessageId);
			const write = () =>
				db.$transaction(async (tx) => {
					// One thread per guest per office (ADR 0010): found by (office, pipe, guest), the
					// unique key. Its id is opaque and never names the guest (#141).
					const existing = await tx.conversation.findUnique({
						where: {
							officeId_pipe_guestId: { officeId, pipe: event.pipe, guestId: event.guestId },
						},
						select: { id: true, guestName: true },
					});
					const threadId = existing?.id ?? cuid();
					if (existing) {
						await tx.conversation.update({
							where: { id: threadId },
							data: { guestName: existing.guestName ?? (event.guestName || null), updatedAt: at },
						});
					} else {
						await tx.conversation.create({
							data: {
								id: threadId,
								pipe: event.pipe,
								guestId: event.guestId,
								guestName: event.guestName || null,
								officeId,
								updatedAt: at,
							},
						});
					}

					if (vendorMessageId) {
						const duplicate = await tx.message.findFirst({
							where: { conversationId: threadId, vendorMessageId },
							select: { id: true },
						});
						if (duplicate) {
							return { id: threadId, inserted: false };
						}
					}

					await tx.message.create({
						data: {
							id: cuid(),
							conversationId: threadId,
							officeId,
							direction: event.source === "guest" ? "in" : "out",
							source: toDbSource(event.source),
							text: event.text,
							at,
							vendorMessageId,
							pipeExternalId: event.pipeExternalId ?? null,
						},
					});

					if (event.source === "guest") {
						await tx.conversation.update({
							where: { id: threadId },
							data: { lastGuestInboundAt: at, updatedAt: at },
						});
					}
					return { id: threadId, inserted: true };
				});
			// A vendor retry or a guest's first two messages can race here. The loser hits a
			// unique index (thread per guest, message per vendor id); run again and it finds
			// the winner's row, so only one of them says it inserted (ADR 0019: only a new
			// message alerts).
			let written: { id: string; inserted: boolean };
			try {
				written = await write();
			} catch (error) {
				if (!isUniqueViolation(error)) throw error;
				written = await write();
			}
			return {
				conversation: (await load(officeId, written.id)) as Conversation,
				inserted: written.inserted,
			};
		},

		async deleteConversations(officeId, ids) {
			const { count } = await db.conversation.deleteMany({ where: { officeId, id: { in: ids } } });
			return count;
		},

		async setOneShot(officeId, id, shot: OneShot) {
			if (!(await exists(officeId, id))) {
				return null;
			}
			const q = shot.qualification;
			const paperwork = { mentioned: shot.paperwork.mentioned, flag: shot.paperwork.flag };
			const threadKey = { conversationId_officeId: { conversationId: id, officeId } };
			await db.$transaction([
				db.qualification.upsert({
					where: threadKey,
					create: { conversationId: id, officeId, ...q },
					update: { ...q },
				}),
				db.draft.upsert({
					where: threadKey,
					create: { conversationId: id, officeId, ...shot.draft },
					update: { ...shot.draft },
				}),
				db.paperwork.upsert({
					where: threadKey,
					create: { conversationId: id, officeId, ...paperwork },
					update: paperwork,
				}),
				db.conversation.update({
					where: { id_officeId: { id, officeId } },
					data: { language: shot.language, updatedAt: new Date() },
				}),
			]);
			return load(officeId, id);
		},

		async setDraft(officeId, id, draft: Draft) {
			if (!(await exists(officeId, id))) {
				return null;
			}
			await db.draft.upsert({
				where: { conversationId_officeId: { conversationId: id, officeId } },
				create: { conversationId: id, officeId, ...draft },
				update: { ...draft },
			});
			return load(officeId, id);
		},

		// The translation rows below are keyed by message. Scoped by office in the where, a
		// message of another office matches nothing; the create that follows is then refused
		// by the database (its key exists, or its office is not its message's): it throws.
		async setTranslation(officeId, messageId, locale, text) {
			await db.$transaction([
				db.translation.upsert({
					where: { messageId_locale: { messageId, locale }, officeId },
					create: { messageId, officeId, locale, text },
					update: { text },
				}),
				db.translationFailure.deleteMany({ where: { messageId, locale, officeId } }),
			]);
		},

		async recordTranslationFailure(officeId, messageId, locale, at) {
			await db.translationFailure.upsert({
				where: { messageId_locale: { messageId, locale }, officeId },
				create: { messageId, officeId, locale, attempts: 1, lastFailedAt: at },
				update: { attempts: { increment: 1 }, lastFailedAt: at },
			});
		},

		async translationFailures(officeId, messageIds, locale) {
			if (messageIds.length === 0) return [];
			const rows = await db.translationFailure.findMany({
				where: { messageId: { in: messageIds }, locale, officeId },
			});
			return rows.map((row) => ({
				messageId: row.messageId,
				locale: vocab(OperatorLanguage, row.locale, "TranslationFailure.locale"),
				attempts: row.attempts,
				lastFailedAt: iso(row.lastFailedAt),
			}));
		},

		async beginAnswer(input) {
			try {
				return await db.$transaction(async (tx): Promise<BeginAnswerResult> => {
					const inbound = await tx.message.findFirst({
						where: {
							id: input.inboundId,
							conversationId: input.conversationId,
							officeId: input.officeId,
						},
						select: {
							direction: true,
							pipeExternalId: true,
							conversation: { select: { pipe: true } },
						},
					});
					if (!inbound || inbound.direction !== "in") {
						throw new Error("Inbox store: beginAnswer needs a guest message on this thread.");
					}
					const existing = await tx.answer.findUnique({
						where: { inboundId: input.inboundId, officeId: input.officeId },
					});
					const operator = input.operatorId
						? await tx.user.findUnique({
								where: { id: input.operatorId },
								select: { name: true, email: true },
							})
						: null;
					const operatorName = operator ? operatorNameOf(operator) : null;
					const now = new Date();
					if (existing) {
						if (existing.status === "sent") return { ok: false, reason: "already_answered" };
						if (existing.status === "sending") return { ok: false, reason: "in_progress" };
						if (existing.status === "unknown") return { ok: false, reason: "unknown" };
						// A definite failure is retried on the same row: one Answer per inbound, always.
						// Guarded on `failed`: of two approvals racing the retry, the second waits on the
						// row lock, then matches nothing and is refused.
						const retried = await tx.answer.updateMany({
							where: { id: existing.id, status: "failed" },
							data: {
								status: "sending",
								text: input.text,
								operatorId: input.operatorId,
								operatorName,
								approvedAt: now,
								failedAt: null,
								failureReason: null,
								vendorMessageId: null,
							},
						});
						if (retried.count === 0) return { ok: false, reason: "in_progress" };
						if (input.operatorId) {
							await tx.conversation.updateMany({
								where: { id: input.conversationId, officeId: input.officeId, ownerId: null },
								data: { ownerId: input.operatorId },
							});
						}
						const answer = await tx.answer.findUniqueOrThrow({ where: { id: existing.id } });
						return { ok: true, answer: mapAnswer(answer) };
					}
					const created = await tx.answer.create({
						data: {
							id: cuid(),
							conversationId: input.conversationId,
							officeId: input.officeId,
							inboundId: input.inboundId,
							text: input.text,
							operatorId: input.operatorId,
							operatorName,
							status: "sending",
							pipe: inbound.conversation.pipe,
							pipeExternalId: inbound.pipeExternalId,
							approvedAt: now,
						},
					});
					// Pool, then owner (ADR 0015): the first approval claims an unowned thread, in the
					// same transaction, so two agents racing for it end with one owner.
					if (input.operatorId) {
						await tx.conversation.updateMany({
							where: { id: input.conversationId, officeId: input.officeId, ownerId: null },
							data: { ownerId: input.operatorId },
						});
					}
					return { ok: true, answer: mapAnswer(created) };
				});
			} catch (error) {
				// Two approvals in the same instant: the unique index on inboundId lets one in.
				if (isUniqueViolation(error)) {
					return { ok: false, reason: "in_progress" };
				}
				throw error;
			}
		},

		async completeAnswer(officeId, answerId, result: SendResult) {
			const answer = await db.answer.findUnique({ where: { id: answerId, officeId } });
			if (!answer) {
				return null;
			}
			if (answer.status !== "sending") {
				throw new Error(`Inbox store: completeAnswer on an Answer that is ${answer.status}.`);
			}
			const at = new Date();
			const vendorMessageId = storedVendorMessageId(result.vendorMessageId);
			await db.$transaction([
				db.answer.update({
					where: { id: answerId, officeId },
					data: { status: "sent", sentAt: at, mock: result.mock, vendorMessageId },
				}),
				db.message.create({
					data: {
						id: cuid(),
						conversationId: answer.conversationId,
						officeId,
						direction: "out",
						source: "nhip",
						text: answer.text,
						at,
						vendorMessageId,
						mock: result.mock,
						pipeExternalId: answer.pipeExternalId,
					},
				}),
				db.conversation.update({
					where: { id_officeId: { id: answer.conversationId, officeId } },
					data: { sentAt: at, updatedAt: at },
				}),
			]);
			return load(officeId, answer.conversationId);
		},

		async failAnswer(officeId, answerId, reason) {
			await db.answer.updateMany({
				where: { id: answerId, officeId, status: "sending" },
				data: { status: "failed", failedAt: new Date(), failureReason: reason },
			});
		},

		async markAnswerUnknown(officeId, answerId, reason) {
			await db.answer.updateMany({
				where: { id: answerId, officeId, status: "sending" },
				data: { status: "unknown", failedAt: new Date(), failureReason: reason },
			});
		},

		async connectPipe(connection) {
			await db.pipeConnection.upsert({
				where: { pipe_externalId: { pipe: connection.pipe, externalId: connection.externalId } },
				create: connection,
				update: { officeId: connection.officeId },
			});
		},

		async officeForPipe(pipe, externalId) {
			const found = await db.pipeConnection.findUnique({
				where: { pipe_externalId: { pipe, externalId } },
				select: { officeId: true },
			});
			return found?.officeId ?? null;
		},

		async listPipeConnections() {
			// Postgres orders an enum by its declaration, not its spelling; sort here so the
			// list reads alphabetically by pipe, then by endpoint.
			const connections = await db.pipeConnection.findMany({
				select: { pipe: true, externalId: true, officeId: true },
			});
			return connections.sort(
				(a, b) => a.pipe.localeCompare(b.pipe) || a.externalId.localeCompare(b.externalId),
			);
		},

		async savePipeCredential(pipe, externalId, credential) {
			await db.pipeCredential.upsert({
				where: { pipe_externalId: { pipe, externalId } },
				create: { pipe, externalId, ...credential },
				update: { ...credential, disconnectedAt: null, disconnectedReason: null },
			});
		},

		async claimPipe(connection) {
			return db
				.$transaction(async (tx) => {
					const held = await tx.pipeConnection.findUnique({
						where: {
							pipe_externalId: { pipe: connection.pipe, externalId: connection.externalId },
						},
						select: { officeId: true },
					});
					if (held && held.officeId !== connection.officeId) {
						return { ok: false as const, heldBy: held.officeId };
					}
					if (!held) await tx.pipeConnection.create({ data: connection });
					return { ok: true as const };
				})
				.catch(async (err: unknown) => {
					// Two offices claiming the same endpoint at once: the primary key lets one win.
					if ((err as { code?: string }).code !== "P2002") throw err;
					const winner = await db.pipeConnection.findUnique({
						where: {
							pipe_externalId: { pipe: connection.pipe, externalId: connection.externalId },
						},
						select: { officeId: true },
					});
					return winner && winner.officeId !== connection.officeId
						? { ok: false as const, heldBy: winner.officeId }
						: { ok: true as const };
				});
		},

		async releasePipe(pipe, externalId) {
			await db.pipeConnection.deleteMany({ where: { pipe, externalId } });
		},

		async officePipes(officeId) {
			const rows = await db.pipeConnection.findMany({
				where: { officeId },
				select: {
					pipe: true,
					externalId: true,
					credential: { select: { disconnectedAt: true, disconnectedReason: true } },
				},
			});
			return rows
				.map((row) => ({
					pipe: row.pipe,
					externalId: row.externalId,
					credential: !row.credential
						? ("none" as const)
						: row.credential.disconnectedAt
							? ("disconnected" as const)
							: ("connected" as const),
					disconnectedReason: row.credential?.disconnectedReason ?? null,
				}))
				.sort((a, b) => a.pipe.localeCompare(b.pipe) || a.externalId.localeCompare(b.externalId));
		},

		async pipeCredentialState(pipe, externalId) {
			return db.pipeCredential.findUnique({
				where: { pipe_externalId: { pipe, externalId } },
				select: {
					accessToken: true,
					refreshToken: true,
					accessTokenExpiresAt: true,
					disconnectedAt: true,
					disconnectedReason: true,
				},
			});
		},

		async markPipeDisconnected(pipe, externalId, reason) {
			const { count } = await db.pipeCredential.updateMany({
				where: { pipe, externalId, disconnectedAt: null },
				data: { disconnectedAt: new Date(), disconnectedReason: reason },
			});
			return count === 1;
		},

		async withPipeCredentialLock(pipe, externalId, work) {
			return db.$transaction(
				async (tx) => {
					// Prisma has no row-lock API; this one read takes the lock (bound parameters).
					const rows = await tx.$queryRaw<PipeCredentialState[]>`
						SELECT "accessToken", "refreshToken", "accessTokenExpiresAt",
							"disconnectedAt", "disconnectedReason"
						FROM "inbox_pipe_credential"
						WHERE "pipe" = ${pipe}::"Pipe" AND "externalId" = ${externalId}
						FOR UPDATE`;
					const save = async (next: Partial<PipeCredentialState>) => {
						await tx.pipeCredential.update({
							where: { pipe_externalId: { pipe, externalId } },
							data: next,
						});
					};
					return work(rows[0] ?? null, save);
				},
				// The work may call the vendor; its own timeout is shorter than this.
				{ maxWait: 10_000, timeout: 20_000 },
			);
		},

		async setOwner(conversationId, ownerId, officeId) {
			if (ownerId) {
				const member = await db.member.count({
					where: { organizationId: officeId, userId: ownerId },
				});
				if (member === 0) return false;
			}
			const { count } = await db.conversation.updateMany({
				where: { id: conversationId, officeId },
				data: { ownerId },
			});
			return count === 1;
		},

		async recordWebhookDelivery(delivery) {
			// Kept to match a delivery to its messages, never to say who the guest is (#141).
			const vendorMessageIds = delivery.vendorMessageIds.flatMap(
				(id) => storedVendorMessageId(id) ?? [],
			);
			await db.webhookDelivery.create({ data: { ...delivery, vendorMessageIds } });
		},

		async listWebhookDeliveries({ limit, pipe }) {
			const rows = await db.webhookDelivery.findMany({
				where: pipe ? { pipe } : {},
				orderBy: { receivedAt: "desc" },
				take: limit,
			});
			return rows.map((row) => ({
				...row,
				outcome: row.outcome as WebhookDelivery["outcome"],
				receivedAt: row.receivedAt.toISOString(),
			}));
		},

		async officeOperators(officeId) {
			const members = await db.member.findMany({
				where: { organizationId: officeId },
				orderBy: { createdAt: "asc" },
				select: {
					user: {
						select: { id: true, role: true, locale: true, _count: { select: { members: true } } },
					},
				},
			});
			// A member of two offices opens no thread at all (ADR 0010, `resolveOffice`), and an
			// alert never names a guest someone cannot open (ADR 0019).
			return members
				.filter(({ user }) => user._count.members === 1)
				.map(({ user }) => ({
					userId: user.id,
					platformRole: user.role,
					locale: user.locale,
				}));
		},

		async recordAlert({ officeId, conversationId, userId, kind, now, link, sounds }) {
			const id = cuid();
			return db.$transaction(
				async (tx) => {
					// One operator's alerts on one thread are decided one at a time (ADR 0019), so
					// two messages at once cannot both sound. Released at commit.
					if (conversationId) {
						await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${userId}::text), hashtext(${conversationId}::text))`;
					}
					const previous = conversationId
						? await tx.inboxAlert.findFirst({
								where: { userId, conversationId },
								orderBy: { createdAt: "desc" },
								select: { createdAt: true },
							})
						: null;
					const sounded = sounds(previous?.createdAt ?? null, now);
					const row = await tx.inboxAlert.create({
						data: {
							id,
							userId,
							conversationId,
							officeId,
							kind,
							sounded,
							link: link(id),
							createdAt: now,
						},
						select: { id: true, link: true, sounded: true },
					});
					return row;
				},
				// A burst queues its alerts behind the lock; each holds it for a read and an insert.
				{ maxWait: 10_000, timeout: 20_000 },
			);
		},

		async pruneAlerts(before) {
			const { count } = await db.inboxAlert.deleteMany({ where: { createdAt: { lt: before } } });
			return count;
		},

		async pruneWebhookDeliveries(before) {
			const { count } = await db.webhookDelivery.deleteMany({
				where: { receivedAt: { lt: before } },
			});
			return count;
		},

		async guestInboundText(officeId, id) {
			const messages = await db.message.findMany({
				where: { conversationId: id, officeId, source: "guest" },
				orderBy: [{ at: "asc" }, { seq: "asc" }],
				select: { text: true },
			});
			return messages.map((message) => message.text).join("\n");
		},

		async funnel(viewer, window) {
			const since = new Date(nowIso(window.since));
			const until = new Date();
			// One row per cohort lead, never per message; the percentiles, the response-time
			// bands and the local days are the only things left for JavaScript. Every CTE starts
			// from the office's threads (then the cohort's), so no other office's rows are read.
			const leads = await db.$queryRaw<
				Array<{ firstInboundAt: Date; firstSentAt: Date | null; wroteBack: boolean }>
			>`
				WITH "office" AS (
					SELECT "id" FROM "inbox_conversation" WHERE "officeId" = ${viewer.officeId}
				),
				"first" AS (
					SELECT "m"."conversationId", MIN("m"."at") AS "firstInboundAt"
					FROM "inbox_message" "m"
					JOIN "office" ON "office"."id" = "m"."conversationId"
					WHERE "m"."direction" = 'in'
					GROUP BY "m"."conversationId"
					HAVING MIN("m"."at") >= ${since}
				),
				"reached" AS (
					SELECT "conversationId", MIN("at") AS "firstSentAt" FROM (
						SELECT "a"."conversationId", "a"."sentAt" AS "at" FROM "inbox_answer" "a"
						JOIN "first" ON "first"."conversationId" = "a"."conversationId"
						WHERE "a"."status" = 'sent' AND (${window.countMock} OR NOT "a"."mock")
						UNION ALL
						SELECT "m"."conversationId", "m"."at" FROM "inbox_message" "m"
						JOIN "first" ON "first"."conversationId" = "m"."conversationId"
						WHERE "m"."direction" = 'out' AND "m"."source" = 'oa_echo'
					) "replies" GROUP BY "conversationId"
				)
				SELECT "first"."firstInboundAt" AS "firstInboundAt",
				       "reached"."firstSentAt" AS "firstSentAt",
				       EXISTS (
				         SELECT 1 FROM "inbox_message" "later"
				         WHERE "later"."conversationId" = "c"."id"
				           AND "later"."direction" = 'in'
				           AND "later"."at" > "reached"."firstSentAt"
				       ) AS "wroteBack"
				FROM "inbox_conversation" "c"
				JOIN "first" ON "first"."conversationId" = "c"."id"
				LEFT JOIN "reached" ON "reached"."conversationId" = "c"."id"
				WHERE "c"."officeId" = ${viewer.officeId}
			`;
			const durations = leads
				.flatMap((lead) =>
					lead.firstSentAt ? [lead.firstSentAt.getTime() - lead.firstInboundAt.getTime()] : [],
				)
				.map((ms) => Math.max(0, ms))
				.sort((a, b) => a - b);
			const funnel: Funnel = {
				since: iso(since),
				until: iso(until),
				leadsIn: leads.length,
				engaged: durations.length,
				inConversation: leads.filter((lead) => lead.firstSentAt && lead.wroteBack).length,
				responseTime:
					durations.length === 0
						? null
						: {
								answered: durations.length,
								medianMs: nearestRank(durations, 0.5),
								p90Ms: nearestRank(durations, 0.9),
								buckets: responseBuckets(durations),
							},
				byDay: leadsByDay(
					leads.map((lead) => lead.firstInboundAt),
					since,
					until,
					window.timeZone,
				),
			};
			return funnel;
		},

		async getCrmConnection(officeId) {
			const row = await db.crmConnection.findUnique({
				where: { officeId },
				select: { kind: true, accessToken: true },
			});
			return row ? { kind: row.kind, tokenSet: row.accessToken !== null } : null;
		},

		async getCrmAccessToken(officeId) {
			const row = await db.crmConnection.findUnique({
				where: { officeId },
				select: { accessToken: true },
			});
			return row?.accessToken ?? null;
		},

		async officeExists(officeId) {
			const office = await db.organization.findUnique({
				where: { id: officeId },
				select: { id: true },
			});
			return office !== null;
		},

		async setCrmConnection(officeId, kind, accessToken = null) {
			await db.$transaction(async (tx) => {
				// Removing the connection removes its links (cascade) and its token.
				await tx.crmConnection.deleteMany({ where: { officeId } });
				if (kind) await tx.crmConnection.create({ data: { officeId, kind, accessToken } });
			});
		},

		async replaceCrmAccessToken(officeId, kind, accessToken) {
			const { count } = await db.crmConnection.updateMany({
				where: { officeId, kind },
				data: { accessToken, accountId: null },
			});
			return count === 1;
		},

		async crmOfficesOnAccount(kind, accountId) {
			const rows = await db.crmConnection.findMany({
				where: { kind, accountId },
				select: { officeId: true },
			});
			return rows.map((row) => row.officeId);
		},

		async crmOfficesWithoutAccount(kind, limit) {
			const rows = await db.crmConnection.findMany({
				where: { kind, accountId: null },
				select: { officeId: true },
				orderBy: { updatedAt: "desc" },
				take: limit,
			});
			return rows.map((row) => row.officeId);
		},

		async setCrmAccountId(officeId, learnedWith, accountId) {
			const { count } = await db.crmConnection.updateMany({
				where: { officeId, kind: learnedWith.kind, accessToken: learnedWith.accessToken },
				data: { accountId },
			});
			return count > 0;
		},

		async claimCrmLink(officeId, conversationId) {
			const { count } = await db.crmLink.createMany({
				data: [{ conversationId, officeId }],
				skipDuplicates: true,
			});
			return count > 0;
		},

		async releaseCrmLink(officeId, conversationId) {
			await db.crmLink.deleteMany({ where: { conversationId, officeId, leadId: null } });
		},

		async completeCrmLink(officeId, conversationId, link) {
			await db.crmLink.updateMany({
				where: { conversationId, officeId },
				data: { ...link, linkedAt: new Date() },
			});
		},

		async createMockCrmLead(lead) {
			const row = await db.mockCrmLead.create({
				data: { ...lead, fields: lead.fields ?? Prisma.JsonNull },
			});
			return mapMockCrmLead(row);
		},

		async findMockCrmLeads(officeId, where = {}) {
			const rows = await db.mockCrmLead.findMany({
				where: {
					officeId,
					...(where.phone ? { phone: where.phone } : {}),
					...(where.zaloUserId ? { zaloUserId: where.zaloUserId } : {}),
					...(where.ids ? { id: { in: where.ids } } : {}),
				},
				orderBy: [{ createdAt: "asc" }, { id: "asc" }],
			});
			return rows.map(mapMockCrmLead);
		},

		async setMockCrmLeadOutcome(officeId, leadId, outcome) {
			await db.mockCrmLead.updateMany({
				where: { id: leadId, officeId },
				data: { outcome: outcome.status, outcomeAt: outcome.at, outcomeReason: outcome.reason },
			});
		},

		async crmLinksForLeads(officeId, leadIds) {
			const rows = await db.crmLink.findMany({
				where: { officeId, leadId: { in: leadIds } },
			});
			return rows.flatMap((row) => {
				const link = mapCrmLink(row);
				return link
					? [
							{
								conversationId: row.conversationId,
								leadId: link.leadId,
								outcome: link.outcome,
								outcomeAt: link.outcomeAt,
								outcomeReason: link.outcomeReason,
								outcomeObservedAt: link.outcomeObservedAt,
							},
						]
					: [];
			});
		},

		async saveCrmOutcome(officeId, conversationId, leadId, outcome) {
			// Only while the thread still links this lead: a relink meanwhile is not its outcome.
			await db.crmLink.updateMany({
				where: { conversationId, officeId, leadId },
				data: {
					outcome: outcome.outcome,
					outcomeAt: outcome.outcomeAt ? new Date(outcome.outcomeAt) : null,
					outcomeReason: outcome.outcomeReason,
					outcomeObservedAt: outcome.outcomeObservedAt ? new Date(outcome.outcomeObservedAt) : null,
				},
			});
		},

		async close() {
			await db.$disconnect();
		},
	};
}
