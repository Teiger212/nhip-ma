import type {
	DraftSource,
	GuestLanguage,
	MessageDirection,
	MessageSource,
	OperatorLanguage,
	Pipe,
	RentOrBuy,
} from "./schema";

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
 * The suggested reply (CONTEXT.md): the text in the reply box. It answers one inbound
 * message (ADR 0006), so a draft written for an earlier guest message is never mistaken
 * for a draft of the current one. The operator note is not stored: `crib.ts` renders it
 * from the qualification at read time, in the operator's language.
 */
export type Draft = {
	reply: string;
	/** The guest message this reply answers. `null` only on files written before ADR 0006. */
	answersMessageId: string | null;
	source: DraftSource;
};

export type OneShot = {
	language: GuestLanguage;
	qualification: Qualification;
	paperwork: Paperwork;
	draft: Draft;
};

/** A guest message rendered in an operator language (ADR 0007). Keyed by that language. */
export type Translations = Partial<Record<OperatorLanguage, string>>;

export type Message = {
	id: string;
	direction: MessageDirection;
	source: MessageSource;
	text: string;
	at: string;
	vendorMessageId: string | null;
	mock?: boolean;
	/** Empty for office messages: they are never translated back (ADR 0007). */
	translations: Translations;
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
	/** When the office last sent through Nhịp. Not terminal: the guest may write back. */
	sentAt: string | null;
	/**
	 * "Your turn" (CONTEXT.md): the guest spoke last. This is the id of that unanswered
	 * inbound message, the unit of approval under reply-only (ADR 0006). `null` means the
	 * office spoke last, so there is nothing to approve.
	 */
	unansweredInboundId: string | null;
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
	/** Replace the suggested reply without touching extraction or paperwork. */
	setDraft: (id: string, draft: Draft) => Promise<Conversation | null>;
	/** Store one guest message's rendering in one operator language. */
	setTranslation: (messageId: string, locale: OperatorLanguage, text: string) => Promise<void>;
	/**
	 * Atomically claim an inbound message as being answered. Returns false when it was
	 * already claimed or answered, so two concurrent approvals cannot both transmit.
	 */
	claimSend: (messageId: string) => Promise<boolean>;
	/** Undo `claimSend` after a failed transmit so the operator can retry. */
	releaseSend: (messageId: string) => Promise<void>;
	recordApprovedSend: (
		id: string,
		text: string,
		sendResult: SendResult,
		answersMessageId: string,
	) => Promise<Conversation | null>;
	guestInboundText: (id: string) => Promise<string>;
	close: () => Promise<void>;
};
