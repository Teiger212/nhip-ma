import { createInboxStore } from "@repo/database/inbox";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { testDb, useTestDatabaseForAppClient } from "./test-store";

useTestDatabaseForAppClient();

import { settleBackgroundWork } from "./background";
import { mockInboxConfig } from "./config";
import { type DraftAdapter, type DraftInput, noDraftAdapter } from "./drafts";
import { greetingAsks, greetingLabel, greetingQuestion } from "./greeting";
import {
	applyOneShot,
	approveAndSend,
	refreshTemplate,
	ingestEvents,
	injectDevInbound,
	regenerateDraft,
} from "./inbox";
import { type Runtime, setRuntimeForTests } from "./runtime";
import {
	connectZaloOa,
	guestMessage,
	membership,
	TEST_SECRETS_KEY,
	threadOf,
} from "./test-fixtures";
import type { Conversation, InboundEvent, Message } from "./types";

/**
 * The template auto-reply (ADR 0021, spec #159, #165): a new guest's first message gets one
 * greeting, sent on its own; it is not an Answer, so the thread stays Your turn and the
 * funnel counts no human reply. These run through the webhook path (`ingestEvents`) and read
 * the result back as the inbox and Home do.
 */

const OFFICE = "office-a";
const OA = "oa-1";
const MANAGER = { userId: "agent-1", officeId: OFFICE, role: "manager" as const };

let runtime: Runtime;

beforeEach(async () => {
	runtime = {
		store: createInboxStore(testDb),
		config: mockInboxConfig({ pipeSecretsKey: TEST_SECRETS_KEY }),
		drafts: noDraftAdapter,
	};
	setRuntimeForTests(runtime);
	await runtime.store.claimPipe({ pipe: "zalo", externalId: OA, officeId: OFFICE });
});

afterEach(async () => {
	await settleBackgroundWork();
	setRuntimeForTests(null);
});

let seq = 0;

function guest(guestId: string, text: string, extra: Partial<InboundEvent> = {}): InboundEvent {
	seq += 1;
	return guestMessage(guestId, {
		text,
		vendorMessageId: `zalo-msg-${seq}`,
		at: Date.now() + seq,
		pipeExternalId: OA,
		...extra,
	});
}

/** The office replying from the Zalo OA app itself, as Zalo echoes it. */
function oaEcho(guestId: string, vendorMessageId: string, text = "Hello from the OA app") {
	return guest(guestId, text, { source: "oa-echo", vendorMessageId });
}

async function arrive(...events: InboundEvent[]): Promise<void> {
	await ingestEvents(runtime, events);
	await settleBackgroundWork();
}

async function thread(guestId: string): Promise<Conversation> {
	const { id } = await threadOf(OFFICE, guestId);
	return (await runtime.store.getOfficeConversation(OFFICE, id)) as Conversation;
}

/** The template's office intro on an Unassigned thread (ADR 0024). */
const INTRO = new RegExp(`^Hi, this is ${OFFICE}\\.`);

/** What "Hi, we're looking to rent an apartment in Tay Ho" gives. */
const RENT_IN_TAY_HO = {
	areaOfInterest: "Tây Hồ",
	nationality: null,
	inVietnamNow: null,
	rentOrBuy: "rent" as const,
	timeframe: null,
	budgetBand: null,
	bedsOrHousehold: null,
};

function autoReplies(conversation: Conversation): Message[] {
	return conversation.messages.filter((message) => message.source === "auto-reply");
}

async function funnel() {
	return runtime.store.funnel(MANAGER, {
		since: new Date(Date.now() - 24 * 60 * 60 * 1000),
		countMock: true,
		timeZone: "Asia/Ho_Chi_Minh",
	});
}

describe("a new guest's first message gets one auto-reply (G1)", () => {
	test("the template, as the office's message, written by the template, labelled last", async () => {
		await arrive(guest("g1", "Hi, we're looking to rent an apartment in Tay Ho"));
		const conversation = await thread("g1");
		const [greeting] = autoReplies(conversation);
		expect(greeting).toMatchObject({ direction: "out", writtenBy: "template", mock: true });
		expect(greeting.text.split("\n").at(-1)).toBe(greetingLabel("en", OFFICE));
		expect(greeting.text).toContain("renting in Tây Hồ");
		// After the message it greets, even when the vendor's clock runs ahead of ours.
		await arrive(guest("g1b", "Hello", { at: Date.now() + 60_000 }));
		expect((await thread("g1b")).messages.map((message) => message.source)).toEqual([
			"guest",
			"auto-reply",
		]);
		expect(conversation.messages).toHaveLength(2);
	});

	test("two first messages at once make one auto-reply (the claim)", async () => {
		await Promise.all([
			ingestEvents(runtime, [guest("g2", "Hello")]),
			ingestEvents(runtime, [guest("g2", "Looking to rent")]),
		]);
		await settleBackgroundWork();
		expect(autoReplies(await thread("g2"))).toHaveLength(1);
	});

	test("the guest's second message gets no second one", async () => {
		await arrive(guest("g3", "Hello"));
		await arrive(guest("g3", "Are you there?"));
		const conversation = await thread("g3");
		expect(autoReplies(conversation)).toHaveLength(1);
		expect(conversation.messages).toHaveLength(3);
	});

	test("a thread the office began from its own app is never greeted", async () => {
		await arrive(oaEcho("g4", "oa-first"));
		await arrive(guest("g4", "Hi, thanks for reaching out"));
		expect(autoReplies(await thread("g4"))).toHaveLength(0);
	});

	test("an office that turned it off greets no one", async () => {
		await testDb.officeSetting.create({ data: { officeId: OFFICE, autoReply: false } });
		await arrive(guest("g5", "Hello"));
		expect(autoReplies(await thread("g5"))).toHaveLength(0);
	});

	test("turned back on, it greets a new guest, never one whose thread began while it was off (S1)", async () => {
		await testDb.officeSetting.create({ data: { officeId: OFFICE, autoReply: false } });
		// A minute before it comes back on (this file's guests otherwise write a few ms ahead).
		await arrive(guest("s1-before", "Hello", { at: Date.now() - 60_000 }));
		await testDb.officeSetting.update({
			where: { officeId: OFFICE },
			data: { autoReply: true, autoReplyOnSince: new Date() },
		});
		await arrive(guest("s1-before", "Are you there?"));
		await arrive(guest("s1-after", "Hello"));
		expect(autoReplies(await thread("s1-before"))).toHaveLength(0);
		expect(autoReplies(await thread("s1-after"))).toHaveLength(1);
	});

	test("a disconnected OA greets no one, and the guest is still Your turn", async () => {
		await connectZaloOa(runtime.store, OA, { disconnected: true });
		await arrive(guest("g6", "Hello"));
		const conversation = await thread("g6");
		expect(autoReplies(conversation)).toHaveLength(0);
		expect(conversation.unansweredInboundId).toBe(conversation.messages[0].id);
	});

	test("the seed's guests are not greeted; a dev-injected guest is", async () => {
		await injectDevInbound(
			{ pipe: "zalo", guestId: "seeded", text: "Hello", officeId: OFFICE },
			{ autoReply: false },
		);
		await injectDevInbound({ pipe: "zalo", guestId: "injected", text: "Hello", officeId: OFFICE });
		await settleBackgroundWork();
		expect(autoReplies(await thread("seeded"))).toHaveLength(0);
		expect(autoReplies(await thread("injected"))).toHaveLength(1);
	});
});

describe("the auto-reply is not a reply (G5, R10)", () => {
	test("the thread stays Your turn, unowned and unsent", async () => {
		await arrive(guest("q1", "Hello"));
		const conversation = await thread("q1");
		expect(autoReplies(conversation)).toHaveLength(1);
		expect(conversation.unansweredInboundId).toBe(conversation.messages[0].id);
		expect(conversation).toMatchObject({ sentAt: null, owner: null, answers: [] });
		const [summary] = await runtime.store.listConversationSummaries(MANAGER);
		expect(summary.unansweredInboundId).toBe(conversation.messages[0].id);
	});

	test("the funnel counts it nowhere: not Engaged, no response time", async () => {
		await arrive(guest("f1", "Hello"));
		expect(autoReplies(await thread("f1"))).toHaveLength(1);
		await arrive(guest("f1", "Rent, please"));
		expect(await funnel()).toMatchObject({
			leadsIn: 1,
			engaged: 0,
			inConversation: 0,
			responseTime: null,
		});
	});

	test("its echo from Zalo is a duplicate, not a reply from the office's app", async () => {
		await arrive(guest("e1", "Hello"));
		const before = await thread("e1");
		expect(autoReplies(before)).toHaveLength(1);
		await arrive(oaEcho("e1", `mock-auto-reply-${before.id}`, autoReplies(before)[0].text));
		const after = await thread("e1");
		expect(after.messages.filter((message) => message.source === "oa-echo")).toHaveLength(0);
		expect(after.messages).toHaveLength(2);
		expect(after.unansweredInboundId).toBe(before.messages[0].id);
		expect((await funnel()).engaged).toBe(0);
	});
});

describe("one send attempt (ADR 0021, Consequences)", () => {
	test("a failed send is not retried, and is logged by category without the thread or text", async () => {
		runtime.config = mockInboxConfig({
			sendMode: "live",
			zalo: { appId: "app-1", appSecret: "app-secret", oaSecretKey: "oa-secret" },
			pipeSecretsKey: TEST_SECRETS_KEY,
		});
		await connectZaloOa(runtime.store, OA);
		const fetch = vi.fn(async () => {
			throw new TypeError("fetch failed");
		});
		vi.stubGlobal("fetch", fetch);
		const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);

		await arrive(guest("s1", "Hello, private details here"));
		await arrive(guest("s1", "Anyone?"));

		const conversation = await thread("s1");
		expect(autoReplies(conversation)).toHaveLength(0);
		expect(fetch).toHaveBeenCalledTimes(1);
		const logged = JSON.stringify(warn.mock.calls);
		expect(logged).toContain("auto-reply send failed");
		expect(logged).not.toContain(conversation.id);
		expect(logged).not.toContain("private details");
	});

	test("a live deployment never greets from an OA the office hasn't connected", async () => {
		runtime.config = mockInboxConfig({
			sendMode: "live",
			zalo: { appId: "app-1", appSecret: "app-secret", oaSecretKey: "oa-secret" },
			pipeSecretsKey: TEST_SECRETS_KEY,
		});
		const fetch = vi.fn(async () => new Response("{}"));
		vi.stubGlobal("fetch", fetch);

		await arrive(guest("l1", "Hello"));

		const conversation = await thread("l1");
		expect(autoReplies(conversation)).toHaveLength(0);
		expect(fetch).not.toHaveBeenCalled();
		expect(conversation.unansweredInboundId).toBe(conversation.messages[0].id);
	});
});

describe("the switch (ADR 0021 G6, S1, #167)", () => {
	async function setting() {
		return testDb.officeSetting.findUnique({ where: { officeId: OFFICE } });
	}

	test("turning it off, then on, stamps when it came back on", async () => {
		await runtime.store.setOfficeAutoReply(OFFICE, false);
		expect(await setting()).toMatchObject({ autoReply: false, autoReplyOnSince: null });
		const before = Date.now();
		await runtime.store.setOfficeAutoReply(OFFICE, true);
		const on = await setting();
		expect(on?.autoReply).toBe(true);
		// Now, in UTC: neither before the call nor after it (a time-zone slip is hours off).
		expect(on?.autoReplyOnSince?.getTime()).toBeGreaterThanOrEqual(before);
		expect(on?.autoReplyOnSince?.getTime()).toBeLessThanOrEqual(Date.now());
		expect(await runtime.store.officeAutoReply(OFFICE)).toMatchObject({
			on: true,
			onSince: on?.autoReplyOnSince?.toISOString(),
		});
	});

	test("turning on what is already on moves nothing, so no thread begun meanwhile is skipped", async () => {
		await runtime.store.setOfficeAutoReply(OFFICE, true);
		expect(await setting()).toMatchObject({ autoReply: true, autoReplyOnSince: null });
		await runtime.store.setOfficeAutoReply(OFFICE, false);
		await runtime.store.setOfficeAutoReply(OFFICE, true);
		const stamped = (await setting())?.autoReplyOnSince;
		await runtime.store.setOfficeAutoReply(OFFICE, true);
		expect((await setting())?.autoReplyOnSince).toEqual(stamped);
	});
});

describe("the claim (ADR 0021: at most one greeting per thread, held by the database)", () => {
	test("of five claims at once, exactly one wins", async () => {
		const { conversation } = await runtime.store.upsertInbound(guest("c1", "Hello"), OFFICE);
		const claims = await Promise.all(
			Array.from({ length: 5 }, () => runtime.store.claimAutoReply(OFFICE, conversation.id)),
		);
		expect(claims.filter(Boolean)).toHaveLength(1);
	});

	test("a thread the office has replied on can't be claimed", async () => {
		const { conversation } = await runtime.store.upsertInbound(guest("c2", "Hello"), OFFICE);
		await runtime.store.upsertInbound(oaEcho("c2", "oa-reply"), OFFICE);
		expect(await runtime.store.claimAutoReply(OFFICE, conversation.id)).toBe(false);
	});

	test("another office can't claim the thread", async () => {
		const { conversation } = await runtime.store.upsertInbound(guest("c3", "Hello"), OFFICE);
		expect(await runtime.store.claimAutoReply("office-b", conversation.id)).toBe(false);
		expect(await runtime.store.claimAutoReply(OFFICE, conversation.id)).toBe(true);
	});
});

describe("after the auto-reply, the reply box takes the follow-up path (R11, P2)", () => {
	const followUps: DraftInput[] = [];
	const model: DraftAdapter = {
		serves: () => true,
		translate: async () => null,
		draft: async (input) => {
			followUps.push(input);
			// The model's JSON (#251); the office's language is the guest's, English.
			const reply = "Happy to help with your search. Which budget did you have in mind?";
			return JSON.stringify({ reply, office_reply: reply });
		},
	};

	beforeEach(() => {
		followUps.length = 0;
	});

	/** The template after the greeting (ADR 0024): the office named, no second thanks, no repeat. */
	function expectTemplateAfterGreeting(conversation: Conversation, answers: string) {
		const draft = conversation.oneShot?.draft;
		expect(draft).toMatchObject({ answersMessageId: answers, source: "template" });
		expect(draft?.reply).toMatch(INTRO);
		expect(draft?.reply).not.toMatch(/thank|colleague/i);
		const asked = greetingAsks(RENT_IN_TAY_HO);
		expect(asked.length).toBeGreaterThan(0);
		for (const qualifier of asked) {
			expect(draft?.reply).not.toContain(greetingQuestion("en", qualifier));
		}
	}

	test("without a model, the box holds the template written after the greeting, for the first message and the next", async () => {
		await arrive(guest("p1", "Hi, we're looking to rent an apartment in Tay Ho"));
		let conversation = await thread("p1");
		expect(autoReplies(conversation)).toHaveLength(1);
		expectTemplateAfterGreeting(conversation, conversation.messages[0].id);

		await arrive(guest("p1", "Is anyone there?"));
		conversation = await thread("p1");
		expectTemplateAfterGreeting(conversation, conversation.messages[2].id);
	});

	test("asking for a new suggestion without a model puts back the template", async () => {
		await arrive(guest("p2", "Hello, renting in Tay Ho"));
		const conversation = await thread("p2");
		expect(conversation.oneShot?.draft.reply).toMatch(INTRO);
		const result = await regenerateDraft(conversation.id, MANAGER);
		expect(result.ok && result.conversation.oneShot?.draft).toEqual(conversation.oneShot?.draft);
	});

	test("with a model, the greeted thread keeps the template until the office's first human reply; the model's follow-up then reads the conversation with the greeting in it", async () => {
		runtime.drafts = model;
		runtime.draftDebounceMs = 0;
		await arrive(guest("p3", "Hi, we're looking to rent an apartment in Tay Ho"));
		let conversation = await thread("p3");
		// ADR 0024, amending P2: no model draft after the greeting alone.
		expectTemplateAfterGreeting(conversation, conversation.messages[0].id);

		// The guest writes again before any human reply: still the template, still no model.
		await arrive(guest("p3", "Two bedrooms, please"));
		conversation = await thread("p3");
		expect(conversation.oneShot?.draft).toMatchObject({
			answersMessageId: conversation.messages[2].id,
			source: "template",
		});
		expect(followUps).toHaveLength(0);

		// The office replies from its own app, and the guest writes again: the model drafts.
		await arrive(oaEcho("p3", "oa-reply-p3"));
		await arrive(guest("p3", "Is Saturday possible?"));
		const later = await thread("p3");
		expect(followUps).toHaveLength(1);
		expect(followUps[0].messages.map((message) => message.source)).toEqual([
			"guest",
			"auto-reply",
			"guest",
			"oa-echo",
			"guest",
		]);
		expect(followUps[0].messages[1].text).toBe(autoReplies(later)[0].text);
		expect(later.oneShot?.draft).toEqual({
			reply: "Happy to help with your search. Which budget did you have in mind?",
			answersMessageId: later.messages[4].id,
			source: "model",
		});
	});

	test("a guest message read before the greeting was filed still ends on the template written after it", async () => {
		await arrive(guest("p5", "Hello"));
		const greeted = await thread("p5");
		expect(autoReplies(greeted)).toHaveLength(1);
		// The second message's thread as read before the greeting's row: the one-shot decides
		// from it, then finds the greeting on the stored thread.
		const { conversation: stale } = await runtime.store.upsertInbound(
			guest("p5", "Renting in Tay Ho"),
			OFFICE,
		);
		const before = {
			...stale,
			messages: stale.messages.filter((message) => message.source !== "auto-reply"),
		};
		const result = await applyOneShot(runtime.store, before);
		expect(result?.oneShot?.draft).toMatchObject({
			answersMessageId: result?.messages.at(-1)?.id,
			source: "template",
		});
		// The greeting thanked the guest; the template written for the stored thread doesn't.
		expect(result?.oneShot?.draft.reply).toMatch(INTRO);
		expect(result?.oneShot?.draft.reply).not.toMatch(/thank/i);
	});

	test("with no greeting sent, the template thanks the guest itself", async () => {
		await connectZaloOa(runtime.store, OA, { disconnected: true });
		await arrive(guest("p4", "Hi, we're looking to rent an apartment in Tay Ho"));
		const conversation = await thread("p4");
		expect(autoReplies(conversation)).toHaveLength(0);
		expect(conversation.oneShot?.draft.reply).toBe(
			`Hi, this is ${OFFICE}. Thanks for getting in touch. I'll pull together a few options to rent in Tây Hồ and send them here shortly. What budget do you have in mind?`,
		);
	});
});

describe("the funnel ignores the auto-reply from first message to conversation (R10, First greeting 3)", () => {
	test("Engaged, In conversation and response time move only with the human reply", async () => {
		// Ten minutes before the greeting and the reply, so a response time run from the
		// greeting would read near zero.
		const tenMinutes = 10 * 60 * 1000;
		await arrive(
			guest("n1", "Hi, we're looking to rent an apartment in Tay Ho", {
				at: Date.now() - tenMinutes,
			}),
		);
		let conversation = await thread("n1");
		expect(autoReplies(conversation)).toHaveLength(1);
		expect(conversation.unansweredInboundId).toBe(conversation.messages[0].id);
		expect(await funnel()).toMatchObject({
			leadsIn: 1,
			engaged: 0,
			inConversation: 0,
			responseTime: null,
		});

		// The guest writes back before any human reply: the greeting started no conversation.
		// Just after the greeting, so it is surely before the reply that follows.
		const greetedAt = Date.parse(autoReplies(conversation)[0].at);
		await arrive(guest("n1", "Our budget is flexible", { at: greetedAt + 1 }));
		conversation = await thread("n1");
		expect(conversation.messages.map((message) => message.source)).toEqual([
			"guest",
			"auto-reply",
			"guest",
		]);
		expect(conversation.unansweredInboundId).toBe(conversation.messages[2].id);
		expect(await funnel()).toMatchObject({ engaged: 0, inConversation: 0, responseTime: null });

		// The manager approves a reply: Engaged, and the response time runs from the guest's
		// first message, not from the greeting.
		const sent = await approveAndSend(
			conversation.id,
			{ inboundId: conversation.unansweredInboundId ?? undefined, text: "Welcome! Let's talk." },
			MANAGER,
		);
		expect(sent.ok).toBe(true);
		conversation = await thread("n1");
		const answeredAt = Date.parse(conversation.answers[0].sentAt ?? "");
		const firstAt = Date.parse(conversation.messages[0].at);
		const afterReply = await funnel();
		expect(afterReply).toMatchObject({ leadsIn: 1, engaged: 1, inConversation: 0 });
		expect(answeredAt - firstAt).toBeGreaterThanOrEqual(tenMinutes);
		expect(afterReply.responseTime).toMatchObject({
			answered: 1,
			medianMs: answeredAt - firstAt,
			buckets: { under5m: 0, from5to15m: 1 },
		});

		await arrive(guest("n1", "Great, thanks"));
		expect(await funnel()).toMatchObject({ leadsIn: 1, engaged: 1, inConversation: 1 });
	});
});

describe("assigning writes the untouched template again in the owner's name (ADR 0024)", () => {
	beforeEach(async () => {
		await membership(OFFICE, "agent-1", "member");
		await testDb.user.update({ where: { id: "agent-1" }, data: { name: "Lan Pham" } });
	});

	/** As the owner route does: move the thread, then write its template again. */
	async function assign(conversation: Conversation, ownerId: string | null) {
		expect(await runtime.store.reassign(conversation.id, ownerId, OFFICE)).not.toBeNull();
		const moved = await runtime.store.getOfficeConversation(OFFICE, conversation.id);
		if (!moved) throw new Error("thread gone");
		return (await refreshTemplate(runtime.store, moved)) as Conversation;
	}

	test("an Unassigned thread's template names the office; assigned, it introduces the owner by first name; back to Unassigned, the office again", async () => {
		await arrive(guest("a1", "Hi, we're looking to rent an apartment in Tay Ho"));
		const unassigned = await thread("a1");
		expect(unassigned.owner).toBeNull();
		expect(unassigned.oneShot?.draft.reply).toMatch(INTRO);

		const assigned = await assign(unassigned, "agent-1");
		expect(assigned.oneShot?.draft).toMatchObject({
			answersMessageId: unassigned.oneShot?.draft.answersMessageId,
			source: "template",
		});
		expect(assigned.oneShot?.draft.reply).toMatch(new RegExp(`^Hi, I'm Lan from ${OFFICE}\\.`));
		expect(assigned.oneShot?.draft.reply).not.toContain("Pham");

		const returned = await assign(assigned, null);
		expect(returned.oneShot?.draft.reply).toBe(unassigned.oneShot?.draft.reply);
	});

	test("a model's draft is left as it is", async () => {
		await arrive(guest("a2", "Hi, we're looking to rent an apartment in Tay Ho"));
		const conversation = await thread("a2");
		const modelDraft = {
			reply: "Happy to help.",
			answersMessageId: conversation.unansweredInboundId,
			source: "model" as const,
		};
		await runtime.store.setDraft(OFFICE, conversation.id, modelDraft);
		const assigned = await assign(conversation, "agent-1");
		expect(assigned.oneShot?.draft).toEqual(modelDraft);
	});

	test("a model draft that lands after the thread was read is not overwritten by its template", async () => {
		await arrive(guest("a4", "Hi, we're looking to rent an apartment in Tay Ho"));
		const read = await thread("a4");
		expect(await runtime.store.reassign(read.id, "agent-1", OFFICE)).not.toBeNull();
		const modelDraft = {
			reply: "Happy to help.",
			answersMessageId: read.unansweredInboundId,
			source: "model" as const,
		};
		await runtime.store.setDraft(OFFICE, read.id, modelDraft);
		// The thread as read before the model's draft landed, with its new owner.
		const stale = { ...read, owner: { id: "agent-1", name: "Lan Pham" } };
		const after = await refreshTemplate(runtime.store, stale);
		expect(after?.oneShot?.draft).toEqual(modelDraft);
	});

	test("once the office has replied, the later-turn template names no one, assigned or not", async () => {
		await arrive(guest("a3", "Hi, we're looking to rent an apartment in Tay Ho"));
		const first = await thread("a3");
		const sent = await approveAndSend(
			first.id,
			{ inboundId: first.unansweredInboundId ?? undefined, text: "Hello! Happy to help." },
			MANAGER,
		);
		expect(sent.ok).toBe(true);
		await arrive(guest("a3", "Great, how many options do you have?"));
		const later = await thread("a3");
		const assigned = await assign(later, "agent-1");
		expect(assigned.oneShot?.draft.reply).toBe(later.oneShot?.draft.reply);
		expect(assigned.oneShot?.draft.reply).not.toContain("Lan");
		expect(assigned.oneShot?.draft.reply).not.toContain(OFFICE);
	});
});
