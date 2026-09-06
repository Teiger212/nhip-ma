import type {
	CribLanguage,
	GuestLanguage,
	MessageDirection,
	MessageSource,
	Pipe,
	RentOrBuy,
} from "./schema";

/**
 * The vocabulary lives in `./schema` as zod schemas; these are the types inferred from
 * them. Import the schema when you need to check a value at runtime, these when you only
 * need the type. There is no second declaration to keep in step.
 */
export type {
	CribLanguage,
	GuestLanguage,
	MessageDirection,
	MessageSource,
	Pipe,
	RentOrBuy,
	Timestamp,
} from "./schema";

/** Not persisted, so it has no schema: this is runtime configuration, not stored data. */
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

export type Draft = {
	reply: string;
	crib: string;
	cribLanguage: CribLanguage;
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

export type InboxEnv = {
	DATABASE_URL?: string;
	SEND_MODE?: string;
	WHATSAPP_VERIFY_TOKEN?: string;
	WHATSAPP_APP_SECRET?: string;
	WHATSAPP_ACCESS_TOKEN?: string;
	WHATSAPP_PHONE_NUMBER_ID?: string;
	ZALO_OA_ACCESS_TOKEN?: string;
	ZALO_OA_SECRET_KEY?: string;
	/** Owner assigned to threads created by webhooks. Unset means unowned. */
	INBOX_OWNER_USER_ID?: string;
	[key: string]: string | undefined;
};

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
