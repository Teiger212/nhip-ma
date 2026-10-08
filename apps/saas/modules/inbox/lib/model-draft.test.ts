import { afterEach, beforeEach, expect, test, vi } from "vitest";

vi.mock("next/server", () => ({
	after: () => {
		throw new Error("`after` was called outside a request scope");
	},
}));

import { settleBackgroundWork } from "./background";
import { mockInboxConfig } from "./config";
import type { DraftAdapter, DraftInput } from "./drafts";
import { emptyQualification } from "./extract";
import { DRAFT_DEBOUNCE_MS, draftOnOpen, scheduleModelDraft } from "./model-draft";
import type { Runtime } from "./runtime";
import type { Conversation, Draft, Message, Store } from "./types";

/**
 * When the model drafts (ADR 0024, #252), with fake timers and a fake model: a guest message
 * waits about 30 s, a newer one restarts the wait so a burst gets one draft for its last
 * message, and opening the thread drafts at once, after which the wait asks nothing.
 */

/** Every draft the model is asked for. */
const asked: DraftInput[] = [];

const model: DraftAdapter = {
	serves: () => true,
	translate: async () => null,
	draft: async (input) => {
		asked.push(input);
		const reply = "Happy to help with that.";
		return JSON.stringify({ reply, office_reply: reply });
	},
};

let thread: Conversation;
let sequence = 0;

/** A store that holds the one thread: what the wait reads again, and where the draft lands. */
const store = {
	getOfficeConversation: async () => thread,
	officeLanguage: async () => "en" as const,
	setDraft: async (_officeId: string, _id: string, draft: Draft) => {
		if (!thread.oneShot) return null;
		thread = { ...thread, oneShot: { ...thread.oneShot, draft } };
		return thread;
	},
} as unknown as Store;

const runtime: Runtime = { store, config: mockInboxConfig(), drafts: model };

function message(direction: "in" | "out", text: string): Message {
	sequence += 1;
	return {
		id: `debounce-${sequence}`,
		direction,
		source: direction === "in" ? "guest" : "nhip",
		text,
		at: new Date(Date.UTC(2026, 9, 8, 9, 0, sequence)).toISOString(),
		vendorMessageId: null,
		pipeExternalId: null,
		writtenBy: null,
		translations: {},
	};
}

/** The guest writes: the thread now waits on this message, with the template for it. */
function guestWrites(text: string): Conversation {
	const inbound = message("in", text);
	thread = {
		...thread,
		messages: [...thread.messages, inbound],
		unansweredInboundId: inbound.id,
		oneShot: thread.oneShot && {
			...thread.oneShot,
			draft: { reply: "Noted.", answersMessageId: inbound.id, source: "template" },
		},
	};
	return thread;
}

beforeEach(() => {
	vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
	asked.length = 0;
	// A thread the office has answered once: the model's path (a human reply is on it).
	const first = message("in", "Hi, we're looking to rent in Tay Ho");
	const reply = message("out", "Hello! Happy to help.");
	thread = {
		id: "debounce-thread",
		pipe: "zalo",
		guestId: "debounce-guest",
		guestName: null,
		officeId: "walk-office",
		messages: [first, reply],
		lastGuestInboundAt: first.at,
		sentAt: reply.at,
		unansweredInboundId: null,
		oneShot: {
			language: "en",
			qualification: emptyQualification(),
			paperwork: { mentioned: false, flag: null },
			draft: { reply: "Hello! Happy to help.", answersMessageId: first.id, source: "template" },
		},
		answers: [],
		lastAnswer: null,
		owner: null,
		crm: null,
		officeHasCrm: false,
		autoReplyAt: null,
		updatedAt: reply.at,
	};
});

afterEach(async () => {
	await vi.runAllTimersAsync();
	await settleBackgroundWork();
	vi.useRealTimers();
});

test("the wait is about 30 s", () => {
	expect(DRAFT_DEBOUNCE_MS).toBe(30_000);
});

test("three guest messages within 30 s make one model call, for the last one, once the guest has been quiet for 30 s", async () => {
	scheduleModelDraft(runtime, guestWrites("Could you send some photos?"));
	await vi.advanceTimersByTimeAsync(10_000);
	scheduleModelDraft(runtime, guestWrites("Of the living room especially"));
	await vi.advanceTimersByTimeAsync(10_000);
	scheduleModelDraft(runtime, guestWrites("And is there a balcony?"));

	// 30 s after the first message, but only 10 s after the last: nothing yet.
	await vi.advanceTimersByTimeAsync(10_000);
	expect(asked).toHaveLength(0);

	await vi.advanceTimersByTimeAsync(20_000);
	expect(asked).toHaveLength(1);
	// Written from the thread with the whole burst in it.
	expect(asked[0].messages.at(-1)?.text).toBe("And is there a balcony?");
	expect(asked[0].messages.filter((each) => each.direction === "in")).toHaveLength(4);
	expect(thread.oneShot?.draft).toMatchObject({
		answersMessageId: thread.unansweredInboundId,
		source: "model",
	});

	// Nothing else waits to ask.
	await vi.advanceTimersByTimeAsync(60_000);
	expect(asked).toHaveLength(1);
});

test("opening the thread inside the wait drafts at once, and the wait doesn't draft again", async () => {
	scheduleModelDraft(runtime, guestWrites("Could you send some photos?"));
	await vi.advanceTimersByTimeAsync(5_000);
	expect(asked).toHaveLength(0);

	draftOnOpen(runtime, thread);
	await vi.advanceTimersByTimeAsync(0);
	expect(asked).toHaveLength(1);
	expect(thread.oneShot?.draft.source).toBe("model");

	// The thread is read again on every poll while open, and the wait runs out: no second call.
	draftOnOpen(runtime, thread);
	await vi.advanceTimersByTimeAsync(DRAFT_DEBOUNCE_MS);
	expect(asked).toHaveLength(1);
});

test("a draft the post-check blocked isn't asked for again on every poll of the open thread", async () => {
	const blocking: DraftAdapter = {
		...model,
		draft: async (input) => {
			asked.push(input);
			const reply = "Yes, the pink book is ready and the rent is $2,000 a month.";
			return JSON.stringify({ reply, office_reply: reply });
		},
	};
	const blocked = { ...runtime, drafts: blocking };
	guestWrites("Is the pink book ready?");
	draftOnOpen(blocked, thread);
	await vi.advanceTimersByTimeAsync(0);
	expect(asked).toHaveLength(1);
	expect(thread.oneShot?.draft.source).toBe("template");

	for (let poll = 0; poll < 5; poll += 1) {
		draftOnOpen(blocked, thread);
		await vi.advanceTimersByTimeAsync(1_000);
	}
	expect(asked).toHaveLength(1);
});

test("before the office's first human reply, neither the wait nor opening the thread asks the model", async () => {
	thread = {
		...thread,
		sentAt: null,
		messages: thread.messages.filter((each) => each.direction === "in"),
	};
	scheduleModelDraft(runtime, guestWrites("Is anyone there?"));
	draftOnOpen(runtime, thread);
	await vi.advanceTimersByTimeAsync(DRAFT_DEBOUNCE_MS * 2);
	expect(asked).toHaveLength(0);
	expect(thread.oneShot?.draft.source).toBe("template");
});
