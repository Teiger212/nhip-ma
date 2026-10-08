import { z } from "zod";

/** The longest name guests see (#266): a name to introduce oneself by, not a sentence. */
export const NAME_GUESTS_SEE_MAX = 40;

/**
 * What an operator may save as their name guests see (#266), the account page's form and its
 * route alike: trimmed, one line, at most `NAME_GUESTS_SEE_MAX` characters. Blank clears it.
 */
export const NameGuestsSee = z
	.string()
	.trim()
	.max(NAME_GUESTS_SEE_MAX)
	.refine((name) => !/[\r\n]/u.test(name), "one line");
