import { z } from "zod";

/**
 * The inbox vocabulary, declared once.
 *
 * Each of these used to exist twice: as a hand-written TypeScript union in `types.ts` and
 * again as an unchecked `as` cast in `store.ts`, with nothing checking either at runtime.
 * Here the schema is the declaration and the type is derived from it, so the two cannot
 * drift and a value that is not in the vocabulary is rejected instead of being believed.
 */

export const Pipe = z.enum(["zalo", "whatsapp"]);
export type Pipe = z.infer<typeof Pipe>;

export const GuestLanguage = z.enum(["en", "vi", "ja", "ko", "ru"]);
export type GuestLanguage = z.infer<typeof GuestLanguage>;

/**
 * The operator's language (CONTEXT.md): the target of every translation and the language
 * of the operator note. EN or VI, from the operator's locale setting.
 */
export const OperatorLanguage = z.enum(["en", "vi"]);
export type OperatorLanguage = z.infer<typeof OperatorLanguage>;

export const RentOrBuy = z.enum(["rent", "buy"]);
export type RentOrBuy = z.infer<typeof RentOrBuy>;

export const MessageDirection = z.enum(["in", "out"]);
export type MessageDirection = z.infer<typeof MessageDirection>;

/** How the domain spells a message's origin. */
export const MessageSource = z.enum(["guest", "oa-echo", "nhip"]);
export type MessageSource = z.infer<typeof MessageSource>;

/**
 * How the database spells it. The OA echo is `oa_echo` on disk and `oa-echo` in the
 * domain; `toDbSource`/`fromDbSource` in `store.ts` are the only places that translate.
 */
export const DbMessageSource = z.enum(["guest", "oa_echo", "nhip"]);
export type DbMessageSource = z.infer<typeof DbMessageSource>;

/**
 * Where the suggested reply came from: the deterministic template, or a model draft
 * through the draft adapter (ADR 0005). The operator can always edit either.
 */
export const DraftSource = z.enum(["template", "model"]);
export type DraftSource = z.infer<typeof DraftSource>;

/**
 * The lifecycle of an Answer (ADR 0011). `sending` from the moment the operator approves
 * until the vendor answers; `sent` on a vendor acknowledgement; `failed` on a definite
 * refusal (the operator may approve again); `unknown` when the vendor did not answer or
 * the acknowledgement could not be recorded, which is never retried automatically.
 */
export const AnswerStatus = z.enum(["sending", "sent", "failed", "unknown"]);
export type AnswerStatus = z.infer<typeof AnswerStatus>;

/**
 * Every timestamp the store reads or writes is `Date#toISOString` output, so the strict
 * UTC form is the whole contract. A local-time or half-formed string is corrupt state.
 */
export const Timestamp = z.iso.datetime();
export type Timestamp = z.infer<typeof Timestamp>;

/**
 * Response time (CONTEXT.md): first inbound to the first sent Answer, over the leads that
 * were answered. Nearest-rank percentiles, in milliseconds, so the caller formats.
 */
export const ResponseTime = z.object({
	answered: z.number().int().nonnegative(),
	medianMs: z.number().int().nonnegative(),
	p90Ms: z.number().int().nonnegative(),
});
export type ResponseTime = z.infer<typeof ResponseTime>;

/**
 * The office funnel over a window (ADR 0002), the three stages Nhịp can count itself,
 * read off Answers (ADR 0011). The cohort is every lead whose first message landed in the
 * window; engaged and in conversation are counted inside that cohort, so the funnel never
 * widens. Closings and lost are not here: they come from the CRM adapter (ADR 0003) or
 * not at all. `responseTime` is `null` when nobody in the cohort was answered.
 */
export const Funnel = z.object({
	since: Timestamp,
	until: Timestamp,
	/** Guests whose first message landed in the window. */
	leadsIn: z.number().int().nonnegative(),
	/** Leads with at least one `sent` Answer. */
	engaged: z.number().int().nonnegative(),
	/** Leads who wrote again after their first sent Answer. */
	inConversation: z.number().int().nonnegative(),
	responseTime: ResponseTime.nullable(),
});
export type Funnel = z.infer<typeof Funnel>;
