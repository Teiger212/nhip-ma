import { beforeEach, expect, test } from "vitest";

import { oneShot } from "./draft";
import { yourTurn } from "./queue";
import { summarize } from "./summary";
import { testInboxStore } from "./test-store";
import type { ConversationSummary, InboxViewer, Store } from "./types";

/**
 * The list reads summaries built in SQL, and the nav counts Your turn in SQL; the open
 * thread is loaded whole and derives the same facts in code. These prove the two agree on
 * every queue case: Your turn (ADR 0004) read off the Answers, not message order
 * (ADR 0011), and only for the threads the viewer may open (ADR 0015).
 */
const OFFICE = "office-a";
const OTHER_OFFICE = "office-b";
const T0 = Date.parse("2026-09-20T08:00:00.000Z");
const at = (minutes: number) => new Date(T0 + minutes * 60_000);

let store: Store;

function write(
	guestId: string,
	source: "guest" | "oa-echo",
	text: string,
	minutes: number,
	officeId = OFFICE,
) {
	return store.upsertInbound(
		{
			pipe: "zalo",
			source,
			guestId,
			guestName: guestId,
			text,
			vendorMessageId: null,
			at: at(minutes),
		},
		officeId,
	);
}

/** An approval of the guest's waiting message, left in flight unless `then` settles it. */
async function approve(
	conversationId: string,
	inboundId: string,
	operatorId: string,
	then: "sending" | "sent" | "failed" | "unknown",
) {
	const begun = await store.beginAnswer({
		officeId: OFFICE,
		conversationId,
		inboundId,
		text: "reply",
		operatorId,
	});
	if (!begun.ok) throw new Error(`beginAnswer: ${begun.reason}`);
	if (then === "sent") {
		await store.completeAnswer(OFFICE, begun.answer.id, {
			mock: true,
			pipe: "zalo",
			vendorMessageId: `mock-${begun.answer.id}`,
		});
	}
	if (then === "failed") await store.failAnswer(OFFICE, begun.answer.id, "refused");
	if (then === "unknown") await store.markAnswerUnknown(OFFICE, begun.answer.id, "timeout");
}

async function guestThenApproval(
	guestId: string,
	operatorId: string,
	then: "sending" | "sent" | "failed" | "unknown",
) {
	const conv = await write(guestId, "guest", `${guestId} asks`, 0);
	await approve(conv.id, conv.unansweredInboundId!, operatorId, then);
	return conv;
}

const byId = (list: ConversationSummary[]) => [...list].sort((a, b) => a.id.localeCompare(b.id));

const manager: InboxViewer = { userId: "walk-user", officeId: OFFICE, role: "manager" };
const agentOne: InboxViewer = { userId: "agent-1", officeId: OFFICE, role: "agent" };
const agentTwo: InboxViewer = { userId: "agent-2", officeId: OFFICE, role: "agent" };
/** No role reads as an agent (ADR 0015). */
const noRole: InboxViewer = { userId: "agent-2", officeId: OFFICE };
const elsewhere: InboxViewer = { userId: "agent-1", officeId: OTHER_OFFICE, role: "manager" };

beforeEach(async () => {
	store = await testInboxStore();

	// Nobody has answered: Your turn, in the pool. The one-shot has run on it.
	const fresh = await write("fresh", "guest", "Looking to rent in Tay Ho", 0);
	await store.setOneShot(
		fresh.officeId,
		fresh.id,
		oneShot("Looking to rent in Tay Ho", fresh.unansweredInboundId),
	);
	// Each approval claims the thread for its approver (ADR 0015).
	await guestThenApproval("sent", "agent-1", "sent");
	await guestThenApproval("failed", "agent-1", "failed");
	await guestThenApproval("unknown", "agent-1", "unknown");
	await guestThenApproval("sending", "agent-2", "sending");

	// Answered from the vendor's own app.
	await write("echo", "guest", "echo asks", 0);
	await write("echo", "oa-echo", "answered from the app", 5);

	// The guest writes again while the reply to their first message is still sending.
	const midSend = await write("midsend", "guest", "first question", 0);
	await approve(midSend.id, midSend.unansweredInboundId!, "agent-2", "sending");
	await write("midsend", "guest", "second question", 1);

	// Sent, then the guest wrote back.
	await guestThenApproval("wroteback", "agent-1", "sent");
	await write("wroteback", "guest", "one more thing", 30);

	// Answered from the app, then the guest wrote again.
	await write("echo-then-guest", "guest", "hello", 0);
	await write("echo-then-guest", "oa-echo", "hi", 5);
	await write("echo-then-guest", "guest", "are you there?", 10);

	// Same instant: arrival order decides which came after.
	await write("tie-echo-after", "guest", "tie question", 0);
	await write("tie-echo-after", "oa-echo", "tie reply", 0);
	await write("tie-guest-after", "oa-echo", "we wrote first", 0);
	await write("tie-guest-after", "guest", "and I answered", 0);

	// The office wrote first from its app; the guest never has.
	await write("office-only", "oa-echo", "hello from the office", 0);

	// Another office's guest, waiting.
	await write("other-office", "guest", "not yours", 0, OTHER_OFFICE);
});

test("the list's summaries say what the open threads say, for every queue case and viewer (ADR 0004, ADR 0011, ADR 0015)", async () => {
	for (const viewer of [manager, agentOne, agentTwo, noRole, elsewhere]) {
		const summaries = await store.listConversationSummaries(viewer);
		const whole = await store.listConversations(viewer);
		expect(byId(summaries), `${viewer.userId} in ${viewer.officeId}`).toEqual(
			byId(whole.map(summarize)),
		);
	}
});

test("Your turn in the list is the guest's latest message with nothing answering it (ADR 0004, ADR 0011)", async () => {
	const summaries = await store.listConversationSummaries(manager);
	expect(
		summaries
			.filter(yourTurn)
			.map((thread) => thread.guestId)
			.sort(),
	).toEqual(["echo-then-guest", "failed", "fresh", "midsend", "tie-guest-after", "wroteback"]);
	const preview = Object.fromEntries(summaries.map((t) => [t.guestId, t.lastInboundText]));
	// The guest's latest message, even when the office spoke after it; "" when they never wrote.
	expect(preview.sent).toBe("sent asks");
	expect(preview.midsend).toBe("second question");
	expect(preview["office-only"]).toBe("");
	const fresh = summaries.find((thread) => thread.guestId === "fresh");
	expect(fresh?.guestLanguage).toBe("en");
	expect(summaries.find((thread) => thread.guestId === "echo")?.guestLanguage).toBeNull();
});
