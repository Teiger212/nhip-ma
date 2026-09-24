import { createId as cuid } from "@paralleldrive/cuid2";
import { z } from "zod";

import type { Prisma, PrismaClient } from "../prisma/generated/client";
import { operatorNameOf } from "../prisma/queries/operators";
import {
	AnswerStatus,
	DbMessageSource,
	type Funnel,
	GuestLanguage,
	MessageSource,
	OperatorLanguage,
	RentOrBuy,
} from "./schema";
import type {
	Answer,
	BeginAnswerResult,
	Conversation,
	Draft,
	InboundEvent,
	InboxStore,
	InboxViewer,
	Message,
	OneShot,
	SendResult,
	Translations,
} from "./types";

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

/**
 * One thread per guest per office (ADR 0010). The office is part of the identity, so the
 * same guest writing to two offices is two threads that never see each other. The id is
 * part of every route, so it keeps this shape; the unique key is the triple.
 */
export function conversationId(officeId: string, pipe: string, guestId: string): string {
	return `${officeId}:${pipe}:${guestId}`;
}

/** Everything a `Conversation` is built from, in one read. */
const CONVERSATION_INCLUDE = {
	messages: { orderBy: [{ at: "asc" }, { seq: "asc" }], include: { translations: true } },
	qualification: true,
	draft: true,
	paperwork: true,
	answers: { orderBy: [{ approvedAt: "asc" }, { seq: "asc" }] },
} satisfies Prisma.ConversationInclude;

type ConversationRecord = Prisma.ConversationGetPayload<{ include: typeof CONVERSATION_INCLUDE }>;
type MessageRecord = ConversationRecord["messages"][number];
type AnswerRecord = ConversationRecord["answers"][number];
type Db = PrismaClient | Prisma.TransactionClient;

/** An Answer that counts as the office's reply: in flight, delivered, or possibly delivered. */
const ANSWERING_STATUSES: readonly AnswerStatus[] = ["sending", "sent", "unknown"];

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
		to: row.to,
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

export function createInboxStore(db: PrismaClient): InboxStore {
	async function load(id: string, client: Db = db): Promise<Conversation | null> {
		const record = await client.conversation.findUnique({
			where: { id },
			include: CONVERSATION_INCLUDE,
		});
		return record ? mapConversation(record) : null;
	}

	async function exists(id: string): Promise<boolean> {
		return (await db.conversation.count({ where: { id } })) > 0;
	}

	return {
		async listConversations(viewer?: InboxViewer) {
			const records = await db.conversation.findMany({
				where: viewer ? { officeId: viewer.officeId } : undefined,
				orderBy: { updatedAt: "desc" },
				include: CONVERSATION_INCLUDE,
			});
			return records.map(mapConversation);
		},

		async getConversation(id, viewer?: InboxViewer) {
			const conversation = await load(id);
			if (!conversation) {
				return null;
			}
			if (viewer && conversation.officeId !== viewer.officeId) {
				return null;
			}
			return conversation;
		},

		async upsertInbound(event: InboundEvent, officeId: string) {
			const at = new Date(nowIso(event.at));
			const id = await db.$transaction(async (tx) => {
				// The thread is found by (office, pipe, guest), never by the id's shape.
				const existing = await tx.conversation.findUnique({
					where: { officeId_pipe_guestId: { officeId, pipe: event.pipe, guestId: event.guestId } },
					select: { id: true, guestName: true },
				});
				const threadId = existing?.id ?? conversationId(officeId, event.pipe, event.guestId);
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

				if (event.vendorMessageId) {
					const duplicate = await tx.message.findFirst({
						where: { conversationId: threadId, vendorMessageId: event.vendorMessageId },
						select: { id: true },
					});
					if (duplicate) {
						return threadId;
					}
				}

				await tx.message.create({
					data: {
						id: cuid(),
						conversationId: threadId,
						direction: event.source === "guest" ? "in" : "out",
						source: toDbSource(event.source),
						text: event.text,
						at,
						vendorMessageId: event.vendorMessageId || null,
						pipeExternalId: event.pipeExternalId ?? null,
					},
				});

				if (event.source === "guest") {
					await tx.conversation.update({
						where: { id: threadId },
						data: { lastGuestInboundAt: at, updatedAt: at },
					});
				}
				return threadId;
			});
			return (await load(id)) as Conversation;
		},

		async setOneShot(id, shot: OneShot) {
			if (!(await exists(id))) {
				return null;
			}
			const q = shot.qualification;
			const paperwork = { mentioned: shot.paperwork.mentioned, flag: shot.paperwork.flag };
			await db.$transaction([
				db.qualification.upsert({
					where: { conversationId: id },
					create: { conversationId: id, ...q },
					update: { ...q },
				}),
				db.draft.upsert({
					where: { conversationId: id },
					create: { conversationId: id, ...shot.draft },
					update: { ...shot.draft },
				}),
				db.paperwork.upsert({
					where: { conversationId: id },
					create: { conversationId: id, ...paperwork },
					update: paperwork,
				}),
				db.conversation.update({
					where: { id },
					data: { language: shot.language, updatedAt: new Date() },
				}),
			]);
			return load(id);
		},

		async setDraft(id, draft: Draft) {
			if (!(await exists(id))) {
				return null;
			}
			await db.draft.upsert({
				where: { conversationId: id },
				create: { conversationId: id, ...draft },
				update: { ...draft },
			});
			return load(id);
		},

		async setTranslation(messageId, locale, text) {
			await db.translation.upsert({
				where: { messageId_locale: { messageId, locale } },
				create: { messageId, locale, text },
				update: { text },
			});
		},

		async beginAnswer(input) {
			try {
				return await db.$transaction(async (tx): Promise<BeginAnswerResult> => {
					const inbound = await tx.message.findFirst({
						where: { id: input.inboundId, conversationId: input.conversationId },
						select: {
							direction: true,
							pipeExternalId: true,
							conversation: { select: { pipe: true, guestId: true } },
						},
					});
					if (!inbound || inbound.direction !== "in") {
						throw new Error("Inbox store: beginAnswer needs a guest message on this thread.");
					}
					const existing = await tx.answer.findUnique({ where: { inboundId: input.inboundId } });
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
						const retried = await tx.answer.update({
							where: { id: existing.id },
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
						return { ok: true, answer: mapAnswer(retried) };
					}
					const created = await tx.answer.create({
						data: {
							id: cuid(),
							conversationId: input.conversationId,
							inboundId: input.inboundId,
							text: input.text,
							operatorId: input.operatorId,
							operatorName,
							status: "sending",
							pipe: inbound.conversation.pipe,
							to: inbound.conversation.guestId,
							pipeExternalId: inbound.pipeExternalId,
							approvedAt: now,
						},
					});
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

		async completeAnswer(answerId, result: SendResult) {
			const answer = await db.answer.findUnique({ where: { id: answerId } });
			if (!answer) {
				return null;
			}
			if (answer.status !== "sending") {
				throw new Error(`Inbox store: completeAnswer on an Answer that is ${answer.status}.`);
			}
			const at = new Date();
			await db.$transaction([
				db.answer.update({
					where: { id: answerId },
					data: {
						status: "sent",
						sentAt: at,
						mock: result.mock,
						vendorMessageId: result.vendorMessageId,
						to: result.to,
					},
				}),
				db.message.create({
					data: {
						id: cuid(),
						conversationId: answer.conversationId,
						direction: "out",
						source: "nhip",
						text: answer.text,
						at,
						vendorMessageId: result.vendorMessageId || null,
						mock: result.mock,
						pipeExternalId: answer.pipeExternalId,
					},
				}),
				db.conversation.update({
					where: { id: answer.conversationId },
					data: { sentAt: at, updatedAt: at },
				}),
			]);
			return load(answer.conversationId);
		},

		async failAnswer(answerId, reason) {
			await db.answer.updateMany({
				where: { id: answerId, status: "sending" },
				data: { status: "failed", failedAt: new Date(), failureReason: reason },
			});
		},

		async markAnswerUnknown(answerId, reason) {
			await db.answer.updateMany({
				where: { id: answerId, status: "sending" },
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

		async guestInboundText(id) {
			const messages = await db.message.findMany({
				where: { conversationId: id, source: "guest" },
				orderBy: [{ at: "asc" }, { seq: "asc" }],
				select: { text: true },
			});
			return messages.map((message) => message.text).join("\n");
		},

		async funnel(viewer, window) {
			const since = new Date(nowIso(window.since));
			const until = new Date();
			// One row per cohort lead, never per message; the percentiles are the only thing
			// left for JavaScript.
			const leads = await db.$queryRaw<
				Array<{ firstInboundAt: Date; firstSentAt: Date | null; wroteBack: boolean }>
			>`
				WITH "first" AS (
					SELECT "conversationId", MIN("at") AS "firstInboundAt"
					FROM "inbox_message" WHERE "direction" = 'in' GROUP BY "conversationId"
				),
				"reached" AS (
					SELECT "conversationId", MIN("sentAt") AS "firstSentAt"
					FROM "inbox_answer" WHERE "status" = 'sent' GROUP BY "conversationId"
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
				WHERE "c"."officeId" = ${viewer.officeId} AND "first"."firstInboundAt" >= ${since}
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
							},
			};
			return funnel;
		},

		async close() {
			await db.$disconnect();
		},
	};
}
