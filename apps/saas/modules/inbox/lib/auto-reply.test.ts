import { createInboxStore } from "@repo/database/inbox";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { resetTestInbox, testDb, useTestDatabaseForAppClient } from "./test-store";

useTestDatabaseForAppClient();

import { settleBackgroundWork } from "./background";
import { mockInboxConfig } from "./config";
import { noDraftAdapter } from "./drafts";
import { greetingLabel } from "./greeting";
import { ingestEvents, injectDevInbound } from "./inbox";
import { encryptSecret, tokenContext } from "./pipes/secrets";
import { type Runtime, setRuntimeForTests } from "./runtime";
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
const SECRETS_KEY = Buffer.alloc(32, 7).toString("base64");

let runtime: Runtime;

beforeEach(async () => {
	await resetTestInbox();
	runtime = {
		store: createInboxStore(testDb),
		config: mockInboxConfig({ pipeSecretsKey: SECRETS_KEY }),
		drafts: noDraftAdapter,
	};
	setRuntimeForTests(runtime);
	await runtime.store.claimPipe({ pipe: "zalo", externalId: OA, officeId: OFFICE });
});

afterEach(async () => {
	await settleBackgroundWork();
	setRuntimeForTests(null);
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
});

let seq = 0;

function guest(guestId: string, text: string, extra: Partial<InboundEvent> = {}): InboundEvent {
	seq += 1;
	return {
		pipe: "zalo",
		source: "guest",
		guestId,
		guestName: null,
		text,
		vendorMessageId: `zalo-msg-${seq}`,
		at: Date.now() + seq,
		pipeExternalId: OA,
		...extra,
	};
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
	const id = (await testDb.conversation.findFirstOrThrow({ where: { officeId: OFFICE, guestId } }))
		.id;
	return (await runtime.store.getOfficeConversation(OFFICE, id)) as Conversation;
}

function autoReplies(conversation: Conversation): Message[] {
	return conversation.messages.filter((message) => message.source === "auto-reply");
}

async function connectZaloOa({ disconnected = false } = {}): Promise<void> {
	await runtime.store.savePipeCredential("zalo", OA, {
		accessToken: encryptSecret("access-1", SECRETS_KEY, tokenContext("zalo", OA, "access")),
		refreshToken: encryptSecret("refresh-1", SECRETS_KEY, tokenContext("zalo", OA, "refresh")),
		accessTokenExpiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
	});
	if (disconnected) await runtime.store.markPipeDisconnected("zalo", OA, "refresh refused");
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

	test("a disconnected OA greets no one, and the guest is still Your turn", async () => {
		await connectZaloOa({ disconnected: true });
		await arrive(guest("g6", "Hello"));
		const conversation = await thread("g6");
		expect(autoReplies(conversation)).toHaveLength(0);
		expect(conversation.unansweredInboundId).toBe(conversation.messages[0].id);
	});

	test("the seed's guests are not greeted; a dev-injected guest is", async () => {
		const seeded = {
			pipe: "zalo" as const,
			guestId: "seeded",
			text: "Hello",
			officeId: OFFICE,
			autoReply: false,
		};
		await injectDevInbound(seeded);
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
			pipeSecretsKey: SECRETS_KEY,
		});
		await connectZaloOa();
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
