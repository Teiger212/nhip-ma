import type {
	Funnel,
	AnswerStatus,
	CrmKind,
	CrmLinkMethod,
	CrmOutcomeStatus,
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
	/** Who approved. `null` on rows migrated from before ADR 0011, or once the account is gone. */
	operatorId: string | null;
	/** The approver's name at approval; kept after the account is deleted (ADR 0013). */
	operatorName: string | null;
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
	/** The office (ADR 0008) this thread belongs to: the kit organization's id. Required (ADR 0012). */
	officeId: string;
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
	/**
	 * The thread's CRM lead and its cached outcome (ADR 0003); null until the office has a
	 * CRM and the thread was looked up.
	 */
	crm: ConversationCrm | null;
	updatedAt: string;
};

export type ConversationCrm = {
	kind: CrmKind;
	/** null: a phone lookup found nothing, or an agent unlinked it (method `manual`). */
	leadId: string | null;
	leadName: string | null;
	method: CrmLinkMethod;
	outcome: CrmOutcomeStatus | null;
	outcomeAt: string | null;
	outcomeReason: string | null;
	/** When the CRM was last asked about this thread; the cache is trusted for 10 minutes. */
	checkedAt: string;
};

/** A thread `refreshCrm` has to look at: never looked up, or looked up too long ago. */
export type CrmWorkItem = {
	conversationId: string;
	pipe: Pipe;
	guestId: string;
	crm: ConversationCrm | null;
};

/** A lead in the mock CRM (ADR 0003). */
export type MockCrmLeadRecord = {
	id: string;
	officeId: string;
	name: string;
	/** E.164, or null. */
	phone: string | null;
	outcome: CrmOutcomeStatus;
	outcomeAt: string | null;
	outcomeReason: string | null;
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
	listConversations: (viewer?: InboxViewer) => Promise<Conversation[]>;
	getConversation: (id: string, viewer?: InboxViewer) => Promise<Conversation | null>;
	/** Files the message under `officeId`; a thread that already has an office keeps it. */
	upsertInbound: (event: InboundEvent, officeId: string) => Promise<Conversation>;
	connectPipe: (connection: PipeConnection) => Promise<void>;
	officeForPipe: (pipe: Pipe, externalId: string) => Promise<string | null>;
	listPipeConnections: () => Promise<PipeConnection[]>;
	/** Delete these threads of the office with everything under them. Returns how many went. */
	deleteConversations: (officeId: string, ids: string[]) => Promise<number>;
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
	 * A lead is reached by the office's first reply: a sent Answer, or a reply an agent sent
	 * from the vendor's own app (`oa-echo`). `countMock` decides whether mock sends count:
	 * yes in a mock deployment (the demo), never in a live one.
	 */
	funnel: (viewer: InboxViewer, window: { since: Date; countMock: boolean }) => Promise<Funnel>;
	/** The office's CRM (ADR 0003) and when it last failed, or null when none is connected. */
	getCrmConnection: (
		officeId: string,
	) => Promise<{ kind: CrmKind; failedAt: string | null } | null>;
	/**
	 * Connect the office to a CRM kind, or disconnect it with `null`. Disconnecting or
	 * changing the kind drops the office's thread links: another CRM's leads mean nothing.
	 */
	setCrmConnection: (officeId: string, kind: CrmKind | null) => Promise<void>;
	/** Record that the office's CRM failed (or recovered, with `null`). */
	markCrmFailure: (officeId: string, at: Date | null) => Promise<void>;
	/** The office's threads with no CRM link yet, or one checked before `staleBefore`. */
	crmWork: (officeId: string, staleBefore: Date) => Promise<CrmWorkItem[]>;
	/**
	 * Link a thread to a lead (or record a miss with `leadId: null`); a new lead drops the old
	 * outcome. With `expected`, write only if the link is still what was read (null: no link
	 * yet), so a background refresh never overwrites an agent's link made meanwhile. Returns
	 * whether it wrote.
	 */
	saveCrmLink: (
		conversationId: string,
		link: {
			kind: CrmKind;
			leadId: string | null;
			leadName: string | null;
			method: CrmLinkMethod;
			checkedAt: Date;
		},
		expected?: { leadId: string | null; checkedAt: string } | null,
	) => Promise<boolean>;
	/**
	 * Cache what the CRM said about linked threads' leads, as of `checkedAt`. An update that
	 * names `leadId` is skipped when the thread now links another lead; a link gone
	 * meanwhile is skipped too.
	 */
	saveCrmOutcomes: (
		updates: Array<{
			conversationId: string;
			leadId?: string;
			outcome: CrmOutcomeStatus | null;
			outcomeAt: Date | null;
			outcomeReason: string | null;
		}>,
		checkedAt: Date,
	) => Promise<void>;
	/** Write a mock CRM lead (ADR 0003): seed and tests. */
	upsertMockCrmLead: (lead: MockCrmLeadRecord) => Promise<void>;
	/** The office's mock CRM leads by E.164 phone, by name, or by id; at most 20. */
	findMockCrmLeads: (
		officeId: string,
		where: { phone?: string; query?: string; ids?: string[] },
	) => Promise<MockCrmLeadRecord[]>;
	/** Release the database connection. Scripts call it; the app never does. */
	close: () => Promise<void>;
};
