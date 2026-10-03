import { expect, test } from "vitest";

import { matchesThreadSearch } from "./search";
import { DEMO_THREADS } from "./seed";
import type { ConversationSummary } from "./types";

function conv(
	partial: Partial<ConversationSummary> & Pick<ConversationSummary, "id">,
): ConversationSummary {
	return {
		pipe: "whatsapp",
		guestId: partial.guestId || "g1",
		guestName: partial.guestName ?? "Minji",
		officeId: "walk-office",
		owner: null,
		lastGuestInboundAt: null,
		sentAt: null,
		unansweredInboundId: null,
		updatedAt: new Date().toISOString(),
		guestLanguage: null,
		lastInboundText: "",
		...partial,
	};
}

test("search matches guest name or last inbound text", () => {
	const thread = conv({
		id: "whatsapp:demo-ko-stay",
		guestName: "Minji",
		lastInboundText: "Tay Ho에서 3 nights vs monthly stay",
	});

	expect(matchesThreadSearch(thread, "minji")).toBe(true);
	expect(matchesThreadSearch(thread, "monthly")).toBe(true);
	expect(matchesThreadSearch(thread, "Ciputra")).toBe(false);
	expect(matchesThreadSearch(thread, "  ")).toBe(true);
});

test("Ciputra matches the invented Alexei thread only", () => {
	const threads = DEMO_THREADS.map((demo) =>
		conv({
			id: `${demo.pipe}:${demo.guestId}`,
			guestName: demo.guestName,
			pipe: demo.pipe,
			guestId: demo.guestId,
			lastInboundText: demo.text,
		}),
	);
	const hits = threads.filter((thread) => matchesThreadSearch(thread, "Ciputra"));
	expect(hits.map((thread) => thread.guestName)).toEqual(["Alexei"]);
	expect(matchesThreadSearch(hits[0], "alexei")).toBe(true);
});
