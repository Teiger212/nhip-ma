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
	CrmKind,
	CrmLinkMethod,
	CrmOutcomeCounts,
	CrmOutcomeStatus,
	DEFAULT_OFFICE_LANGUAGE,
	DraftSource,
	Funnel,
	GUEST_DELETION_NOTE_MAX,
	GuestDeletionReason,
	GuestLanguage,
	LanguageCode,
	MessageDirection,
	MessageSource,
	OperatorLanguage,
	Pipe,
	RentOrBuy,
	ResponseTime,
	Timestamp,
} from "./schema";
export type {
	AlertKind,
	AlertOperator,
	Answer,
	BeginAnswerResult,
	Conversation,
	ConversationCrm,
	CrmOutcome,
	OpenThreadCrm,
	ConversationSummary,
	Draft,
	GuestDeletionResult,
	InboundEvent,
	InboundResult,
	InboxStore,
	InboxViewer,
	Message,
	MockCrmLead,
	NewAlert,
	NewMockCrmLead,
	OneShot,
	Paperwork,
	PipeConnection,
	Qualification,
	RecordedAlert,
	SendMode,
	SendResult,
	OfficePipe,
	PipeCredentialState,
	StoredPipeCredential,
	TranslationFailure,
	Translations,
	WebhookDelivery,
	WebhookDeliveryRecord,
} from "./types";
export { maskContactDetails } from "./mask-note";
export { createInboxStore, nowIso } from "./store";
