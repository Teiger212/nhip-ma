import fs from "node:fs";
import path from "node:path";

import { createId as cuid } from "@paralleldrive/cuid2";
import Database from "better-sqlite3";

import { ensureInboxSchema } from "./ensure-schema";
import { sqliteFilePath } from "./sqlite-path";
import type {
	Conversation,
	CribLanguage,
	Draft,
	GuestLanguage,
	InboundEvent,
	InboxStore,
	Message,
	MessageSource,
	OneShot,
	Paperwork,
	Pipe,
	Qualification,
	RentOrBuy,
	SendResult,
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

type ConversationRow = {
	id: string;
	pipe: string;
	guestId: string;
	guestName: string | null;
	language: string | null;
	lastGuestInboundAt: string | null;
	sentAt: string | null;
	updatedAt: string;
};

type MessageRow = {
	id: string;
	conversationId: string;
	direction: "in" | "out";
	source: string;
	text: string;
	at: string;
	vendorMessageId: string | null;
	mock: number;
};

type QualificationRow = {
	conversationId: string;
	areaOfInterest: string | null;
	nationality: string | null;
	inVietnamNow: number | null;
	rentOrBuy: string | null;
	timeframe: string | null;
	budgetBand: string | null;
	bedsOrHousehold: string | null;
};

type DraftRow = {
	conversationId: string;
	reply: string;
	crib: string;
	cribLanguage: string;
};

type PaperworkRow = {
	conversationId: string;
	mentioned: number;
	flag: string | null;
};

type SendRow = {
	id: string;
	conversationId: string;
	mock: number;
	pipe: string;
	to: string;
	text: string | null;
	vendorMessageId: string | null;
	at: string;
};

function toDbSource(source: MessageSource): "guest" | "oa_echo" | "nhip" {
	return source === "oa-echo" ? "oa_echo" : source;
}

function fromDbSource(source: string): MessageSource {
	return source === "oa_echo" ? "oa-echo" : (source as MessageSource);
}

function toBool(value: number | null): boolean | null {
	if (value === null || value === undefined) {
		return null;
	}
	return Boolean(value);
}

function mapMessage(row: MessageRow): Message {
	return {
		id: row.id,
		direction: row.direction,
		source: fromDbSource(row.source),
		text: row.text,
		at: new Date(row.at).toISOString(),
		vendorMessageId: row.vendorMessageId,
		mock: row.mock ? true : undefined,
	};
}

function mapQualification(row: QualificationRow): Qualification {
	return {
		areaOfInterest: row.areaOfInterest,
		nationality: row.nationality,
		inVietnamNow: toBool(row.inVietnamNow),
		rentOrBuy: (row.rentOrBuy as RentOrBuy | null) ?? null,
		timeframe: row.timeframe,
		budgetBand: row.budgetBand,
		bedsOrHousehold: row.bedsOrHousehold,
	};
}

function mapDraft(row: DraftRow): Draft {
	return {
		reply: row.reply,
		crib: row.crib,
		cribLanguage: row.cribLanguage as CribLanguage,
	};
}

function mapPaperwork(row: PaperworkRow): Paperwork {
	return {
		mentioned: Boolean(row.mentioned),
		flag: row.flag,
	};
}

function iso(value: string | null | undefined): string | null {
	return value ? new Date(value).toISOString() : null;
}

export function createInboxStore(filePath: string): InboxStore {
	const resolved = sqliteFilePath(filePath);
	fs.mkdirSync(path.dirname(resolved), { recursive: true });
	const sqlite = new Database(resolved);
	ensureInboxSchema(sqlite);

	function load(id: string): Conversation | null {
		const row = sqlite.prepare(`SELECT * FROM "Conversation" WHERE "id" = ?`).get(id) as
			| ConversationRow
			| undefined;
		if (!row) {
			return null;
		}
		const messages = sqlite
			.prepare(`SELECT * FROM "Message" WHERE "conversationId" = ? ORDER BY "at" ASC`)
			.all(id) as MessageRow[];
		const qualification = sqlite
			.prepare(`SELECT * FROM "Qualification" WHERE "conversationId" = ?`)
			.get(id) as QualificationRow | undefined;
		const draft = sqlite.prepare(`SELECT * FROM "Draft" WHERE "conversationId" = ?`).get(id) as
			| DraftRow
			| undefined;
		const paperwork = sqlite
			.prepare(`SELECT * FROM "Paperwork" WHERE "conversationId" = ?`)
			.get(id) as PaperworkRow | undefined;
		const send = sqlite
			.prepare(`SELECT * FROM "Send" WHERE "conversationId" = ? ORDER BY "at" DESC LIMIT 1`)
			.get(id) as SendRow | undefined;

		const oneShot: OneShot | null =
			row.language && qualification && draft && paperwork
				? {
						language: row.language as GuestLanguage,
						qualification: mapQualification(qualification),
						paperwork: mapPaperwork(paperwork),
						draft: mapDraft(draft),
					}
				: null;

		return {
			id: row.id,
			pipe: row.pipe as Pipe,
			guestId: row.guestId,
			guestName: row.guestName,
			messages: messages.map(mapMessage),
			lastGuestInboundAt: iso(row.lastGuestInboundAt),
			sentAt: iso(row.sentAt),
			oneShot,
			lastSend: send
				? {
						mock: Boolean(send.mock),
						pipe: send.pipe as Pipe,
						to: send.to,
						text: send.text ?? undefined,
						vendorMessageId: send.vendorMessageId,
					}
				: undefined,
			updatedAt: new Date(row.updatedAt).toISOString(),
		};
	}

	return {
		filePath: resolved,

		async listConversations() {
			const rows = sqlite
				.prepare(`SELECT "id" FROM "Conversation" ORDER BY "updatedAt" DESC`)
				.all() as Array<{ id: string }>;
			return rows
				.map((row) => load(row.id))
				.filter((conversation): conversation is Conversation => Boolean(conversation));
		},

		async getConversation(id) {
			return load(id);
		},

		async upsertInbound(event: InboundEvent) {
			const id = conversationId(event.pipe, event.guestId);
			const at = nowIso(event.at);

			const existing = sqlite.prepare(`SELECT * FROM "Conversation" WHERE "id" = ?`).get(id) as
				| ConversationRow
				| undefined;

			if (!existing) {
				sqlite
					.prepare(
						`INSERT INTO "Conversation" ("id", "pipe", "guestId", "guestName", "lastGuestInboundAt", "sentAt", "updatedAt")
             VALUES (?, ?, ?, ?, NULL, NULL, ?)`,
					)
					.run(id, event.pipe, event.guestId, event.guestName || null, at);
			} else if (event.guestName && !existing.guestName) {
				sqlite
					.prepare(`UPDATE "Conversation" SET "guestName" = ?, "updatedAt" = ? WHERE "id" = ?`)
					.run(event.guestName, at, id);
			} else {
				sqlite.prepare(`UPDATE "Conversation" SET "updatedAt" = ? WHERE "id" = ?`).run(at, id);
			}

			if (event.vendorMessageId) {
				const dup = sqlite
					.prepare(
						`SELECT "id" FROM "Message" WHERE "conversationId" = ? AND "vendorMessageId" = ?`,
					)
					.get(id, event.vendorMessageId);
				if (dup) {
					return load(id) as Conversation;
				}
			}

			const countRow = sqlite
				.prepare(`SELECT COUNT(*) as count FROM "Message" WHERE "conversationId" = ?`)
				.get(id) as { count: number };
			sqlite
				.prepare(
					`INSERT INTO "Message" ("id", "conversationId", "direction", "source", "text", "at", "vendorMessageId")
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
				)
				.run(
					`${id}:${countRow.count + 1}`,
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
				sqlite
					.prepare(
						`INSERT INTO "Draft" ("conversationId", "reply", "crib", "cribLanguage")
             VALUES (?, ?, ?, ?)
             ON CONFLICT("conversationId") DO UPDATE SET
               "reply" = excluded."reply",
               "crib" = excluded."crib",
               "cribLanguage" = excluded."cribLanguage"`,
					)
					.run(id, shot.draft.reply, shot.draft.crib, shot.draft.cribLanguage);
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

		async recordApprovedSend(id, text, sendResult: SendResult) {
			const conv = sqlite.prepare(`SELECT "id" FROM "Conversation" WHERE "id" = ?`).get(id);
			if (!conv) {
				return null;
			}
			const at = nowIso();
			const countRow = sqlite
				.prepare(`SELECT COUNT(*) as count FROM "Message" WHERE "conversationId" = ?`)
				.get(id) as { count: number };
			const write = sqlite.transaction(() => {
				sqlite
					.prepare(
						`INSERT INTO "Message" ("id", "conversationId", "direction", "source", "text", "at", "vendorMessageId", "mock")
             VALUES (?, ?, 'out', 'nhip', ?, ?, ?, ?)`,
					)
					.run(
						`${id}:${countRow.count + 1}`,
						id,
						text,
						at,
						sendResult.vendorMessageId || null,
						sendResult.mock ? 1 : 0,
					);
				sqlite
					.prepare(
						`INSERT INTO "Approval" ("id", "conversationId", "reply", "at") VALUES (?, ?, ?, ?)`,
					)
					.run(cuid(), id, text, at);
				sqlite
					.prepare(
						`INSERT INTO "Send" ("id", "conversationId", "mock", "pipe", "to", "text", "vendorMessageId", "at")
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
					)
					.run(
						cuid(),
						id,
						sendResult.mock ? 1 : 0,
						sendResult.pipe,
						sendResult.to,
						sendResult.text ?? text,
						sendResult.vendorMessageId,
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
