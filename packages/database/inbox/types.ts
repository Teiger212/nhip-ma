export type Pipe = "zalo" | "whatsapp";
export type GuestLanguage = "en" | "vi" | "ja" | "ko" | "ru";
export type RentOrBuy = "rent" | "buy";
export type MessageSource = "guest" | "oa-echo" | "nhip";
export type MessageDirection = "in" | "out";
export type SendMode = "mock" | "live";
export type CribLanguage = "en" | "vi";

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
};

export type InboxEnv = {
	DATABASE_URL?: string;
	SEND_MODE?: string;
	WHATSAPP_VERIFY_TOKEN?: string;
	WHATSAPP_APP_SECRET?: string;
	WHATSAPP_ACCESS_TOKEN?: string;
	WHATSAPP_PHONE_NUMBER_ID?: string;
	ZALO_OA_ACCESS_TOKEN?: string;
	ZALO_OA_SECRET_KEY?: string;
	[key: string]: string | undefined;
};

export type InboxStore = {
	filePath: string;
	listConversations: () => Promise<Conversation[]>;
	getConversation: (id: string) => Promise<Conversation | null>;
	upsertInbound: (event: InboundEvent) => Promise<Conversation>;
	setOneShot: (id: string, oneShot: OneShot) => Promise<Conversation | null>;
	recordApprovedSend: (
		id: string,
		text: string,
		sendResult: SendResult,
	) => Promise<Conversation | null>;
	guestInboundText: (id: string) => Promise<string>;
	close: () => Promise<void>;
};
