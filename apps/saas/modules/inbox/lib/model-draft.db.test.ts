import { createInboxStore } from "@repo/database/inbox";
import { afterEach, beforeEach, describe, expect, test } from "vitest";

import { testDb, useTestDatabaseForAppClient } from "./test-store";

useTestDatabaseForAppClient();

import { settleBackgroundWork } from "./background";
import { mockInboxConfig } from "./config";
import type { DraftAdapter, DraftInput } from "./drafts";
import { approveAndSend, ingestEvents, regenerateDraft } from "./inbox";
import { draftOnOpen } from "./model-draft";
import { type Runtime, setRuntimeForTests } from "./runtime";
import { guestMessage, TEST_SECRETS_KEY, threadOf } from "./test-fixtures";
import type { Conversation, InboundEvent } from "./types";

/**
 * When the model drafts the suggested reply (ADR 0024, #252), through the webhook path against a
 * fake model: only after the office's first human reply (a sent Answer, or a reply from the
 * office's own app; the auto-reply is not one). And the one exception to ADR 0011's stale
 * target: an edit the agent kept after the guest wrote again is sent as the answer to the
 * guest's latest message; every other send naming an older message is still refused.
 */

const OFFICE = "office-a";
const OA = "oa-1";
const MANAGER = { userId: "agent-1", officeId: OFFICE, role: "manager" as const };

/** Every draft the model is asked for. */
const asked: DraftInput[] = [];
const MODEL_REPLY = "Happy to help with your search.";

const model: DraftAdapter = {
	serves: () => true,
	translate: async () => null,
	draft: async (input) => {
		asked.push(input);
		return JSON.stringify({ reply: MODEL_REPLY, office_reply: MODEL_REPLY });
	},
};

let runtime: Runtime;

beforeEach(async () => {
	asked.length = 0;
	runtime = {
		store: createInboxStore(testDb),
		config: mockInboxConfig({ pipeSecretsKey: TEST_SECRETS_KEY }),
		drafts: model,
		// The wait is proven with fake timers (`model-draft.test.ts`); here it doesn't hold a test up.
		draftDebounceMs: 0,
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
		vendorMessageId: `zalo-draft-${seq}`,
		at: Date.now() + seq,
		pipeExternalId: OA,
		...extra,
	});
}

async function arrive(...events: InboundEvent[]): Promise<void> {
	await ingestEvents(runtime, events);
	await settleBackgroundWork();
}

async function thread(guestId: string): Promise<Conversation> {
	const { id } = await threadOf(OFFICE, guestId);
	return (await runtime.store.getOfficeConversation(OFFICE, id)) as Conversation;
}

/** The agent opens the thread: the thread route reads it and drafts at once where it may. */
async function open(guestId: string): Promise<Conversation> {
	draftOnOpen(runtime, await thread(guestId));
	await settleBackgroundWork();
	return thread(guestId);
}

/** The office's human reply to the guest's waiting message, approved as the agent would. */
async function reply(guestId: string, text = "Hello! Happy to help."): Promise<void> {
	const conversation = await thread(guestId);
	const sent = await approveAndSend(
		conversation.id,
		{ inboundId: conversation.unansweredInboundId ?? undefined, text },
		MANAGER,
	);
	expect(sent.ok).toBe(true);
}

describe("the model drafts only after the office's first human reply", () => {
	test("before it, the model is never asked: not after the auto-reply, not when the guest writes again, not on opening the thread; Regenerate writes the template", async () => {
		await arrive(guest("before", "Hi, we're looking to rent an apartment in Tay Ho"));
		let conversation = await open("before");
		expect(conversation.messages.map((message) => message.source)).toEqual(["guest", "auto-reply"]);
		expect(conversation.oneShot?.draft.source).toBe("template");

		await arrive(guest("before", "Two bedrooms, please"));
		conversation = await open("before");
		expect(conversation.oneShot?.draft).toMatchObject({
			answersMessageId: conversation.unansweredInboundId,
			source: "template",
		});

		const regenerated = await regenerateDraft(conversation.id, MANAGER);
		expect(regenerated.ok && regenerated.conversation.oneShot?.draft).toMatchObject({
			reply: conversation.oneShot?.draft.reply,
			answersMessageId: conversation.unansweredInboundId,
			source: "template",
		});
		expect(asked).toHaveLength(0);
	});

	test("after a sent Answer, the guest's next message is drafted by the model", async () => {
		await arrive(guest("answered", "Hi, we're looking to rent an apartment in Tay Ho"));
		await reply("answered");
		expect(asked).toHaveLength(0);

		await arrive(guest("answered", "Could you send some photos?"));
		const conversation = await thread("answered");
		expect(asked).toHaveLength(1);
		expect(asked[0].messages.at(-1)?.text).toBe("Could you send some photos?");
		expect(conversation.oneShot?.draft).toMatchObject({
			reply: MODEL_REPLY,
			answersMessageId: conversation.unansweredInboundId,
			source: "model",
		});
	});

	test("after a reply from the office's own app, the guest's next message is drafted by the model", async () => {
		await arrive(guest("oa-app", "Hi, we're looking to rent an apartment in Tay Ho"));
		await arrive(guest("oa-app", "Hello from the OA app", { source: "oa-echo" }));
		expect(asked).toHaveLength(0);

		await arrive(guest("oa-app", "Could you send some photos?"));
		const conversation = await thread("oa-app");
		expect(asked).toHaveLength(1);
		expect(conversation.oneShot?.draft.source).toBe("model");
	});

	test("Regenerate after the first human reply asks the model again", async () => {
		await arrive(guest("regen", "Hi, we're looking to rent an apartment in Tay Ho"));
		await reply("regen");
		await arrive(guest("regen", "Could you send some photos?"));
		expect(asked).toHaveLength(1);

		const conversation = await thread("regen");
		const regenerated = await regenerateDraft(conversation.id, MANAGER);
		expect(regenerated.ok && regenerated.conversation.oneShot?.draft.source).toBe("model");
		expect(asked).toHaveLength(2);
	});
});

describe("a kept edit answers the latest guest message (ADR 0024 amending ADR 0011)", () => {
	/** A guest who wrote twice with no reply between: the first message is now out of date. */
	async function wroteTwice(
		guestId: string,
	): Promise<{ older: string; latest: string; id: string }> {
		await arrive(guest(guestId, "Hi, we're looking to rent an apartment in Tay Ho"));
		const first = await thread(guestId);
		const older = first.unansweredInboundId;
		await arrive(guest(guestId, "Actually, two bedrooms"));
		const second = await thread(guestId);
		const latest = second.unansweredInboundId;
		if (!older || !latest || older === latest) throw new Error("the guest didn't write twice");
		return { older, latest, id: second.id };
	}

	test("approving a kept edit that names an older guest message records an Answer for the latest one", async () => {
		const { older, latest, id } = await wroteTwice("kept");
		const sent = await approveAndSend(
			id,
			{ inboundId: older, text: "My own words for you.", edited: true, seenInboundId: latest },
			MANAGER,
		);
		expect(sent.ok).toBe(true);
		if (!sent.ok) return;
		expect(sent.conversation.unansweredInboundId).toBeNull();
		expect(sent.conversation.answers).toHaveLength(1);
		expect(sent.conversation.lastAnswer).toMatchObject({
			inboundId: latest,
			text: "My own words for you.",
			status: "sent",
		});
		expect(sent.conversation.messages.at(-1)).toMatchObject({
			direction: "out",
			source: "nhip",
			text: "My own words for you.",
		});
	});

	test("an untouched suggestion that names an older guest message gets 409 stale_target, and nothing is sent", async () => {
		const { older, latest, id } = await wroteTwice("untouched");
		const refused = await approveAndSend(
			id,
			{ inboundId: older, text: "The old suggestion.", seenInboundId: latest },
			MANAGER,
		);
		expect(refused).toMatchObject({ ok: false, status: 409, error: "stale_target" });
		const conversation = await thread("untouched");
		expect(conversation.answers).toHaveLength(0);
		expect(conversation.messages.filter((message) => message.source === "nhip")).toHaveLength(0);
	});

	test("an edit sent before the guest's new message showed on the operator's screen gets 409 stale_target", async () => {
		const { older, id } = await wroteTwice("unseen");
		const refused = await approveAndSend(
			id,
			{
				inboundId: older,
				text: "Typed for the first message.",
				edited: true,
				seenInboundId: older,
			},
			MANAGER,
		);
		expect(refused).toMatchObject({ ok: false, status: 409, error: "stale_target" });
		expect((await thread("unseen")).answers).toHaveLength(0);
	});

	test("a kept edit for a message the office has answered since is still refused with 409 stale_target", async () => {
		await arrive(guest("answered-since", "Hi, we're looking to rent an apartment in Tay Ho"));
		const first = (await thread("answered-since")).unansweredInboundId;
		await reply("answered-since");
		await arrive(guest("answered-since", "Could you send some photos?"));
		const conversation = await thread("answered-since");
		const refused = await approveAndSend(
			conversation.id,
			{
				inboundId: first ?? undefined,
				text: "Words typed before the reply.",
				edited: true,
				seenInboundId: conversation.unansweredInboundId ?? undefined,
			},
			MANAGER,
		);
		expect(refused).toMatchObject({ ok: false, status: 409, error: "stale_target" });
		expect((await thread("answered-since")).answers).toHaveLength(1);
	});

	test("a kept edit naming a message of another thread is refused with 409 stale_target", async () => {
		const other = await wroteTwice("elsewhere");
		const { id, latest } = await wroteTwice("here");
		const refused = await approveAndSend(
			id,
			{ inboundId: other.older, text: "Wrong thread.", edited: true, seenInboundId: latest },
			MANAGER,
		);
		expect(refused).toMatchObject({ ok: false, status: 409, error: "stale_target" });
	});
});
