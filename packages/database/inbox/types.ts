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
	/**
	 * The office's number or OA this message travelled through (ADR 0010): what the guest
	 * wrote to, or what the reply went out on. `null` for dev injections and old files.
	 */
	pipeExternalId: string | null;
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
	 * The office (ADR 0008) this thread belongs to: the kit organization's id. Threads are
	 * shared within the office and invisible outside it. `null` only on files written
	 * before tenancy; `adoptUnownedThreads` gives those an office, and nothing new is
	 * written without one.
	 */
	officeId: string | null;
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
	/**
	 * The vendor's id for the office's side of the pipe: the WhatsApp phone number id, the
	 * Zalo OA id. It is what maps an inbound to its office (`PipeConnection`).
	 */
	pipeExternalId?: string | null;
};

/** Which office owns a pipe endpoint. Webhook-created threads take this office (ADR 0008). */
export type PipeConnection = {
	pipe: Pipe;
	externalId: string;
	officeId: string;
};

/** Who is reading: an operator and the office they act for. Threads are visible only inside it. */
export type InboxViewer = { userId: string; officeId: string };

export type InboxStore = {
	filePath: string;
	listConversations: (viewer?: InboxViewer) => Promise<Conversation[]>;
	getConversation: (id: string, viewer?: InboxViewer) => Promise<Conversation | null>;
	/** Files the message under `officeId`; a thread that already has an office keeps it. */
	upsertInbound: (event: InboundEvent, officeId: string) => Promise<Conversation>;
	/**
	 * Give every thread without an office (pre-tenancy files) to this one, except a thread
	 * whose guest already has one there. Returns how many were adopted.
	 */
	adoptUnownedThreads: (officeId: string) => Promise<number>;
	connectPipe: (connection: PipeConnection) => Promise<void>;
	officeForPipe: (pipe: Pipe, externalId: string) => Promise<string | null>;
	listPipeConnections: () => Promise<PipeConnection[]>;
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
