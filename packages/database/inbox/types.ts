import type {
	Funnel,
	AnswerStatus,
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

/**
 * An Answer (ADR 0011): the office's reply to exactly one guest message, on record from
 * the moment the operator approves it. One row per inbound; the row carries the send's
 * whole lifecycle, so an approval that targets the wrong message, a send that is
 * repeated after a vendor success, and a guest message that arrives mid-send are all
 * ruled out by the same record.
 */
export type Answer = {
	id: string;
	conversationId: string;
	/** The guest message this answers. Unique: one Answer per inbound. */
	inboundId: string;
	/** Exactly what the operator approved. */
	text: string;
	/** Who approved. `null` on rows migrated from before ADR 0011. */
	operatorId: string | null;
	status: AnswerStatus;
	mock: boolean;
	pipe: Pipe;
	to: string;
	/** The office endpoint the reply went out on: the one the guest wrote to. */
	pipeExternalId: string | null;
	vendorMessageId: string | null;
	approvedAt: string;
	sentAt: string | null;
	failedAt: string | null;
	failureReason: string | null;
};

export type BeginAnswerResult =
	| { ok: true; answer: Answer }
	| {
			ok: false;
			/**
			 * `already_answered`: a sent Answer exists. `in_progress`: another approval is
			 * between approve and the vendor's reply. `unknown`: a previous send's outcome is
			 * unknown and must be reconciled by a person before anything is sent again.
			 */
			reason: "already_answered" | "in_progress" | "unknown";
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
	 * "Your turn" (CONTEXT.md): the guest's latest message has no Answer in flight or
	 * sent, and no reply from the OA app after it. This is that message's id, the unit of
	 * approval under reply-only (ADR 0006). `null` means there is nothing to approve. A
	 * guest message that arrives while an earlier one is being answered stays here (ADR
	 * 0011): the office's reply is read off the Answers, not off message order.
	 */
	unansweredInboundId: string | null;
	oneShot: OneShot | null;
	/** Every Answer on this thread, oldest first. */
	answers: Answer[];
	/** The most recent Answer, whatever its status. */
	lastAnswer: Answer | null;
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
	 * The operator approved `text` as the answer to `inboundId`: write the Answer in status
	 * `sending` before anything talks to a vendor. Atomic: a second approval of the same
	 * message, concurrent or later, is refused with a reason; a `failed` Answer is reused
	 * for the retry.
	 */
	beginAnswer: (input: {
		conversationId: string;
		inboundId: string;
		text: string;
		operatorId: string | null;
	}) => Promise<BeginAnswerResult>;
	/** The vendor acknowledged: `sent`, the outbound message on the thread, `sentAt` on it. */
	completeAnswer: (answerId: string, result: SendResult) => Promise<Conversation | null>;
	/** The vendor definitely refused: `failed`. The operator may approve again. */
	failAnswer: (answerId: string, reason: string) => Promise<void>;
	/** The vendor did not answer, or the acknowledgement could not be recorded: `unknown`. */
	markAnswerUnknown: (answerId: string, reason: string) => Promise<void>;
	guestInboundText: (id: string) => Promise<string>;
	/**
	 * The office funnel (ADR 0002) for leads whose first message landed on or after
	 * `since`, counted in SQL inside the office; no thread leaves the store for a count.
	 */
	funnel: (viewer: InboxViewer, window: { since: Date }) => Promise<Funnel>;
	close: () => Promise<void>;
};
