import fs from "node:fs";
import path from "node:path";

import { createId as cuid } from "@paralleldrive/cuid2";
import Database from "better-sqlite3";
import { z } from "zod";

import { ensureInboxSchema } from "./ensure-schema";
import {
	AnswerStatus,
	DbMessageSource,
	DraftSource,
	GuestLanguage,
	MessageDirection,
	MessageSource,
	OperatorLanguage,
	Pipe,
	RentOrBuy,
	Timestamp,
} from "./schema";
import { sqliteFilePath } from "./sqlite-path";
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
	Paperwork,
	Qualification,
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
 * same guest writing to two offices is two threads that never see each other. Threads
 * from before tenancy keep their old `pipe:guest` ids; the unique index is on the triple,
 * not on the id's shape.
 */
export function conversationId(officeId: string, pipe: Pipe, guestId: string): string {
	return `${officeId}:${pipe}:${guestId}`;
}

/**
 * Row shapes as SQLite hands them back. Declaring them as schemas rather than as bare
 * TypeScript types is what lets `load()` check a row instead of asserting one: the type
 * is inferred from the schema, so it can no longer describe a row the parse would reject.
 * SQLite has no BOOLEAN, so `mock`/`mentioned`/`inVietnamNow` arrive as 0/1 numbers.
 */
const conversationRow = z.object({
	id: z.string(),
	pipe: Pipe,
	guestId: z.string(),
	guestName: z.string().nullable(),
	officeId: z.string().nullable(),
	language: GuestLanguage.nullable(),
	lastGuestInboundAt: Timestamp.nullable(),
	sentAt: Timestamp.nullable(),
	updatedAt: Timestamp,
});

const messageRow = z.object({
	id: z.string(),
	conversationId: z.string(),
	direction: MessageDirection,
	source: DbMessageSource,
	text: z.string(),
	at: Timestamp,
	vendorMessageId: z.string().nullable(),
	mock: z.number(),
	pipeExternalId: z.string().nullable(),
});

const pipeConnectionRow = z.object({
	pipe: Pipe,
	externalId: z.string(),
	officeId: z.string(),
});

const translationRow = z.object({
	messageId: z.string(),
	locale: OperatorLanguage,
	text: z.string(),
});

const qualificationRow = z.object({
	conversationId: z.string(),
	areaOfInterest: z.string().nullable(),
	nationality: z.string().nullable(),
	inVietnamNow: z.number().nullable(),
	rentOrBuy: RentOrBuy.nullable(),
	timeframe: z.string().nullable(),
	budgetBand: z.string().nullable(),
	bedsOrHousehold: z.string().nullable(),
});

const draftRow = z.object({
	conversationId: z.string(),
	reply: z.string(),
	answersMessageId: z.string().nullable(),
	source: DraftSource,
});

const paperworkRow = z.object({
	conversationId: z.string(),
	mentioned: z.number(),
	flag: z.string().nullable(),
});

const answerRow = z.object({
	id: z.string(),
	conversationId: z.string(),
	inboundId: z.string(),
	text: z.string(),
	operatorId: z.string().nullable(),
	status: AnswerStatus,
	mock: z.number(),
	pipe: Pipe,
	to: z.string(),
	pipeExternalId: z.string().nullable(),
	vendorMessageId: z.string().nullable(),
	approvedAt: Timestamp,
	sentAt: Timestamp.nullable(),
	failedAt: Timestamp.nullable(),
	failureReason: z.string().nullable(),
});

type ConversationRow = z.infer<typeof conversationRow>;
type MessageRow = z.infer<typeof messageRow>;
type TranslationRow = z.infer<typeof translationRow>;
type QualificationRow = z.infer<typeof qualificationRow>;
type DraftRow = z.infer<typeof draftRow>;
type PaperworkRow = z.infer<typeof paperworkRow>;
type AnswerRow = z.infer<typeof answerRow>;

/**
 * This store is the only writer of these rows, so a row that fails to parse is corrupt
 * state rather than untrusted input. Fail loudly at the read instead of letting a value
 * the vocabulary does not contain flow into the domain typed as though it did.
 */
function parseRow<Schema extends z.ZodType>(
	schema: Schema,
	row: unknown,
	table: string,
): z.infer<Schema> {
	const parsed = schema.safeParse(row);
	if (!parsed.success) {
		throw new Error(
			`Inbox store: "${table}" row does not match the expected shape. The SQLite file is corrupt or was written by an older version.\n${z.prettifyError(parsed.error)}`,
		);
	}
	return parsed.data;
}

function toDbSource(source: MessageSource): DbMessageSource {
	return source === "oa-echo" ? "oa_echo" : source;
}

function fromDbSource(source: DbMessageSource): MessageSource {
	return source === "oa_echo" ? "oa-echo" : source;
}

function toBool(value: number | null): boolean | null {
	if (value === null || value === undefined) {
		return null;
	}
	return Boolean(value);
}

function mapMessage(row: MessageRow, translations: Translations): Message {
	return {
		id: row.id,
		direction: row.direction,
		source: fromDbSource(row.source),
		text: row.text,
		at: row.at,
		vendorMessageId: row.vendorMessageId,
		mock: row.mock ? true : undefined,
		pipeExternalId: row.pipeExternalId,
		translations,
	};
}

function mapQualification(row: QualificationRow): Qualification {
	return {
		areaOfInterest: row.areaOfInterest,
		nationality: row.nationality,
		inVietnamNow: toBool(row.inVietnamNow),
		rentOrBuy: row.rentOrBuy,
		timeframe: row.timeframe,
		budgetBand: row.budgetBand,
		bedsOrHousehold: row.bedsOrHousehold,
	};
}

function mapDraft(row: DraftRow): Draft {
	return { reply: row.reply, answersMessageId: row.answersMessageId, source: row.source };
}

function mapPaperwork(row: PaperworkRow): Paperwork {
	return {
		mentioned: Boolean(row.mentioned),
		flag: row.flag,
	};
}

function mapAnswer(row: AnswerRow): Answer {
	return {
		id: row.id,
		conversationId: row.conversationId,
		inboundId: row.inboundId,
		text: row.text,
		operatorId: row.operatorId,
		status: row.status,
		mock: Boolean(row.mock),
		pipe: row.pipe,
		to: row.to,
		pipeExternalId: row.pipeExternalId,
		vendorMessageId: row.vendorMessageId,
		approvedAt: row.approvedAt,
		sentAt: row.sentAt,
		failedAt: row.failedAt,
		failureReason: row.failureReason,
	};
}

/** An Answer that counts as the office's reply: in flight, delivered, or possibly delivered. */
const ANSWERING_STATUSES: readonly AnswerStatus[] = ["sending", "sent", "unknown"];

export function createInboxStore(filePath: string): InboxStore {
	const resolved = sqliteFilePath(filePath);
	fs.mkdirSync(path.dirname(resolved), { recursive: true });
	const sqlite = new Database(resolved);
	ensureInboxSchema(sqlite);

	function loadAnswer(answerId: string): AnswerRow | null {
		const raw = sqlite.prepare(`SELECT * FROM "Answer" WHERE "id" = ?`).get(answerId);
		return raw ? parseRow(answerRow, raw, "Answer") : null;
	}

	/**
	 * The single read funnel: every method that returns a `Conversation` bottoms out here,
	 * so parsing the rows once at this boundary is enough to make every `Conversation` the
	 * store hands out true. "Your turn" is derived here too (ADR 0011): the guest's latest
	 * message is unanswered unless an Answer is in flight, sent or of unknown outcome for
	 * it, or the agent replied from the OA app after it. Message order alone does not
	 * decide, so a guest message that lands mid-send is not hidden by the outbound that
	 * answers an earlier one.
	 */
	function load(id: string): Conversation | null {
		const rawRow = sqlite.prepare(`SELECT * FROM "Conversation" WHERE "id" = ?`).get(id);
		if (!rawRow) {
			return null;
		}
		const row: ConversationRow = parseRow(conversationRow, rawRow, "Conversation");
		const messages: MessageRow[] = parseRow(
			z.array(messageRow),
			sqlite
				.prepare(
					`SELECT * FROM "Message" WHERE "conversationId" = ? ORDER BY "at" ASC, "rowid" ASC`,
				)
				.all(id),
			"Message",
		);
		const translations: TranslationRow[] = parseRow(
			z.array(translationRow),
			sqlite
				.prepare(
					`SELECT "Translation".* FROM "Translation"
           JOIN "Message" ON "Message"."id" = "Translation"."messageId"
           WHERE "Message"."conversationId" = ?`,
				)
				.all(id),
			"Translation",
		);
		const translationsByMessage = new Map<string, Translations>();
		for (const translation of translations) {
			const existing = translationsByMessage.get(translation.messageId) ?? {};
			existing[translation.locale] = translation.text;
			translationsByMessage.set(translation.messageId, existing);
		}
		const rawQualification = sqlite
			.prepare(`SELECT * FROM "Qualification" WHERE "conversationId" = ?`)
			.get(id);
		const qualification: QualificationRow | undefined = rawQualification
			? parseRow(qualificationRow, rawQualification, "Qualification")
			: undefined;
		const rawDraft = sqlite.prepare(`SELECT * FROM "Draft" WHERE "conversationId" = ?`).get(id);
		const draft: DraftRow | undefined = rawDraft
			? parseRow(draftRow, rawDraft, "Draft")
			: undefined;
		const rawPaperwork = sqlite
			.prepare(`SELECT * FROM "Paperwork" WHERE "conversationId" = ?`)
			.get(id);
		const paperwork: PaperworkRow | undefined = rawPaperwork
			? parseRow(paperworkRow, rawPaperwork, "Paperwork")
			: undefined;
		const answers: AnswerRow[] = parseRow(
			z.array(answerRow),
			sqlite
				.prepare(
					`SELECT * FROM "Answer" WHERE "conversationId" = ? ORDER BY "approvedAt" ASC, "rowid" ASC`,
				)
				.all(id),
			"Answer",
		);

		const oneShot: OneShot | null =
			row.language && qualification && draft && paperwork
				? {
						language: row.language,
						qualification: mapQualification(qualification),
						paperwork: mapPaperwork(paperwork),
						draft: mapDraft(draft),
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
					.some((later) => later.direction === "out" && later.source === "oa_echo");
				unansweredInboundId = answered || echoedAfter ? null : message.id;
				break;
			}
		}

		return {
			id: row.id,
			pipe: row.pipe,
			guestId: row.guestId,
			guestName: row.guestName,
			officeId: row.officeId,
			messages: messages.map((message) =>
				mapMessage(message, translationsByMessage.get(message.id) ?? {}),
			),
			lastGuestInboundAt: row.lastGuestInboundAt,
			sentAt: row.sentAt,
			unansweredInboundId,
			oneShot,
			answers: answers.map(mapAnswer),
			lastAnswer: answers.length > 0 ? mapAnswer(answers[answers.length - 1]) : null,
			updatedAt: row.updatedAt,
		};
	}

	function upsertDraft(id: string, draft: Draft): void {
		sqlite
			.prepare(
				`INSERT INTO "Draft" ("conversationId", "reply", "answersMessageId", "source")
         VALUES (?, ?, ?, ?)
         ON CONFLICT("conversationId") DO UPDATE SET
           "reply" = excluded."reply",
           "answersMessageId" = excluded."answersMessageId",
           "source" = excluded."source"`,
			)
			.run(id, draft.reply, draft.answersMessageId, draft.source);
	}

	return {
		filePath: resolved,

		async listConversations(viewer?: InboxViewer) {
			const rows = (
				viewer
					? sqlite
							.prepare(
								`SELECT "id" FROM "Conversation" WHERE "officeId" = ? ORDER BY "updatedAt" DESC`,
							)
							.all(viewer.officeId)
					: sqlite.prepare(`SELECT "id" FROM "Conversation" ORDER BY "updatedAt" DESC`).all()
			) as Array<{ id: string }>;
			return rows
				.map((row) => load(row.id))
				.filter((conversation): conversation is Conversation => Boolean(conversation));
		},

		async getConversation(id, viewer?: InboxViewer) {
			const conversation = load(id);
			if (!conversation) {
				return null;
			}
			if (viewer && conversation.officeId !== viewer.officeId) {
				return null;
			}
			return conversation;
		},

		async upsertInbound(event: InboundEvent, officeId: string) {
			const at = nowIso(event.at);
			let id = conversationId(officeId, event.pipe, event.guestId);

			const write = sqlite.transaction(() => {
				// The thread is found by (office, pipe, guest), never by the id's shape, so a
				// pre-tenancy thread that was adopted by this office is the same thread.
				const existing = sqlite
					.prepare(
						`SELECT "id" FROM "Conversation" WHERE "officeId" = ? AND "pipe" = ? AND "guestId" = ?`,
					)
					.get(officeId, event.pipe, event.guestId) as { id: string } | undefined;
				if (existing) {
					id = existing.id;
				}

				if (!existing) {
					sqlite
						.prepare(
							`INSERT INTO "Conversation" ("id", "pipe", "guestId", "guestName", "officeId", "lastGuestInboundAt", "sentAt", "updatedAt")
             VALUES (?, ?, ?, ?, ?, NULL, NULL, ?)`,
						)
						.run(id, event.pipe, event.guestId, event.guestName || null, officeId, at);
				} else {
					sqlite
						.prepare(
							`UPDATE "Conversation" SET
                 "guestName" = COALESCE("guestName", ?),
                 "updatedAt" = ?
               WHERE "id" = ?`,
						)
						.run(event.guestName || null, at, id);
				}

				if (event.vendorMessageId) {
					const dup = sqlite
						.prepare(
							`SELECT "id" FROM "Message" WHERE "conversationId" = ? AND "vendorMessageId" = ?`,
						)
						.get(id, event.vendorMessageId);
					if (dup) {
						return;
					}
				}

				sqlite
					.prepare(
						`INSERT INTO "Message" ("id", "conversationId", "direction", "source", "text", "at", "vendorMessageId", "pipeExternalId")
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
					)
					.run(
						cuid(),
						id,
						event.source === "guest" ? "in" : "out",
						toDbSource(event.source),
						event.text,
						at,
						event.vendorMessageId || null,
						event.pipeExternalId ?? null,
					);

				if (event.source === "guest") {
					sqlite
						.prepare(
							`UPDATE "Conversation" SET "lastGuestInboundAt" = ?, "updatedAt" = ? WHERE "id" = ?`,
						)
						.run(at, at, id);
				}
			});
			write();

			return load(id) as Conversation;
		},

		async setOneShot(id, shot: OneShot) {
			const conv = sqlite.prepare(`SELECT "id" FROM "Conversation" WHERE "id" = ?`).get(id);
			if (!conv) {
				return null;
			}
			const q = shot.qualification;
			const now = nowIso();
			const upsert = sqlite.transaction(() => {
				sqlite
					.prepare(
						`INSERT INTO "Qualification" ("conversationId", "areaOfInterest", "nationality", "inVietnamNow", "rentOrBuy", "timeframe", "budgetBand", "bedsOrHousehold")
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)
             ON CONFLICT("conversationId") DO UPDATE SET
               "areaOfInterest" = excluded."areaOfInterest",
               "nationality" = excluded."nationality",
               "inVietnamNow" = excluded."inVietnamNow",
               "rentOrBuy" = excluded."rentOrBuy",
               "timeframe" = excluded."timeframe",
               "budgetBand" = excluded."budgetBand",
               "bedsOrHousehold" = excluded."bedsOrHousehold"`,
					)
					.run(
						id,
						q.areaOfInterest,
						q.nationality,
						q.inVietnamNow === null ? null : q.inVietnamNow ? 1 : 0,
						q.rentOrBuy,
						q.timeframe,
						q.budgetBand,
						q.bedsOrHousehold,
					);
				upsertDraft(id, shot.draft);
				sqlite
					.prepare(
						`INSERT INTO "Paperwork" ("conversationId", "mentioned", "flag")
             VALUES (?, ?, ?)
             ON CONFLICT("conversationId") DO UPDATE SET
               "mentioned" = excluded."mentioned",
               "flag" = excluded."flag"`,
					)
					.run(id, shot.paperwork.mentioned ? 1 : 0, shot.paperwork.flag);
				sqlite
					.prepare(`UPDATE "Conversation" SET "language" = ?, "updatedAt" = ? WHERE "id" = ?`)
					.run(shot.language, now, id);
			});
			upsert();
			return load(id);
		},

		async setDraft(id, draft: Draft) {
			const conv = sqlite.prepare(`SELECT "id" FROM "Conversation" WHERE "id" = ?`).get(id);
			if (!conv) {
				return null;
			}
			upsertDraft(id, draft);
			return load(id);
		},

		async setTranslation(messageId, locale, text) {
			sqlite
				.prepare(
					`INSERT INTO "Translation" ("messageId", "locale", "text") VALUES (?, ?, ?)
           ON CONFLICT("messageId", "locale") DO UPDATE SET "text" = excluded."text"`,
				)
				.run(messageId, locale, text);
		},

		async beginAnswer(input) {
			const begin = sqlite.transaction((): BeginAnswerResult => {
				const inbound = sqlite
					.prepare(
						`SELECT "Message"."direction", "Message"."pipeExternalId", "Conversation"."pipe", "Conversation"."guestId"
             FROM "Message" JOIN "Conversation" ON "Conversation"."id" = "Message"."conversationId"
             WHERE "Message"."id" = ? AND "Message"."conversationId" = ?`,
					)
					.get(input.inboundId, input.conversationId) as
					| { direction: string; pipeExternalId: string | null; pipe: Pipe; guestId: string }
					| undefined;
				if (!inbound || inbound.direction !== "in") {
					throw new Error("Inbox store: beginAnswer needs a guest message on this thread.");
				}
				const rawExisting = sqlite
					.prepare(`SELECT * FROM "Answer" WHERE "inboundId" = ?`)
					.get(input.inboundId);
				const existing = rawExisting ? parseRow(answerRow, rawExisting, "Answer") : null;
				const now = nowIso();
				if (existing) {
					if (existing.status === "sent") return { ok: false, reason: "already_answered" };
					if (existing.status === "sending") return { ok: false, reason: "in_progress" };
					if (existing.status === "unknown") return { ok: false, reason: "unknown" };
					// A definite failure is retried on the same row: one Answer per inbound, always.
					sqlite
						.prepare(
							`UPDATE "Answer" SET "status" = 'sending', "text" = ?, "operatorId" = ?, "approvedAt" = ?,
                 "failedAt" = NULL, "failureReason" = NULL, "vendorMessageId" = NULL
               WHERE "id" = ?`,
						)
						.run(input.text, input.operatorId, now, existing.id);
					return { ok: true, answer: mapAnswer(loadAnswer(existing.id) as AnswerRow) };
				}
				const id = cuid();
				sqlite
					.prepare(
						`INSERT INTO "Answer" ("id", "conversationId", "inboundId", "text", "operatorId", "status", "mock", "pipe", "to", "pipeExternalId", "vendorMessageId", "approvedAt")
             VALUES (?, ?, ?, ?, ?, 'sending', 0, ?, ?, ?, NULL, ?)`,
					)
					.run(
						id,
						input.conversationId,
						input.inboundId,
						input.text,
						input.operatorId,
						inbound.pipe,
						inbound.guestId,
						inbound.pipeExternalId,
						now,
					);
				return { ok: true, answer: mapAnswer(loadAnswer(id) as AnswerRow) };
			});
			try {
				return begin();
			} catch (error) {
				// Two approvals in the same instant: the unique index on inboundId lets one in.
				if (
					error instanceof Error &&
					/UNIQUE constraint failed: Answer\.inboundId/.test(error.message)
				) {
					return { ok: false, reason: "in_progress" };
				}
				throw error;
			}
		},

		async completeAnswer(answerId, result: SendResult) {
			const answer = loadAnswer(answerId);
			if (!answer) {
				return null;
			}
			if (answer.status !== "sending") {
				throw new Error(`Inbox store: completeAnswer on an Answer that is ${answer.status}.`);
			}
			const at = nowIso();
			const write = sqlite.transaction(() => {
				sqlite
					.prepare(
						`UPDATE "Answer" SET "status" = 'sent', "sentAt" = ?, "mock" = ?, "vendorMessageId" = ?, "to" = ? WHERE "id" = ?`,
					)
					.run(at, result.mock ? 1 : 0, result.vendorMessageId, result.to, answerId);
				sqlite
					.prepare(
						`INSERT INTO "Message" ("id", "conversationId", "direction", "source", "text", "at", "vendorMessageId", "mock", "pipeExternalId")
             VALUES (?, ?, 'out', 'nhip', ?, ?, ?, ?, ?)`,
					)
					.run(
						cuid(),
						answer.conversationId,
						answer.text,
						at,
						result.vendorMessageId || null,
						result.mock ? 1 : 0,
						answer.pipeExternalId,
					);
				sqlite
					.prepare(`UPDATE "Conversation" SET "sentAt" = ?, "updatedAt" = ? WHERE "id" = ?`)
					.run(at, at, answer.conversationId);
			});
			write();
			return load(answer.conversationId);
		},

		async failAnswer(answerId, reason) {
			sqlite
				.prepare(
					`UPDATE "Answer" SET "status" = 'failed', "failedAt" = ?, "failureReason" = ? WHERE "id" = ? AND "status" = 'sending'`,
				)
				.run(nowIso(), reason, answerId);
		},

		async markAnswerUnknown(answerId, reason) {
			sqlite
				.prepare(
					`UPDATE "Answer" SET "status" = 'unknown', "failedAt" = ?, "failureReason" = ? WHERE "id" = ? AND "status" = 'sending'`,
				)
				.run(nowIso(), reason, answerId);
		},

		async adoptUnownedThreads(officeId) {
			// A pre-tenancy thread whose guest already has a thread in this office cannot be
			// adopted without merging two histories; it is left unowned and reported.
			const result = sqlite
				.prepare(
					`UPDATE "Conversation" SET "officeId" = ? WHERE "officeId" IS NULL
             AND NOT EXISTS (
               SELECT 1 FROM "Conversation" AS "owned"
               WHERE "owned"."officeId" = ? AND "owned"."pipe" = "Conversation"."pipe" AND "owned"."guestId" = "Conversation"."guestId"
             )`,
				)
				.run(officeId, officeId);
			return result.changes;
		},

		async connectPipe(connection) {
			sqlite
				.prepare(
					`INSERT INTO "PipeConnection" ("pipe", "externalId", "officeId") VALUES (?, ?, ?)
           ON CONFLICT("pipe", "externalId") DO UPDATE SET "officeId" = excluded."officeId"`,
				)
				.run(connection.pipe, connection.externalId, connection.officeId);
		},

		async officeForPipe(pipe, externalId) {
			const raw = sqlite
				.prepare(`SELECT * FROM "PipeConnection" WHERE "pipe" = ? AND "externalId" = ?`)
				.get(pipe, externalId);
			return raw ? parseRow(pipeConnectionRow, raw, "PipeConnection").officeId : null;
		},

		async listPipeConnections() {
			return parseRow(
				z.array(pipeConnectionRow),
				sqlite.prepare(`SELECT * FROM "PipeConnection" ORDER BY "pipe", "externalId"`).all(),
				"PipeConnection",
			);
		},

		async guestInboundText(id) {
			const messages = sqlite
				.prepare(
					`SELECT "text" FROM "Message" WHERE "conversationId" = ? AND "source" = 'guest' ORDER BY "at" ASC`,
				)
				.all(id) as Array<{ text: string }>;
			return messages.map((message) => message.text).join("\n");
		},

		async close() {
			sqlite.close();
		},
	};
}

/** @deprecated Use createInboxStore */
export const createStore = createInboxStore;
