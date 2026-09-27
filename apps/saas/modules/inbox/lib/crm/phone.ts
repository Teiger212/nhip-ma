import type { Pipe } from "../types";

/**
 * A phone number as E.164 (`+` and 8 to 15 digits), or null. A leading `0` is a national
 * number in the default country (Vietnam, `84`); digits without `+` already carry their
 * country code, which is how WhatsApp sends a `wa_id`. Formatting characters are ignored;
 * letters make it not a phone number.
 */
export function toE164(raw: string, defaultCountry = "84"): string | null {
	const trimmed = raw.trim();
	if (!/^[\s()+.\-\d]+$/.test(trimmed)) return null;
	const digits = trimmed.replace(/\D/g, "");
	const plus = trimmed.replace(/[\s().-]/g, "").startsWith("+");
	const international =
		!plus && digits.startsWith("0") ? `${defaultCountry}${digits.slice(1)}` : digits;
	return /^[1-9]\d{7,14}$/.test(international) ? `+${international}` : null;
}

/** The guest's phone, if the pipe identifies guests by phone: WhatsApp does, Zalo does not (ADR 0003). */
export function guestPhone(conversation: { pipe: Pipe; guestId: string }): string | null {
	return conversation.pipe === "whatsapp" ? toE164(conversation.guestId) : null;
}
