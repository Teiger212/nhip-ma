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
	getOrganizationMembershipsForUser: vi.fn(async () => [
		{ organizationId: "walk-office", role: "admin" },
	]),
}));

import { auth } from "@repo/auth";

import { GET as getConversation } from "../../../app/api/conversations/[id]/route";
import { POST as inject } from "../../../app/dev/inbound/route";
import { settleBackgroundWork } from "./background";
import { mockInboxConfig } from "./config";
import type { DraftAdapter, DraftInput } from "./drafts";
import { greetingQuestion } from "./greeting";
import { peekTestRuntime, setRuntimeForTests } from "./runtime";
import { json, params, post, WALK_SESSION } from "./test-fixtures";
import type { Conversation } from "./types";

/**
 * The model's suggested reply (ADR 0024, #251), against a fake draft adapter: what the model
 * reads (the last 10 messages, the auto-reply included, and the auto-reply's open question),
 * and what is stored of its JSON answer (the reply in the guest's language, and the same reply
 * in the office language, ADR 0025). Anything but the JSON leaves the template.
 */

const OFFICE = "walk-office";

/** Every draft the model is asked for, in order. */
const inputs: DraftInput[] = [];
/** What the fake model answers for a draft. */
let answer: (input: DraftInput) => string | null = () => null;

const adapter: DraftAdapter = {
	serves: () => true,
	translate: async ({ text, to }) => `[${to}] ${text}`,
	draft: async (input) => {
		inputs.push(input);
		return answer(input);
	},
};

beforeEach(() => {
	vi.mocked(auth.api.getSession).mockReset();
	vi.mocked(auth.api.getSession).mockResolvedValue(WALK_SESSION as never);
	inputs.length = 0;
	answer = () => null;
	setRuntimeForTests({
		store: createInboxStore(testDb),
		config: mockInboxConfig(),
		drafts: adapter,
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

/** A guest message, through the dev route, and everything after it settled. */
async function guestWrites(guestId: string, text: string): Promise<Conversation> {
	const injected = await json(
		await inject(post("http://localhost/dev/inbound", { pipe: "zalo", guestId, text })),
	);
	expect(injected.status).toBe(200);
	await settleBackgroundWork();
	const id = (injected.body.conversation as Conversation).id;
	const opened = await json(
		await getConversation(new Request(`http://localhost/api/conversations/${id}`), params(id)),
	);
	return opened.body as unknown as Conversation;
}

test("the model reads at most the last 10 messages, the auto-reply included, and the auto-reply's open question; no field names the agent or the office", async () => {
	await guestWrites("window", "Hi, looking to rent in Tay Ho");
	// The auto-reply went out and asked what's still missing (R3): budget and move-in.
	const first = inputs.at(-1);
	expect(first?.messages.map((message) => message.source)).toEqual(["guest", "auto-reply"]);
	expect(first?.openQuestions).toEqual([
		greetingQuestion("en", "budget"),
		greetingQuestion("en", "timeframe"),
	]);
	expect(Object.keys(first ?? {}).sort()).toEqual([
		"guestLanguage",
		"guestName",
		"messages",
		"officeId",
		"officeLanguage",
		"openQuestions",
		"paperwork",
		"qualification",
	]);

	// The guest answers the budget, then keeps writing: the thread outgrows the window.
	await guestWrites("window", "Budget is $2,000 a month");
	for (let n = 0; n < 10; n += 1) {
		await guestWrites("window", `Also near a park, note ${"!".repeat(n + 1)}`);
	}
	const last = inputs.at(-1);
	expect(last?.messages).toHaveLength(10);
	expect(last?.messages.at(-1)?.text).toBe(`Also near a park, note ${"!".repeat(10)}`);
	// The auto-reply has left the window; its question the guest hasn't answered still reaches
	// the model, the one they answered doesn't.
	expect(last?.messages.some((message) => message.source === "auto-reply")).toBe(false);
	expect(last?.openQuestions).toEqual([greetingQuestion("en", "timeframe")]);
});

test("a JSON reply stores both texts, the second in the office's language", async () => {
	await peekTestRuntime()?.store.setOfficeLanguage(OFFICE, "vi");
	answer = (input) =>
		JSON.stringify({
			reply: "Noted, I'll pull together a few options in Tây Hồ and send them here.",
			office_reply:
				input.officeLanguage === "vi"
					? "Dạ em ghi nhận, em sẽ chọn vài căn ở Tây Hồ và gửi anh/chị ngay trên chat này ạ."
					: "wrong language",
		});
	const conv = await guestWrites("both", "Hi, looking to rent in Tay Ho");
	expect(inputs.at(-1)?.officeLanguage).toBe("vi");
	expect(conv.oneShot?.draft).toEqual({
		reply: "Noted, I'll pull together a few options in Tây Hồ and send them here.",
		officeReply: "Dạ em ghi nhận, em sẽ chọn vài căn ở Tây Hồ và gửi anh/chị ngay trên chat này ạ.",
		answersMessageId: conv.unansweredInboundId,
		source: "model",
	});
});

test("a reply already in the office language stores no second text", async () => {
	answer = () =>
		JSON.stringify({
			reply: "Noted, I'll pull together a few options in Tây Hồ.",
			office_reply: "Noted, I'll pull together a few options in Tây Hồ.",
		});
	const conv = await guestWrites("same", "Hi, looking to rent in Tay Ho");
	expect(conv.oneShot?.draft).toMatchObject({ source: "model" });
	expect(conv.oneShot?.draft.officeReply).toBeUndefined();
});

test("malformed JSON stores the template", async () => {
	answer = () => "Noted, I'll pull together a few options in Tây Hồ.";
	const conv = await guestWrites("malformed", "Hi, looking to rent in Tay Ho");
	expect(inputs).toHaveLength(1);
	expect(conv.oneShot?.draft).toMatchObject({ source: "template" });
	expect(conv.oneShot?.draft.officeReply).toBeUndefined();
});

test("an office text the post-check blocks leaves the template too", async () => {
	await peekTestRuntime()?.store.setOfficeLanguage(OFFICE, "vi");
	answer = () =>
		JSON.stringify({
			reply: "Noted, I'll check the price with the owner.",
			office_reply: "Dạ, giá thuê là 2.000 đô một tháng ạ.",
		});
	const conv = await guestWrites("blocked", "Hi, how much is the rent? Budget $2,000");
	expect(inputs).toHaveLength(1);
	expect(conv.oneShot?.draft).toMatchObject({ source: "template" });
});

test("a template written after a model draft leaves no stale second text", async () => {
	const store = peekTestRuntime()?.store;
	if (!store) throw new Error("runtime missing");
	await store.setOfficeLanguage(OFFICE, "vi");
	answer = () =>
		JSON.stringify({ reply: "Noted, I'll check.", office_reply: "Dạ em sẽ kiểm tra ạ." });
	const conv = await guestWrites("stale", "Hi, looking to rent in Tay Ho");
	expect(conv.oneShot?.draft.officeReply).toBe("Dạ em sẽ kiểm tra ạ.");

	const template = await store.setDraft(OFFICE, conv.id, {
		reply: "Template.",
		answersMessageId: conv.unansweredInboundId,
		source: "template",
	});
	expect(template?.oneShot?.draft.officeReply).toBeUndefined();

	await store.setDraft(OFFICE, conv.id, {
		reply: "Noted, I'll check.",
		officeReply: "Dạ em sẽ kiểm tra ạ.",
		answersMessageId: conv.unansweredInboundId,
		source: "model",
	});
	answer = () => null;
	// The guest writes again: the one-shot's template replaces the model draft, second text too.
	const next = await guestWrites("stale", "Also near a park");
	expect(next.oneShot?.draft).toMatchObject({ source: "template" });
	expect(next.oneShot?.draft.officeReply).toBeUndefined();
});
