import fs from "node:fs";
import path from "node:path";

import { createId as cuid } from "@paralleldrive/cuid2";
import Database from "better-sqlite3";
import { z } from "zod";

import { ensureInboxSchema } from "./ensure-schema";
import {
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

export function conversationId(pipe: Pipe, guestId: string): string {
	return `${pipe}:${guestId}`;
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
	ownerUserId: z.string().nullable(),
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
	claimedAt: Timestamp.nullable(),
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

const sendRow = z.object({
	id: z.string(),
	conversationId: z.string(),
	mock: z.number(),
	pipe: Pipe,
	to: z.string(),
	text: z.string().nullable(),
	vendorMessageId: z.string().nullable(),
	answersMessageId: z.string().nullable(),
	at: Timestamp,
});

type ConversationRow = z.infer<typeof conversationRow>;
type MessageRow = z.infer<typeof messageRow>;
type TranslationRow = z.infer<typeof translationRow>;
type QualificationRow = z.infer<typeof qualificationRow>;
type DraftRow = z.infer<typeof draftRow>;
type PaperworkRow = z.infer<typeof paperworkRow>;
type SendRow = z.infer<typeof sendRow>;

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

export function createInboxStore(filePath: string): InboxStore {
	const resolved = sqliteFilePath(filePath);
	fs.mkdirSync(path.dirname(resolved), { recursive: true });
	const sqlite = new Database(resolved);
	ensureInboxSchema(sqlite);

	function answered(messageId: string): boolean {
		return Boolean(
			sqlite.prepare(`SELECT 1 FROM "Send" WHERE "answersMessageId" = ? LIMIT 1`).get(messageId),
		);
	}

	/**
	 * The single read funnel: every method that returns a `Conversation` bottoms out here,
	 * so parsing the rows once at this boundary is enough to make every `Conversation` the
	 * store hands out true. "Your turn" is derived here too, from the messages themselves:
	 * the guest spoke last and no Send answers that message.
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
		const rawSend = sqlite
			.prepare(`SELECT * FROM "Send" WHERE "conversationId" = ? ORDER BY "at" DESC LIMIT 1`)
			.get(id);
		const send: SendRow | undefined = rawSend ? parseRow(sendRow, rawSend, "Send") : undefined;

		const oneShot: OneShot | null =
			row.language && qualification && draft && paperwork
				? {
						language: row.language,
						qualification: mapQualification(qualification),
						paperwork: mapPaperwork(paperwork),
						draft: mapDraft(draft),
					}
				: null;

		const last = messages[messages.length - 1];
		const unansweredInboundId =
			last && last.direction === "in" && !answered(last.id) ? last.id : null;

		return {
			id: row.id,
			pipe: row.pipe,
			guestId: row.guestId,
			guestName: row.guestName,
			ownerUserId: row.ownerUserId,
			messages: messages.map((message) =>
				mapMessage(message, translationsByMessage.get(message.id) ?? {}),
			),
			lastGuestInboundAt: row.lastGuestInboundAt,
			sentAt: row.sentAt,
			unansweredInboundId,
			oneShot,
			lastSend: send
				? {
						mock: Boolean(send.mock),
						pipe: send.pipe,
						to: send.to,
						text: send.text ?? undefined,
						vendorMessageId: send.vendorMessageId,
					}
				: undefined,
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
								`SELECT "id" FROM "Conversation" WHERE "ownerUserId" IS NULL OR "ownerUserId" = ? ORDER BY "updatedAt" DESC`,
							)
							.all(viewer.userId)
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
			if (viewer && conversation.ownerUserId && conversation.ownerUserId !== viewer.userId) {
				return null;
			}
			return conversation;
		},

		async upsertInbound(event: InboundEvent) {
			const id = conversationId(event.pipe, event.guestId);
			const at = nowIso(event.at);
			const owner = event.ownerUserId ?? null;

			const write = sqlite.transaction(() => {
				// Existence is the only question here, so this row is never read as a shape.
				const existing = sqlite.prepare(`SELECT "id" FROM "Conversation" WHERE "id" = ?`).get(id);

				if (!existing) {
					sqlite
						.prepare(
							`INSERT INTO "Conversation" ("id", "pipe", "guestId", "guestName", "ownerUserId", "lastGuestInboundAt", "sentAt", "updatedAt")
             VALUES (?, ?, ?, ?, ?, NULL, NULL, ?)`,
						)
						.run(id, event.pipe, event.guestId, event.guestName || null, owner, at);
				} else {
					sqlite
						.prepare(
							`UPDATE "Conversation" SET
                 "guestName" = COALESCE("guestName", ?),
                 "ownerUserId" = COALESCE("ownerUserId", ?),
                 "updatedAt" = ?
               WHERE "id" = ?`,
						)
						.run(event.guestName || null, owner, at, id);
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
						`INSERT INTO "Message" ("id", "conversationId", "direction", "source", "text", "at", "vendorMessageId")
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
					)
					.run(
						cuid(),
						id,
						event.source === "guest" ? "in" : "out",
						toDbSource(event.source),
						event.text,
						at,
						event.vendorMessageId || null,
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

		async claimSend(messageId) {
			const result = sqlite
				.prepare(
					`UPDATE "Message" SET "claimedAt" = ? WHERE "id" = ? AND "direction" = 'in' AND "claimedAt" IS NULL
             AND NOT EXISTS (SELECT 1 FROM "Send" WHERE "Send"."answersMessageId" = "Message"."id")`,
				)
				.run(nowIso(), messageId);
			return result.changes === 1;
		},

		async releaseSend(messageId) {
			sqlite
				.prepare(
					`UPDATE "Message" SET "claimedAt" = NULL WHERE "id" = ?
             AND NOT EXISTS (SELECT 1 FROM "Send" WHERE "Send"."answersMessageId" = "Message"."id")`,
				)
				.run(messageId);
		},

		async recordApprovedSend(id, text, sendResult: SendResult, answersMessageId) {
			const conv = sqlite.prepare(`SELECT "id" FROM "Conversation" WHERE "id" = ?`).get(id);
			if (!conv) {
				return null;
			}
			const at = nowIso();
			const write = sqlite.transaction(() => {
				sqlite
					.prepare(
						`INSERT INTO "Message" ("id", "conversationId", "direction", "source", "text", "at", "vendorMessageId", "mock")
             VALUES (?, ?, 'out', 'nhip', ?, ?, ?, ?)`,
					)
					.run(cuid(), id, text, at, sendResult.vendorMessageId || null, sendResult.mock ? 1 : 0);
				sqlite
					.prepare(
						`INSERT INTO "Approval" ("id", "conversationId", "reply", "answersMessageId", "at") VALUES (?, ?, ?, ?, ?)`,
					)
					.run(cuid(), id, text, answersMessageId, at);
				sqlite
					.prepare(
						`INSERT INTO "Send" ("id", "conversationId", "mock", "pipe", "to", "text", "vendorMessageId", "answersMessageId", "at")
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
					)
					.run(
						cuid(),
						id,
						sendResult.mock ? 1 : 0,
						sendResult.pipe,
						sendResult.to,
						sendResult.text ?? text,
						sendResult.vendorMessageId,
						answersMessageId,
						at,
					);
				sqlite
					.prepare(`UPDATE "Conversation" SET "sentAt" = ?, "updatedAt" = ? WHERE "id" = ?`)
					.run(at, at, id);
			});
			write();
			return load(id);
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
