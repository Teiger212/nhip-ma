/**
 * The vocabulary passes through as values, not just types, so the app can check a value
 * against the same declaration the store parses with instead of restating the member list.
 * Every consumer in this module imports from here with `import type`, which erases, so a
 * client component still pulls none of `@repo/database/inbox` into its bundle.
 */
export {
	CribLanguage,
	GuestLanguage,
	MessageDirection,
	MessageSource,
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
} from "@repo/database/inbox";
