import { type CountryCode, parsePhoneNumberFromString } from "libphonenumber-js";

import type { Pipe } from "../types";
import type { GuestIdentity } from "./types";

/**
 * A phone number as E.164, or null (ADR 0003, Q19). National numbers read as Vietnamese by
 * default, with or without the leading `0` a spreadsheet strips; `+84 0…` and the `00`
 * international prefix are accepted. Digits that are not a valid national number are tried
 * as already carrying their country code, which is how WhatsApp sends a `wa_id`. Letters
 * make it not a phone number.
 */
export function toE164(raw: string, defaultCountry: CountryCode = "VN"): string | null {
	const trimmed = raw.trim();
	if (!/^[\s()+.\-\d]+$/.test(trimmed)) return null;
	const candidates = trimmed.startsWith("+") ? [trimmed] : [trimmed, `+${trimmed}`];
	for (const candidate of candidates) {
		const parsed = parsePhoneNumberFromString(candidate, defaultCountry);
		if (parsed?.isValid()) return parsed.number;
	}
	return null;
}

/** The guest's phone, if the pipe identifies guests by phone: WhatsApp does, Zalo does not (ADR 0003). */
export function guestPhone(conversation: { pipe: Pipe; guestId: string }): string | null {
	return conversation.pipe === "whatsapp" ? toE164(conversation.guestId) : null;
}

/** How the office's CRM can know a guest (spec #59): by phone on WhatsApp, by Zalo user id on Zalo. */
export function guestIdentity(conversation: { pipe: Pipe; guestId: string }): GuestIdentity {
	return {
		phone: guestPhone(conversation),
		zaloUserId: conversation.pipe === "zalo" ? conversation.guestId : null,
	};
}
