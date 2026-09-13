import type { GuestLanguage, MessageDirection, MessageSource, Pipe, RentOrBuy } from "./schema";

/**
 * The vocabulary is declared once, in `./schema`, and reaches consumers through
 * `./index`. This module only borrows the inferred types to describe the shapes below —
 * it deliberately does not re-export them, so the member lists appear in exactly one file.
 */

/**
 * Not persisted and never parsed from an untrusted string in this package, so it stays a
 * hand-written union: an enum nothing validates with would be ceremony, not safety. If
 * `runtime.ts` ever starts checking the `SEND_MODE` env var, promote it to `./schema`.
 */
export type SendMode = "mock" | "live";

export type Qualification = {
	areaOfInterest: string | null;
	nationality: string | null;
	inVietnamNow: boolean | null;
	rentOrBuy: RentOrBuy | null;
	timeframe: string | null;
	budgetBand: string | null;
	bedsOrHousehold: string | null;
};

export type Paperwork = {
	mentioned: boolean;
	flag: string | null;
};

/**
 * The guest-facing draft. The operator note is not stored: `crib.ts` renders it from the
 * qualification at read time, in the operator's language.
 */
export type Draft = {
	reply: string;
};

export type OneShot = {
	language: GuestLanguage;
	qualification: Qualification;
	paperwork: Paperwork;
	draft: Draft;
};

export type Message = {
	id: string;
	direction: MessageDirection;
	source: MessageSource;
	text: string;
	at: string;
	vendorMessageId: string | null;
	mock?: boolean;
};

export type SendResult = {
	mock: boolean;
	pipe: Pipe;
	to: string;
	text?: string;
	vendorMessageId: string | null;
};

export type Conversation = {
	id: string;
	pipe: Pipe;
	guestId: string;
	guestName: string | null;
	/**
	 * Better Auth user id that owns this thread. `null` means "unscoped" (seeded or
	 * pre-tenant rows), which every signed-in operator may see. Once every writer sets an
	 * owner, drop the `IS NULL` fallback in the store to make isolation strict.
	 */
	ownerUserId: string | null;
	messages: Message[];
	lastGuestInboundAt: string | null;
	sentAt: string | null;
	oneShot: OneShot | null;
	lastSend?: SendResult;
	updatedAt: string;
};

export type InboundEvent = {
	pipe: Pipe;
	source: MessageSource;
	guestId: string;
	guestName: string | null;
	text: string;
	vendorMessageId: string | null;
	at?: number | string | Date;
	phoneNumberId?: string | null;
	/** Owner to assign when this event creates the thread (or the thread has none). */
	ownerUserId?: string | null;
};

/** Who is reading. Threads are visible when unowned or owned by this user. */
export type InboxViewer = { userId: string };

export type InboxStore = {
	filePath: string;
	listConversations: (viewer?: InboxViewer) => Promise<Conversation[]>;
	getConversation: (id: string, viewer?: InboxViewer) => Promise<Conversation | null>;
	upsertInbound: (event: InboundEvent) => Promise<Conversation>;
	setOneShot: (id: string, oneShot: OneShot) => Promise<Conversation | null>;
	/**
	 * Atomically mark a thread as being sent. Returns false when it was already
	 * claimed or sent, so two concurrent approvals cannot both transmit.
	 */
	claimSend: (id: string) => Promise<boolean>;
	/** Undo `claimSend` after a failed transmit so the operator can retry. */
	releaseSend: (id: string) => Promise<void>;
	recordApprovedSend: (
		id: string,
		text: string,
		sendResult: SendResult,
	) => Promise<Conversation | null>;
	guestInboundText: (id: string) => Promise<string>;
	close: () => Promise<void>;
};
