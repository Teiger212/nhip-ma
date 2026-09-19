/**
 * The vocabulary passes through as values, not just types, so the app can check a value
 * against the same declaration the store parses with instead of restating the member list.
 * Every consumer in this module imports from here with `import type`, which erases, so a
 * client component still pulls none of `@repo/database/inbox` into its bundle.
 */
export {
	DraftSource,
	GuestLanguage,
	MessageDirection,
	MessageSource,
	OperatorLanguage,
	Pipe,
	RentOrBuy,
	Timestamp,
} from "@repo/database/inbox";
export type {
	Conversation,
	Draft,
	InboundEvent,
	InboxStore as Store,
	InboxViewer,
	Message,
	OneShot,
	Paperwork,
	Qualification,
	SendMode,
	SendResult,
	Translations,
} from "@repo/database/inbox";
