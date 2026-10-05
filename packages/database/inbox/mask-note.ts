/** An email address: something@domain.tld, as loosely as people write them. */
const EMAIL = /[^\s@,;:<>()[\]]+@[^\s@,;:<>()[\]]+\.[A-Za-z]{2,}/g;

/**
 * A run that looks like a phone number (or another long digit id, such as a Zalo user id): an
 * optional `+` or `(`, then digits with the separators people put in phone numbers. Counted as
 * one only with 8 digits or more, so "500 USD" and "ticket 1234" stay.
 */
const PHONE_LIKE = /[+(]?\d[\d\s().-]*\d/g;
const MIN_PHONE_DIGITS = 8;

/**
 * The manager's note on a guest deletion, with phone numbers and emails masked (ADR 0020): the
 * receipt keeps holding no guest identifier. Errs on masking: a long digit run of any kind
 * (a date written as digits, an id) becomes `[phone]` too.
 */
export function maskContactDetails(note: string): string {
	return note
		.replace(EMAIL, "[email]")
		.replace(PHONE_LIKE, (run) =>
			run.replace(/\D/g, "").length >= MIN_PHONE_DIGITS ? "[phone]" : run,
		);
}
