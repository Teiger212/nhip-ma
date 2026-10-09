import { parsePhoneNumberFromString } from "libphonenumber-js";

import type { ConversationSummary } from "./types";

/**
 * What a guest is called where their name is data: their name when the pipe gave one, else the
 * id, as stored. The CRM lead's name is written from it (`crm/sync.ts`), so it never changes
 * shape; what the Inbox shows is `guestLabel`.
 */
export function displayName(
	conversation: Pick<ConversationSummary, "guestName" | "guestId">,
): string {
	return conversation.guestName || conversation.guestId;
}

/** How the Inbox and Home show a guest: their name, or what identifies them on the pipe. */
export type GuestLabel = {
	text: string;
	/** Known only by their WhatsApp number: the guest mark shows a phone, not a digit. */
	phone: boolean;
};

/**
 * The guest as the operator reads them (#94). A named guest is their name. A nameless WhatsApp
 * guest is their number read with its country code (PRODUCT.md, Guest), as WhatsApp's id always
 * carries it: "+1 202 555 0107", not "12025550107". A nameless Zalo guest stays their Zalo id,
 * which is not a phone. Only where the Inbox already showed the raw digits: alerts never show a
 * phone (ADR 0019).
 */
export function guestLabel(
	conversation: Pick<ConversationSummary, "guestName" | "guestId" | "pipe">,
): GuestLabel {
	if (conversation.guestName) return { text: conversation.guestName, phone: false };
	if (conversation.pipe === "whatsapp" && /^\d+$/.test(conversation.guestId)) {
		const parsed = parsePhoneNumberFromString(`+${conversation.guestId}`);
		if (parsed?.isPossible()) return { text: parsed.formatInternational(), phone: true };
	}
	return { text: conversation.guestId, phone: false };
}
