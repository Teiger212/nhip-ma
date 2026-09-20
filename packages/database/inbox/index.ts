/**
 * The vocabulary comes straight from `./schema`, where each name is both a zod schema and
 * the type inferred from it. One plain `export` therefore hands consumers the runtime
 * check and the type under a single name, so `import type { Pipe }` keeps working while
 * `import { Pipe }` now also gets something that can parse. Re-exporting these by name
 * rather than as a namespace is what makes that source-compatible.
 *
 * `DbMessageSource` is deliberately not here: the `oa_echo` spelling is how the store
 * writes to disk, not something the domain should be able to reach for.
 */
export {
	AnswerStatus,
	DraftSource,
	Funnel,
	GuestLanguage,
	MessageDirection,
	MessageSource,
	OperatorLanguage,
	Pipe,
	RentOrBuy,
	ResponseTime,
	Timestamp,
} from "./schema";
export type {
	Answer,
	BeginAnswerResult,
	Conversation,
	Draft,
	InboundEvent,
	InboxStore,
	InboxViewer,
	Message,
	OneShot,
	Paperwork,
	PipeConnection,
	Qualification,
	SendMode,
	SendResult,
	Translations,
} from "./types";
export { conversationId, createInboxStore, createStore, nowIso } from "./store";
export { DEFAULT_SQLITE_PATH, sqliteFilePath, sqlitePathFromEnv } from "./sqlite-path";
export { ensureInboxSchema } from "./ensure-schema";
