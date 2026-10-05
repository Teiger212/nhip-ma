/** An email address: something@domain.tld, as loosely as people write them. */
const EMAIL = /[^\s@,;:<>()[\]]+@[^\s@,;:<>()[\]]+\.[A-Za-z]{2,}/g;

/**
 * A run that looks like a phone number (or another long digit id, such as a Zalo user id): an
 * optional `+` or `(`, then digits with the separators people put in phone numbers (spaces,
 * brackets, dots, hyphens and dashes, slashes, underscores, middle dots). Counted as one only
 * with 8 digits or more, so "500 USD" and "ticket 1234" stay.
 */
const PHONE_LIKE = /[+(]?\d[\d\s().\-‐-―/_·]*\d/g;
const MIN_PHONE_DIGITS = 8;

/** The longest note the store keeps (`GUEST_DELETION_NOTE_MAX`); it bounds the masking's work. */
const NOTE_MAX = 500;

/**
 * The manager's note on a guest deletion, with phone numbers and emails masked (ADR 0020): the
 * receipt keeps holding no guest identifier. Fullwidth digits and `＠` are read as their ASCII
 * forms first. Errs on masking: a long digit run of any kind (a date written as digits, an id)
 * becomes `[phone]` too. A note longer than the limit is cut to it first.
 */
export function maskContactDetails(note: string): string {
	return note
		.normalize("NFKC")
		.slice(0, NOTE_MAX)
		.replace(EMAIL, "[email]")
		.replace(PHONE_LIKE, (run) =>
			run.replace(/\D/g, "").length >= MIN_PHONE_DIGITS ? "[phone]" : run,
		);
}
