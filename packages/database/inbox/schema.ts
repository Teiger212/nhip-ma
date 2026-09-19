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
 * Every timestamp the store reads or writes is `Date#toISOString` output, so the strict
 * UTC form is the whole contract. A local-time or half-formed string is corrupt state.
 */
export const Timestamp = z.iso.datetime();
export type Timestamp = z.infer<typeof Timestamp>;
