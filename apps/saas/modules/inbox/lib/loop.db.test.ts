import { createInboxStore } from "@repo/database/inbox";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

import { testDb } from "./test-store";

vi.mock("@repo/auth", () => ({
	auth: {
		api: {
			getSession: vi.fn(),
		},
	},
}));

vi.mock("@repo/database", () => ({
	// The office's manager, who reaches every thread, Unassigned included (ADR 0022).
	getOrganizationMembershipsForUser: vi.fn(async () => [
		{ organizationId: "walk-office", role: "admin" },
	]),
}));

import { auth } from "@repo/auth";

import { POST as approve } from "../../../app/api/conversations/[id]/approve/route";
import { POST as draft } from "../../../app/api/conversations/[id]/draft/route";
import { GET as getConversation } from "../../../app/api/conversations/[id]/route";
import { GET as listConversations } from "../../../app/api/conversations/route";
import { POST as inject } from "../../../app/dev/inbound/route";
import { settleBackgroundWork } from "./background";
import { mockInboxConfig } from "./config";
import { type DraftAdapter, type DraftInput, noDraftAdapter } from "./drafts";
import { NEW_THREAD, replyTemplate } from "./reply-template";
import { peekTestRuntime, setRuntimeForTests } from "./runtime";
import { json, params, post, WALK_SESSION } from "./test-fixtures";
import type { Conversation, ConversationSummary } from "./types";

/**
 * The done line of ADR 0009, walked end to end against a fake draft adapter: a guest who
 * writes back after an approved send returns to Your turn with their message translated
 * under the original and an AI-suggested follow-up in the reply box; the manager approves it
 * and it sends; a third approve with no new inbound is 409. Nothing is sent on its own but the
 * first message's auto-reply (ADR 0021).
 */

const fakeAdapter = (followUp: (input: DraftInput) => string | null): DraftAdapter => ({
	serves: () => true,
	translate: async ({ text, to }) => `[${to}] ${text}`,
	draft: async (input) => followUp(input),
});

const followUps: string[] = [];

beforeEach(async () => {
	vi.mocked(auth.api.getSession).mockReset();
	vi.mocked(auth.api.getSession).mockResolvedValue(WALK_SESSION as never);
	followUps.length = 0;
	setRuntimeForTests({
		store: createInboxStore(testDb),
		config: mockInboxConfig(),
		drafts: fakeAdapter((input) => {
			const guest = input.messages.filter((message) => message.direction === "in");
			const reply = `Follow-up ${guest.length}: about "${guest.at(-1)?.text}"`;
			followUps.push(reply);
			return reply;
		}),
	});
});

afterEach(async () => {
	await settleBackgroundWork();
	const runtime = peekTestRuntime();
	if (runtime) {
		await runtime.store.close();
	}
	setRuntimeForTests(null);
});

async function get(id: string): Promise<Conversation> {
	const opened = await json(
		await getConversation(new Request(`http://localhost/api/conversations/${id}`), params(id)),
	);
	expect(opened.status).toBe(200);
	return opened.body as unknown as Conversation;
}

test("the conversation loop: reply, guest writes back, translated, AI follow-up, reply, 409", async () => {
	// 1. A Korean guest writes in. The one-shot runs now; translation lands in the background.
	const first = await json(
		await inject(
			post("http://localhost/dev/inbound", {
				pipe: "zalo",
				guestId: "loop-guest",
				guestName: "Minji",
				text: "안녕하세요. Tay Ho에서 2 bedroom 임대 찾고 있어요.",
			}),
		),
	);
	expect(first.status).toBe(200);
	let conv = first.body.conversation as Conversation;
	const firstInbound = conv.unansweredInboundId;
	expect(firstInbound).toBe(conv.messages[0].id);
	expect(conv.oneShot?.draft).toMatchObject({ answersMessageId: firstInbound, source: "template" });
	expect(conv.messages[0].translations).toEqual({});

	await settleBackgroundWork();
	conv = await get(conv.id);
	// Once, into the office language: the walk office's is the default, English (ADR 0025).
	expect(conv.messages[0].translations).toEqual({
		en: "[en] 안녕하세요. Tay Ho에서 2 bedroom 임대 찾고 있어요.",
	});
	// The auto-reply went out, so the box takes the follow-up path (ADR 0021, P2): the model
	// drafts for the first message from the conversation, greeting included.
	expect(conv.messages.map((message) => message.source)).toEqual(["guest", "auto-reply"]);
	expect(followUps).toEqual([
		'Follow-up 1: about "안녕하세요. Tay Ho에서 2 bedroom 임대 찾고 있어요."',
	]);
	expect(conv.oneShot?.draft).toMatchObject({ answersMessageId: firstInbound, source: "model" });

	// 2. The manager approves the first reply, naming the message it answers.
	const sentFirst = await json(
		await approve(
			post(`http://localhost/api/conversations/${conv.id}/approve`, {
				inboundId: firstInbound,
				reply: conv.oneShot?.draft.reply,
			}),
			params(conv.id),
		),
	);
	expect(sentFirst.status).toBe(200);
	conv = sentFirst.body.conversation as Conversation;
	expect(conv.sentAt).toBeTruthy();
	expect(conv.unansweredInboundId).toBeNull();
	expect(conv.messages.filter((message) => message.source === "nhip")).toHaveLength(1);

	// 3. The guest writes back. Your turn again: the later-turn template is there at once, the
	//    translation and the model draft follow.
	const second = await json(
		await inject(
			post("http://localhost/dev/inbound", {
				pipe: "zalo",
				guestId: "loop-guest",
				text: "금요일에 볼 수 있을까요?",
			}),
		),
	);
	expect(second.status).toBe(200);
	conv = second.body.conversation as Conversation;
	const secondInbound = conv.unansweredInboundId;
	// The guest's first message, its auto-reply (ADR 0021), the approved reply, then this one.
	expect(secondInbound).toBe(conv.messages[3].id);
	expect(secondInbound).not.toBe(firstInbound);
	expect(conv.sentAt).toBeTruthy();
	expect(conv.oneShot?.draft).toEqual({
		reply: laterTurn("ko", conv),
		answersMessageId: secondInbound,
		source: "template",
	});

	await settleBackgroundWork();
	conv = await get(conv.id);
	expect(conv.messages[3].translations).toEqual({
		en: "[en] 금요일에 볼 수 있을까요?",
	});
	expect(conv.oneShot?.draft).toEqual({
		reply: 'Follow-up 2: about "금요일에 볼 수 있을까요?"',
		answersMessageId: secondInbound,
		source: "model",
	});
	// The model saw the whole conversation, office message included.
	expect(followUps).toHaveLength(2);

	// The list puts the thread back in Your turn: the guest spoke last.
	const listed = await json(
		await listConversations(new Request("http://localhost/api/conversations?locale=vi")),
	);
	const inList = (listed.body as unknown as ConversationSummary[]).find(
		(item) => item.id === conv.id,
	);
	expect(inList?.unansweredInboundId).toBe(secondInbound);

	// 4. The manager approves the suggested follow-up. It sends.
	const sentSecond = await json(
		await approve(
			post(`http://localhost/api/conversations/${conv.id}/approve`, {
				inboundId: secondInbound,
				reply: conv.oneShot?.draft.reply,
			}),
			params(conv.id),
		),
	);
	expect(sentSecond.status).toBe(200);
	conv = sentSecond.body.conversation as Conversation;
	expect(conv.unansweredInboundId).toBeNull();
	const office = conv.messages.filter((message) => message.source === "nhip");
	expect(office).toHaveLength(2);
	expect(office[1].text).toBe('Follow-up 2: about "금요일에 볼 수 있을까요?"');
	expect(conv.answers.map((answer) => answer.status)).toEqual(["sent", "sent"]);
	expect(conv.lastAnswer).toMatchObject({
		inboundId: secondInbound,
		mock: true,
		operatorId: "walk-user",
	});

	// 5. A third approve with no new inbound is 409.
	const third = await json(
		await approve(
			post(`http://localhost/api/conversations/${conv.id}/approve`, {
				inboundId: secondInbound,
				reply: "again",
			}),
			params(conv.id),
		),
	);
	expect(third.status).toBe(409);
	expect(third.body.error).toBe("already_answered");
	conv = await get(conv.id);
	expect(conv.messages.filter((message) => message.source === "nhip")).toHaveLength(2);

	// Regenerate has nothing to draft for either.
	const nothing = await json(
		await draft(post(`http://localhost/api/conversations/${conv.id}/draft`, {}), params(conv.id)),
	);
	expect(nothing.status).toBe(409);

	// Nothing else was sent on its own: past the one auto-reply, every office message is an Answer.
	expect(conv.messages.filter((message) => message.source === "auto-reply")).toHaveLength(1);
	expect(conv.messages.filter((message) => message.direction === "out")).toHaveLength(3);
	expect(conv.answers).toHaveLength(2);
	expect(followUps).toHaveLength(2);
});

test("regenerate asks the model even for a first reply and keeps the operator in charge", async () => {
	// With the auto-reply off, the first message keeps the template, which thanks the guest (ADR 0021 G6, ADR 0024).
	await testDb.officeSetting.create({ data: { officeId: "walk-office", autoReply: false } });
	const injected = await json(
		await inject(
			post("http://localhost/dev/inbound", {
				pipe: "whatsapp",
				guestId: "regen",
				text: "Is the Ciputra flat still available?",
			}),
		),
	);
	let conv = injected.body.conversation as Conversation;
	await settleBackgroundWork();
	expect(followUps).toEqual([]);

	const regenerated = await json(
		await draft(post(`http://localhost/api/conversations/${conv.id}/draft`, {}), params(conv.id)),
	);
	expect(regenerated.status).toBe(200);
	conv = regenerated.body.conversation as Conversation;
	expect(conv.oneShot?.draft.source).toBe("model");
	expect(conv.oneShot?.draft.reply).toBe(
		'Follow-up 1: about "Is the Ciputra flat still available?"',
	);
	// Nothing was sent by asking for a draft.
	expect(conv.messages.filter((message) => message.source === "nhip")).toHaveLength(0);
	expect(conv.unansweredInboundId).toBe(conv.messages[0].id);
});

test("a model draft that touches paperwork never reaches the reply box", async () => {
	const runtime = peekTestRuntime();
	if (!runtime) throw new Error("runtime missing");
	setRuntimeForTests({
		...runtime,
		drafts: fakeAdapter(() => "Yes, as a foreigner you can get a pink book within a month."),
	});
	const injected = await json(
		await inject(
			post("http://localhost/dev/inbound", {
				pipe: "whatsapp",
				guestId: "paperwork",
				text: "Can foreigners get a pink book in Tay Ho?",
			}),
		),
	);
	let conv = injected.body.conversation as Conversation;
	const regenerated = await json(
		await draft(post(`http://localhost/api/conversations/${conv.id}/draft`, {}), params(conv.id)),
	);
	expect(regenerated.status).toBe(200);
	conv = regenerated.body.conversation as Conversation;
	expect(conv.oneShot?.draft.source).toBe("template");
	expect(conv.oneShot?.draft.reply).not.toMatch(/pink book/i);
});

test("without a model there is no translation and every suggestion is a template", async () => {
	const runtime = peekTestRuntime();
	if (!runtime) throw new Error("runtime missing");
	setRuntimeForTests({ ...runtime, drafts: noDraftAdapter });
	const injected = await json(
		await inject(
			post("http://localhost/dev/inbound", {
				pipe: "zalo",
				guestId: "no-model",
				text: "Здравствуйте, ищу аренду в Ciputra",
			}),
		),
	);
	let conv = injected.body.conversation as Conversation;
	await settleBackgroundWork();
	conv = await get(conv.id);
	expect(conv.messages[0].translations).toEqual({});
	await approve(
		post(`http://localhost/api/conversations/${conv.id}/approve`, {
			inboundId: conv.unansweredInboundId,
			reply: conv.oneShot?.draft.reply,
		}),
		params(conv.id),
	);
	await inject(
		post("http://localhost/dev/inbound", { pipe: "zalo", guestId: "no-model", text: "Спасибо" }),
	);
	await settleBackgroundWork();
	conv = await get(conv.id);
	expect(conv.oneShot?.draft).toMatchObject({ reply: laterTurn("ru", conv), source: "template" });
	const regenerated = await json(
		await draft(post(`http://localhost/api/conversations/${conv.id}/draft`, {}), params(conv.id)),
	);
	expect(regenerated.status).toBe(200);
	expect((regenerated.body.conversation as Conversation).oneShot?.draft.source).toBe("template");
});

/**
 * The template once the office has replied (ADR 0024): it introduces no one and asks nothing,
 * whatever the thread holds.
 */
function laterTurn(language: "ko" | "ru", conv: Conversation): string {
	const qualification = conv.oneShot?.qualification;
	if (!qualification) throw new Error("no one-shot");
	return replyTemplate(language, qualification, { ...NEW_THREAD, sentAt: conv.sentAt });
}
