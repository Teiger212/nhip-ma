import { expect, test } from "vitest";

import { sendStatusFor } from "./send-status";
import type { Conversation } from "./types";

type Answer = NonNullable<Conversation["lastAnswer"]>;

const answer = (status: Answer["status"]): Answer =>
	({ id: "a1", status, inboundId: "m1" }) as Answer;

const thread = (overrides: Partial<Conversation> = {}): Conversation =>
	({
		id: "office:zalo:guest",
		unansweredInboundId: null,
		sentAt: "2026-09-20T10:00:00.000Z",
		lastAnswer: answer("sent"),
		...overrides,
	}) as Conversation;

test("a send in flight outranks everything, then the last error", () => {
	expect(sendStatusFor({ sending: true, error: "boom", conversation: thread() })).toEqual({
		kind: "sending",
	});
	expect(sendStatusFor({ sending: false, error: "boom", conversation: thread() })).toEqual({
		kind: "error",
		message: "boom",
	});
});

test("an Answer of unknown outcome is said before the last send", () => {
	const conversation = thread({ lastAnswer: answer("unknown") });
	expect(sendStatusFor({ sending: false, error: null, conversation })).toEqual({ kind: "unknown" });
});

test("a thread with nothing open and a send on record says when it was sent", () => {
	expect(sendStatusFor({ sending: false, error: null, conversation: thread() })).toEqual({
		kind: "sent",
		at: "2026-09-20T10:00:00.000Z",
	});
});

test("an open guest message, or no thread, means nothing has been sent for it", () => {
	const open = thread({ unansweredInboundId: "m2" });
	expect(sendStatusFor({ sending: false, error: null, conversation: open })).toEqual({
		kind: "none",
	});
	expect(sendStatusFor({ sending: false, error: null, conversation: null })).toEqual({
		kind: "none",
	});
});
