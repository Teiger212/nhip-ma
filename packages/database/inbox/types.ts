import type {
	Funnel,
	AnswerStatus,
	CrmKind,
	CrmLinkMethod,
	CrmOutcomeCounts,
	CrmOutcomeStatus,
	DraftSource,
	GuestDeletionReason,
	GuestLanguage,
	LanguageCode,
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
	/**
	 * A model draft's reply in the office language (ADR 0024, ADR 0025), for the agent to read.
	 * Absent on a template, and on a model draft already in the office language.
	 */
	officeReply?: string;
};

export type OneShot = {
	/** The language Nhịp writes to the guest in: the guest language if supported, else English. */
	language: GuestLanguage;
	/**
	 * The guest language, named whatever it is (#245). Absent on a one-shot from before it, which
	 * reads as `language`.
	 */
	guestLanguage?: LanguageCode;
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
	/** The vendor's id as stored: its keyed hash (`vendor-id.ts`), never the raw id (#141). */
	vendorMessageId: string | null;
	mock?: boolean;
	/**
	 * The office's number or OA this message travelled through (ADR 0010): what the guest
	 * wrote to, or what the reply went out on. `null` for dev injections and old files.
	 */
	pipeExternalId: string | null;
	/** Who wrote an auto-reply (ADR 0021): the template or the model. Null for any other message. */
	writtenBy: DraftSource | null;
	/** Empty for office messages: they are never translated back (ADR 0007). */
	translations: Translations;
};

export type SendResult = {
	mock: boolean;
	pipe: Pipe;
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
	/** The office endpoint the reply went out on: the one the guest wrote to. */
	pipeExternalId: string | null;
	/** The vendor's id for the sent reply as stored: its keyed hash, never the raw id (#141). */
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
			 * `not_found`: the office has no such thread, or it was deleted before or under
			 * this approval (ADR 0020).
			 */
			reason: "already_answered" | "in_progress" | "unknown" | "not_found";
	  };

/**
 * A guest deletion's outcome (ADR 0020). `crm` is what became of the thread's CRM lead: null
 * with no lead; `unlinked` when the cascade removed Nhịp's link and the CRM was not asked.
 * `not_found`: the office has no such thread (another office's, or already deleted).
 * `reply_sending`: an Answer is between approve and the vendor's reply.
 */
export type GuestDeletionResult =
	| { ok: true; crm: "unlinked" | null }
	| { ok: false; reason: "not_found" | "reply_sending" };

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
	/** The operator who owns the thread (ADR 0022), or null while it is Unassigned. */
	owner: { id: string; name: string } | null;
	/** The thread's lead in the office's CRM (ADR 0003); null until Nhịp has linked one. */
	crm: OpenThreadCrm | null;
	/**
	 * Whether the thread's office has a CRM (ADR 0003). With one and no `crm`, the thread reads
	 * "Not in CRM yet" (#211).
	 */
	officeHasCrm: boolean;
	/** When the auto-reply claimed the thread (ADR 0021); null while it has not. */
	autoReplyAt: string | null;
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
> & {
	/** The thread's linked lead, as `Conversation`'s without where it opens in the CRM. */
	crm: ConversationCrm | null;
	/**
	 * The guest language as the one-shot detected it, named whatever it is (#245): an ISO 639-1
	 * code, supported or not. Null until it has run.
	 */
	guestLanguage: LanguageCode | null;
	/** The text of the guest's latest message: the row's preview and what search reads. "" when none. */
	lastInboundText: string;
};

/** The thread's linked lead (ADR 0003). */
export type ConversationCrm = {
	leadId: string;
	leadName: string;
	method: CrmLinkMethod;
} & CrmOutcome;

/** The open thread's linked lead, with where it opens in the CRM's web app (CRM 10). */
export type OpenThreadCrm = ConversationCrm & {
	/**
	 * The lead's address in the CRM's web app, built from what the CRM told Nhịp about the office's
	 * account and the lead's id, never from anything a guest wrote. Null for a CRM with no web app
	 * (the mock), and while Nhịp doesn't know the account yet.
	 */
	leadUrl: string | null;
};

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

/** An office's auto-reply switch (ADR 0021), with the name its label signs with. */
export type OfficeAutoReply = {
	/** `organization.name`: the auto-reply is signed as the office (G2). */
	name: string;
	on: boolean;
	/** When it was last turned on; a thread that began before it is never greeted (S1). */
	onSince: string | null;
};

/**
 * Who is reading: an operator, the office they act for, and their role there (ADR 0015). An
 * agent sees only the threads assigned to them; a manager sees every thread of the office,
 * Unassigned included (ADR 0022). No role reads as an agent.
 */
export type InboxViewer = { userId: string; officeId: string; role?: "agent" | "manager" };

/**
 * One incoming webhook as the delivery log keeps it (no message text, no guest id). The store
 * keeps `vendorMessageIds` as keyed hashes: a raw WhatsApp id can carry the guest's number.
 */
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

/** What `upsertInbound` filed: the thread, and whether the message was new (ADR 0019). */
export type InboundResult = { conversation: Conversation; inserted: boolean };

export type AlertKind = "guest" | "returned" | "assigned" | "test";

/** An office member as the alert rules see them (ADR 0019). */
export type AlertOperator = {
	userId: string;
	/** `user.role`: the platform admin is never alerted. */
	platformRole: string | null;
	/** The office's kit `owner` or `admin` (ADR 0015): alerted for Unassigned guests (ADR 0022). */
	manager: boolean;
};

export type NewAlert = {
	officeId: string;
	/** Null for a test alert. */
	conversationId: string | null;
	userId: string;
	kind: AlertKind;
	now: Date;
	link: (alertId: string) => string;
	sounds: (previousAt: Date | null, now: Date) => boolean;
};

export type RecordedAlert = { id: string; link: string; sounded: boolean };

export type InboxStore = {
	/**
	 * Every thread the viewer can open, with everything under it. Scripts and tests read
	 * this; the inbox's list reads `listConversationSummaries`, which stays small however
	 * long the threads get.
	 */
	listConversations: (viewer: InboxViewer) => Promise<Conversation[]>;
	/** The threads this viewer can open (ADR 0015), most recently active first, as summaries. */
	listConversationSummaries: (viewer: InboxViewer) => Promise<ConversationSummary[]>;
	/** The thread, if this viewer can open it (ADR 0015); null otherwise, decided in the query. */
	getConversation: (id: string, viewer: InboxViewer) => Promise<Conversation | null>;
	/**
	 * The office's thread for its own background work (drafts, translation, the CRM), which has
	 * no viewer: scoped to the office, without the agent's own-threads rule.
	 */
	getOfficeConversation: (officeId: string, id: string) => Promise<Conversation | null>;
	/**
	 * Files the message under `officeId`; a thread that already has an office keeps it.
	 * `inserted` is false when the message was already stored (a vendor's retry, matched by its
	 * vendor message id): nothing that follows a new message runs for it (ADR 0019).
	 */
	upsertInbound: (event: InboundEvent, officeId: string) => Promise<InboundResult>;
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
	/**
	 * Delete a guest's data (ADR 0020): the thread and everything under it, and the bell rows
	 * that name it, in one transaction that also writes the anonymous lead tally (if the guest
	 * wrote in) and the receipt. Locks the thread, then its Answers, as approve does; refused
	 * while a reply is sending. `countMock` is the deployment's, as Home reads the funnel with
	 * it; `actorId` is the manager who deletes, `reason` and `note` why. The note is stored with
	 * its phone numbers and emails masked; an empty one is none.
	 */
	deleteGuest: (
		officeId: string,
		conversationId: string,
		options: {
			countMock: boolean;
			actorId: string;
			reason: GuestDeletionReason;
			note: string | null;
		},
	) => Promise<GuestDeletionResult>;
	setOneShot: (officeId: string, id: string, oneShot: OneShot) => Promise<Conversation | null>;
	/**
	 * Replace the suggested reply without touching extraction or paperwork. A draft with no
	 * `officeReply` clears the stored one, as `setOneShot` does.
	 */
	setDraft: (officeId: string, id: string, draft: Draft) => Promise<Conversation | null>;
	/**
	 * Write the template suggested reply again with `reply` (ADR 0024), only while the stored
	 * draft is still the template `read` was: a model draft or a newer guest message's template
	 * that landed since is left as it is. Returns the thread as it now is; null when it is gone.
	 */
	rewriteTemplateDraft: (
		officeId: string,
		id: string,
		read: Draft,
		reply: string,
	) => Promise<Conversation | null>;
	/** Store one guest message's rendering in one operator language; clears its failures. */
	setTranslation: (
		officeId: string,
		messageId: string,
		locale: OperatorLanguage,
		text: string,
	) => Promise<void>;
	/** A translation attempt failed: count it and stamp when, so retries can back off. */
	recordTranslationFailure: (
		officeId: string,
		messageId: string,
		locale: OperatorLanguage,
		at: Date,
	) => Promise<void>;
	/** The recorded failures of these messages into `locale`; messages without one are absent. */
	translationFailures: (
		officeId: string,
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
		officeId: string;
		conversationId: string;
		inboundId: string;
		text: string;
		operatorId: string | null;
	}) => Promise<BeginAnswerResult>;
	/** The vendor acknowledged: `sent`, the outbound message on the thread, `sentAt` on it. */
	completeAnswer: (
		officeId: string,
		answerId: string,
		result: SendResult,
	) => Promise<Conversation | null>;
	/** The vendor definitely refused: `failed`. The operator may approve again. */
	failAnswer: (officeId: string, answerId: string, reason: string) => Promise<void>;
	/** The office's name and its auto-reply switch (ADR 0021): no setting row means on. */
	officeAutoReply: (officeId: string) => Promise<OfficeAutoReply | null>;
	/** The operator's name guests see (#266); null when they haven't set one, or no such user. */
	nameGuestsSee: (userId: string) => Promise<string | null>;
	/** The operator sets their name guests see (#266); null clears it. */
	setNameGuestsSee: (userId: string, name: string | null) => Promise<void>;
	/**
	 * A manager turns the office's auto-reply on or off (ADR 0021 G6, #167). Only a turn from off
	 * to on stamps `autoReplyOnSince` (S1): turning on what is already on moves nothing, so it
	 * never skips a thread that began while it was on.
	 */
	setOfficeAutoReply: (officeId: string, on: boolean) => Promise<void>;
	/**
	 * The office language (ADR 0025): what the manager set, or `DEFAULT_OFFICE_LANGUAGE` when no
	 * one has (no setting row, or no value in it). Translation and the draft prompt (#251) read it.
	 */
	officeLanguage: (officeId: string) => Promise<OperatorLanguage>;
	/** A manager sets the office language (ADR 0025). The other settings are left as they are. */
	setOfficeLanguage: (officeId: string, language: OperatorLanguage) => Promise<void>;
	/**
	 * Count one model call against the office's daily cap for the task (ADR 0024): true, and
	 * counted, while the office's calls that day are under `cap`; false, and nothing counted,
	 * once they reach it. `day` is the office's calendar day, `YYYY-MM-DD`.
	 */
	claimModelCall: (call: {
		officeId: string;
		task: string;
		day: string;
		cap: number;
	}) => Promise<boolean>;
	/**
	 * Claim the thread's one auto-reply (ADR 0021): true for exactly one caller, and only while
	 * the thread has no office message, no Answer and no claim. A claim is never given back.
	 */
	claimAutoReply: (officeId: string, id: string) => Promise<boolean>;
	/**
	 * File a sent auto-reply as the office's message. It is not an Answer: `sentAt`, the owner
	 * and Your turn are untouched. Null when the thread is gone.
	 */
	recordAutoReply: (
		officeId: string,
		id: string,
		reply: {
			text: string;
			writtenBy: DraftSource;
			result: SendResult;
			pipeExternalId: string | null;
			/** When it went out, placed after the message it greets (ADR 0021). */
			at: Date;
		},
	) => Promise<Conversation | null>;
	/** The vendor did not answer, or the acknowledgement could not be recorded: `unknown`. */
	markAnswerUnknown: (officeId: string, answerId: string, reason: string) => Promise<void>;
	guestInboundText: (officeId: string, id: string) => Promise<string>;
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
	 * Home's Closings and Lost (ADR 0003, #68) for the funnel's cohort (leads whose first message
	 * landed on or after `since`), from the outcomes cached on the office's threads and its
	 * deleted guests' lead tallies (ADR 0020); never asks the CRM. A lead linked from two threads
	 * counts once, by the outcome Nhịp saw last. Null when the office has no CRM.
	 */
	crmOutcomes: (viewer: InboxViewer, window: { since: Date }) => Promise<CrmOutcomeCounts | null>;
	/**
	 * Give a thread to an operator, or back to Unassigned (null); the last call wins. The new
	 * owner must be a member of the thread's office, and not the platform admin (ADR 0022);
	 * returns false when the thread or such a member is not found.
	 */
	setOwner: (conversationId: string, ownerId: string | null, officeId: string) => Promise<boolean>;
	/**
	 * `setOwner`, also saying whom the thread was taken from: the owner it had, read under the
	 * row's lock, so concurrent changes each see the owner they replaced (#133). Null where
	 * `setOwner` returns false.
	 */
	reassign: (
		conversationId: string,
		ownerId: string | null,
		officeId: string,
	) => Promise<{ previousOwnerId: string | null } | null>;
	recordWebhookDelivery: (delivery: WebhookDeliveryRecord) => Promise<void>;
	/** The latest deliveries, newest first. */
	listWebhookDeliveries: (options: { limit: number; pipe?: Pipe }) => Promise<WebhookDelivery[]>;
	/** Delete deliveries received before `before`; returns how many went. */
	pruneWebhookDeliveries: (before: Date) => Promise<number>;
	/** The office's members as alerts see them: platform role, locale and manager (ADR 0019, 0022). */
	officeOperators: (officeId: string) => Promise<AlertOperator[]>;
	/**
	 * Log one alert to one operator (ADR 0019). Whether it sounds is decided by `sounds` from
	 * this operator's previous alert on the thread, read and written in one transaction under an
	 * advisory lock on (operator, thread). `link` builds the row's link from its own id.
	 */
	recordAlert: (alert: NewAlert) => Promise<RecordedAlert>;
	/** Delete alerts made before `before`; returns how many went. */
	pruneAlerts: (before: Date) => Promise<number>;
	/**
	 * The thread an alert's link opens for `viewer` (ADR 0019, #136): its id when the alert is
	 * the viewer's own and its thread is one they can open now; otherwise null, whatever the
	 * reason, so a link says nothing about a thread to anyone else.
	 */
	alertThread: (alertId: string, viewer: InboxViewer) => Promise<string | null>;
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
	 * Replace the access token (sealed for `kind`) on the office's CRM connection, keeping its
	 * links. The CRM account it knew is forgotten: a new token may reach another account (ADR
	 * 0008). False, and nothing written, when the connection is no longer of `kind` (#95).
	 */
	replaceCrmAccessToken: (officeId: string, kind: CrmKind, accessToken: string) => Promise<boolean>;
	/** The offices on this CRM whose connection is on the CRM's account `accountId` (#66). */
	crmOfficesOnAccount: (kind: CrmKind, accountId: string) => Promise<string[]>;
	/** Up to `limit` offices on this CRM whose account is not known yet, most recently saved first. */
	crmOfficesWithoutAccount: (kind: CrmKind, limit: number) => Promise<string[]>;
	/**
	 * Record the CRM account the office's connection is on, and where its leads open in the CRM's
	 * web app (`leadUrlPrefix`, null for none), learned with the connection as it was (`kind` and
	 * sealed `accessToken`); false, and nothing written, when it has changed since.
	 */
	setCrmAccountId: (
		officeId: string,
		learnedWith: { kind: CrmKind; accessToken: string | null },
		account: { id: string; leadUrlPrefix: string | null },
	) => Promise<boolean>;
	/**
	 * Claim writing the thread's lead: true for the one caller whose claim is new, false when the
	 * thread is already claimed or linked. The database decides, so two first messages make one lead.
	 * A claim that linked nothing and was made before `staleBefore` is a write that died half-way
	 * (#211): it is taken over, by one caller only.
	 */
	claimCrmLink: (officeId: string, conversationId: string, staleBefore: Date) => Promise<boolean>;
	/** Give up a claim that linked nothing, so a later guest message tries again. */
	releaseCrmLink: (officeId: string, conversationId: string) => Promise<void>;
	/** Record the lead a claimed thread is linked to; its failed writes are forgotten (#211). */
	completeCrmLink: (
		officeId: string,
		conversationId: string,
		link: { leadId: string; leadName: string; method: CrmLinkMethod },
	) => Promise<void>;
	/**
	 * The thread's failed lead writes (#211): how many in a row, and when the last one was; null
	 * when it has none. Stored so every instance waits out the same backoff.
	 */
	crmWriteFailure: (
		officeId: string,
		conversationId: string,
	) => Promise<{ attempts: number; lastFailedAt: string } | null>;
	/**
	 * A lead write linked nothing at `at` (#211): count it. Nothing when the thread or the office's
	 * CRM is gone meanwhile (ADR 0020): a deleted thread keeps no failure.
	 */
	recordCrmWriteFailure: (officeId: string, conversationId: string, at: Date) => Promise<void>;
	/** Whether the office's mock CRM is down (ADR 0003, #211): E2E and the demo only. */
	mockCrmDown: (officeId: string) => Promise<boolean>;
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
	saveCrmOutcome: (
		officeId: string,
		conversationId: string,
		leadId: string,
		outcome: CrmOutcome,
	) => Promise<void>;
	/** Release the database connection. Scripts call it; the app never does. */
	close: () => Promise<void>;
};
