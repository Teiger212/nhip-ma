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
	/** The agent who owns the thread (ADR 0015), or null while it is in the office's pool. */
	owner: { id: string; name: string } | null;
	/** The thread's lead in the office's CRM (ADR 0003); null until Nhịp has linked one. */
	crm: ConversationCrm | null;
	updatedAt: string;
};

/**
 * A thread as the list sees it: everything the queue (ADR 0004), search, the row, Home's
 * Waiting now and the nav count read, and nothing they do not. The open thread loads whole
 * (`Conversation`); the list polls these, so its size grows with threads, never messages.
 * The fields shared with `Conversation` mean the same; `unansweredInboundId` is derived by
 * the same rule.
 */
export type ConversationSummary = Pick<
	Conversation,
	| "id"
	| "pipe"
	| "guestId"
	| "guestName"
	| "officeId"
	| "owner"
	| "lastGuestInboundAt"
	| "sentAt"
	| "unansweredInboundId"
	| "updatedAt"
	| "crm"
> & {
	/** The guest's language as the one-shot detected it; null until it has run. */
	guestLanguage: GuestLanguage | null;
	/** The text of the guest's latest message: the row's preview and what search reads. "" when none. */
	lastInboundText: string;
};

/** The thread's linked lead (ADR 0003). */
export type ConversationCrm = {
	leadId: string;
	leadName: string;
	method: CrmLinkMethod;
} & CrmOutcome;

/**
 * What Nhịp last heard from the CRM about a thread's lead (ADR 0003). `outcomeObservedAt` is
 * when Nhịp first saw the current won or lost outcome; the CRM's own `outcomeAt` is for display.
 */
export type CrmOutcome = {
	outcome: CrmOutcomeStatus | null;
	outcomeAt: string | null;
	outcomeReason: string | null;
	outcomeObservedAt: string | null;
};

/** What Nhịp writes into the mock CRM for a guest (ADR 0003, Q12): never message text. */
export type NewMockCrmLead = {
	officeId: string;
	name: string;
	/** E.164, or null. */
	phone: string | null;
	zaloUserId: string | null;
	pipe: Pipe;
	language: string | null;
	fields: Qualification | null;
	threadUrl: string;
};

export type MockCrmLead = NewMockCrmLead & {
	id: string;
	outcome: CrmOutcomeStatus;
	outcomeAt: string | null;
	outcomeReason: string | null;
	createdAt: string;
};

/** A guest message's failed translations into one operator language (ADR 0007). */
export type TranslationFailure = {
	messageId: string;
	locale: OperatorLanguage;
	/** Failed attempts since the last success. */
	attempts: number;
	lastFailedAt: string;
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

/**
 * A pipe endpoint's vendor tokens as the store keeps them: opaque strings (the app encrypts
 * them before they get here) and when the access token stops working.
 */
export type StoredPipeCredential = {
	accessToken: string;
	refreshToken: string;
	accessTokenExpiresAt: Date;
};

/** A stored credential with its state: `disconnectedAt` is set once its tokens stopped working. */
export type PipeCredentialState = StoredPipeCredential & {
	disconnectedAt: Date | null;
	disconnectedReason: string | null;
};

/** One of an office's pipe endpoints, with whether it holds tokens and whether they work. */
export type OfficePipe = {
	pipe: Pipe;
	externalId: string;
	credential: "none" | "connected" | "disconnected";
	disconnectedReason: string | null;
};

/**
 * Who is reading: an operator, the office they act for, and their role there (ADR 0015). An
 * agent sees the office's pool and their own threads; a manager sees every thread of the
 * office. No role reads as an agent.
 */
export type InboxViewer = { userId: string; officeId: string; role?: "agent" | "manager" };

/** One incoming webhook as the delivery log keeps it (no message text, no guest id). */
export type WebhookDeliveryRecord = {
	pipe: Pipe;
	outcome: "refused" | "processed" | "failed";
	endpoints: string[];
	officeIds: string[];
	filed: number;
	dropped: number;
	vendorMessageIds: string[];
	errorKind: string | null;
};

export type WebhookDelivery = WebhookDeliveryRecord & { id: string; receivedAt: string };

export type InboxStore = {
	/**
	 * Every thread with everything under it. Scripts and tests read this; the inbox's list
	 * reads `listConversationSummaries`, which stays small however long the threads get.
	 */
	listConversations: (viewer?: InboxViewer) => Promise<Conversation[]>;
	/** The threads this viewer can open (ADR 0015), most recently active first, as summaries. */
	listConversationSummaries: (viewer: InboxViewer) => Promise<ConversationSummary[]>;
	getConversation: (id: string, viewer?: InboxViewer) => Promise<Conversation | null>;
	/** Files the message under `officeId`; a thread that already has an office keeps it. */
	upsertInbound: (event: InboundEvent, officeId: string) => Promise<Conversation>;
	connectPipe: (connection: PipeConnection) => Promise<void>;
	officeForPipe: (pipe: Pipe, externalId: string) => Promise<string | null>;
	listPipeConnections: () => Promise<PipeConnection[]>;
	/** Store an endpoint's tokens (after the vendor's authorization), clearing any disconnect. The connection must exist. */
	savePipeCredential: (
		pipe: Pipe,
		externalId: string,
		credential: StoredPipeCredential,
	) => Promise<void>;
	/**
	 * Give an endpoint to an office, unless another office holds it (ADR 0017: one endpoint,
	 * one office at a time). Returns the holder's id when refused.
	 */
	claimPipe: (connection: PipeConnection) => Promise<{ ok: true } | { ok: false; heldBy: string }>;
	/** End an office's hold on an endpoint; its tokens go with it. Threads stay. */
	releasePipe: (pipe: Pipe, externalId: string) => Promise<void>;
	/** The office's endpoints and the state of their tokens. */
	officePipes: (officeId: string) => Promise<OfficePipe[]>;
	/** The endpoint's token state, or null when it holds no tokens. */
	pipeCredentialState: (pipe: Pipe, externalId: string) => Promise<PipeCredentialState | null>;
	/** The tokens stopped working; kept for the record until the platform admin reconnects. */
	/** Returns whether this call recorded it (false when already disconnected or no tokens). */
	markPipeDisconnected: (pipe: Pipe, externalId: string, reason: string) => Promise<boolean>;
	/**
	 * Run `work` holding a row lock on the endpoint's credential, so two instances never
	 * refresh at once (a Zalo refresh token works once). `save` writes new tokens, or the
	 * disconnect, inside the same transaction. `current` is null when the endpoint has no credential.
	 */
	withPipeCredentialLock: <T>(
		pipe: Pipe,
		externalId: string,
		work: (
			current: PipeCredentialState | null,
			save: (next: Partial<PipeCredentialState>) => Promise<void>,
		) => Promise<T>,
	) => Promise<T>;
	/** Delete these threads of the office with everything under them. Returns how many went. */
	deleteConversations: (officeId: string, ids: string[]) => Promise<number>;
	setOneShot: (id: string, oneShot: OneShot) => Promise<Conversation | null>;
	/** Replace the suggested reply without touching extraction or paperwork. */
	setDraft: (id: string, draft: Draft) => Promise<Conversation | null>;
	/** Store one guest message's rendering in one operator language; clears its failures. */
	setTranslation: (messageId: string, locale: OperatorLanguage, text: string) => Promise<void>;
	/** A translation attempt failed: count it and stamp when, so retries can back off. */
	recordTranslationFailure: (
		messageId: string,
		locale: OperatorLanguage,
		at: Date,
	) => Promise<void>;
	/** The recorded failures of these messages into `locale`; messages without one are absent. */
	translationFailures: (
		messageIds: string[],
		locale: OperatorLanguage,
	) => Promise<TranslationFailure[]>;
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
	 * yes in a mock deployment (the demo), never in a live one. `timeZone` (an IANA zone,
	 * e.g. `Asia/Ho_Chi_Minh`) is the office's: `byDay` buckets leads by local calendar day
	 * in it. An unknown zone throws a RangeError.
	 */
	funnel: (
		viewer: InboxViewer,
		window: { since: Date; countMock: boolean; timeZone: string },
	) => Promise<Funnel>;
	/**
	 * Give a thread to an agent, or back to the pool (null). The new owner must be a member
	 * of the thread's office; returns false when the thread or the member is not found.
	 */
	setOwner: (conversationId: string, ownerId: string | null, officeId: string) => Promise<boolean>;
	recordWebhookDelivery: (delivery: WebhookDeliveryRecord) => Promise<void>;
	/** The latest deliveries, newest first. */
	listWebhookDeliveries: (options: { limit: number; pipe?: Pipe }) => Promise<WebhookDelivery[]>;
	/** Delete deliveries received before `before`; returns how many went. */
	pruneWebhookDeliveries: (before: Date) => Promise<number>;
	/** The office's CRM (ADR 0003), or null when it has none; whether it holds an access token. */
	getCrmConnection: (officeId: string) => Promise<{ kind: CrmKind; tokenSet: boolean } | null>;
	/**
	 * The office's CRM access token as stored: sealed by the app (never plaintext here), or null.
	 * Only the CRM sync reads it, to open it for the adapter; nothing reads it for a client.
	 */
	getCrmAccessToken: (officeId: string) => Promise<string | null>;
	/** Whether the office exists. */
	officeExists: (officeId: string) => Promise<boolean>;
	/**
	 * Replace the office's CRM connection, or remove it with null, with its access token (sealed
	 * by the app) when the kind takes one. Replacing or removing it removes the office's thread
	 * links (cascade) and its old token with it.
	 */
	setCrmConnection: (
		officeId: string,
		kind: CrmKind | null,
		accessToken?: string | null,
	) => Promise<void>;
	/**
	 * Replace the access token (sealed) on the office's CRM connection, keeping its links. The
	 * CRM account it knew is forgotten: a new token may reach another account (ADR 0008).
	 */
	replaceCrmAccessToken: (officeId: string, accessToken: string) => Promise<void>;
	/** The offices on this CRM whose connection is on the CRM's account `accountId` (#66). */
	crmOfficesOnAccount: (kind: CrmKind, accountId: string) => Promise<string[]>;
	/** Up to `limit` offices on this CRM whose account is not known yet, most recently saved first. */
	crmOfficesWithoutAccount: (kind: CrmKind, limit: number) => Promise<string[]>;
	/**
	 * Record the CRM account the office's connection is on, learned with the connection as it was
	 * (`kind` and sealed `accessToken`); false, and nothing written, when it has changed since.
	 */
	setCrmAccountId: (
		officeId: string,
		learnedWith: { kind: CrmKind; accessToken: string | null },
		accountId: string,
	) => Promise<boolean>;
	/**
	 * Claim writing the thread's lead: true for the one caller whose claim is new, false when the
	 * thread is already claimed or linked. The database decides, so two first messages make one lead.
	 */
	claimCrmLink: (conversationId: string, officeId: string) => Promise<boolean>;
	/** Give up a claim that linked nothing, so a later guest message tries again. */
	releaseCrmLink: (conversationId: string) => Promise<void>;
	/** Record the lead a claimed thread is linked to. */
	completeCrmLink: (
		conversationId: string,
		link: { leadId: string; leadName: string; method: CrmLinkMethod },
	) => Promise<void>;
	/** Write a lead into the mock CRM (ADR 0003). */
	createMockCrmLead: (lead: NewMockCrmLead) => Promise<MockCrmLead>;
	/** The office's mock CRM leads with this E.164 phone or Zalo user id; every lead with neither. */
	findMockCrmLeads: (
		officeId: string,
		where?: { phone?: string; zaloUserId?: string; ids?: string[] },
	) => Promise<MockCrmLead[]>;
	/** The mock CRM marks a lead open, won or lost (the CRM's own record, as an office would). */
	setMockCrmLeadOutcome: (
		officeId: string,
		leadId: string,
		outcome: { status: CrmOutcomeStatus; at: Date | null; reason: string | null },
	) => Promise<void>;
	/** The office's threads linked to these leads, with what Nhịp last heard about each. */
	crmLinksForLeads: (
		officeId: string,
		leadIds: string[],
	) => Promise<Array<{ conversationId: string; leadId: string } & CrmOutcome>>;
	/** Cache a lead's outcome on a thread, only while the thread is still linked to that lead. */
	saveCrmOutcome: (conversationId: string, leadId: string, outcome: CrmOutcome) => Promise<void>;
	/** Release the database connection. Scripts call it; the app never does. */
	close: () => Promise<void>;
};
