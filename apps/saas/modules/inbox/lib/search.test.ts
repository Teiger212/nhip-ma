import { expect, test } from "vitest";

import { lastInboundText, matchesThreadSearch } from "./search";
import type { Conversation } from "./types";

function conv(partial: Partial<Conversation> & Pick<Conversation, "id">): Conversation {
	return {
		pipe: "whatsapp",
		guestId: partial.guestId || "g1",
		guestName: partial.guestName ?? "Minji",
		messages: partial.messages ?? [],
		lastGuestInboundAt: null,
		sentAt: null,
		oneShot: null,
		updatedAt: new Date().toISOString(),
		...partial,
	};
}

test("search matches guest name or last inbound text", () => {
	const thread = conv({
		id: "whatsapp:demo-ko-stay",
		guestName: "Minji",
		messages: [
			{
				id: "1",
				direction: "in",
				source: "guest",
				text: "Tay Ho에서 3 nights vs monthly stay",
				at: new Date().toISOString(),
				vendorMessageId: null,
			},
		],
	});

	expect(lastInboundText(thread).includes("Tay Ho")).toBe(true);
	expect(matchesThreadSearch(thread, "minji")).toBe(true);
	expect(matchesThreadSearch(thread, "monthly")).toBe(true);
	expect(matchesThreadSearch(thread, "Ciputra")).toBe(false);
	expect(matchesThreadSearch(thread, "  ")).toBe(true);
});
