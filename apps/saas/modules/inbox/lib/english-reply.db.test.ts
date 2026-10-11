import { createInboxStore } from "@repo/database/inbox";
import { afterEach, beforeEach, describe, expect, test } from "vitest";

import { testDb, useTestDatabaseForAppClient } from "./test-store";

useTestDatabaseForAppClient();

import { settleBackgroundWork } from "./background";
import { mockInboxConfig } from "./config";
import type { DraftAdapter } from "./drafts";
import { ENGLISH_REPLY_LINE } from "./greeting";
import { approveAndSend, ingestEvents } from "./inbox";
import { type Runtime, setRuntimeForTests } from "./runtime";
import { guestMessage, TEST_SECRETS_KEY, threadOf } from "./test-fixtures";
import type { Conversation, GuestLanguage, InboundEvent, Message } from "./types";

/**
 * #306: until after the demo Nhịp replies in EN and VI only (`SUPPORTED_GUEST_LANGUAGES`). A
 * Korean, Japanese or Russian guest is answered in English, and the office's first message to
 * them (the auto-reply when it is on, otherwise the first template reply) carries the
 * English-reply line once; their messages are still translated for the agent. "Once" is read
 * from the stored thread: the office's messages to the guest.
 */

const OFFICE = "office-a";
const OA = "oa-1";
const MANAGER = { userId: "agent-1", officeId: OFFICE, role: "manager" as const };
const KOREAN = "안녕하세요, Tay Ho에서 아파트 임대 찾고 있어요";
const ALL_FIVE: GuestLanguage[] = ["en", "vi", "ja", "ko", "ru"];

/** Translation only: a tagged copy of the text, as the loop test's fake model. */
const translating: DraftAdapter = {
	serves: (task) => task === "translate",
	translate: async ({ text, to }) => `[${to}] ${text}`,
	draft: async () => null,
};

let runtime: Runtime;

function useGate(supportedGuestLanguages?: GuestLanguage[]) {
	runtime = {
		store: createInboxStore(testDb),
		config: mockInboxConfig({
			pipeSecretsKey: TEST_SECRETS_KEY,
			...(supportedGuestLanguages ? { supportedGuestLanguages } : {}),
		}),
		drafts: translating,
	};
	setRuntimeForTests(runtime);
}

beforeEach(async () => {
	useGate();
	await runtime.store.claimPipe({ pipe: "zalo", externalId: OA, officeId: OFFICE });
});

afterEach(async () => {
	await settleBackgroundWork();
	setRuntimeForTests(null);
});

let seq = 0;

function guest(guestId: string, text: string): InboundEvent {
	seq += 1;
	return guestMessage(guestId, {
		text,
		vendorMessageId: `zalo-english-${seq}`,
		at: Date.now() + seq,
		pipeExternalId: OA,
	});
}

async function writes(guestId: string, text: string): Promise<Conversation> {
	await ingestEvents(runtime, [guest(guestId, text)]);
	await settleBackgroundWork();
	const { id } = await threadOf(OFFICE, guestId);
	return (await runtime.store.getOfficeConversation(OFFICE, id)) as Conversation;
}

function autoReply(conversation: Conversation): Message {
	const found = conversation.messages.find((message) => message.source === "auto-reply");
	if (!found) throw new Error("no auto-reply");
	return found;
}

async function sendSuggested(conversation: Conversation): Promise<Conversation> {
	const result = await approveAndSend(
		conversation.id,
		{
			inboundId: conversation.unansweredInboundId ?? undefined,
			text: conversation.oneShot!.draft.reply,
		},
		MANAGER,
	);
	expect(result.ok).toBe(true);
	return (await runtime.store.getOfficeConversation(OFFICE, conversation.id)) as Conversation;
}

const lineCount = (conversation: Conversation) =>
	conversation.messages.filter((message) => message.text.includes(ENGLISH_REPLY_LINE.en)).length;

describe("a Korean guest under the default gate", () => {
	test("the auto-reply is English with the line before its label, and the message is still translated", async () => {
		const conversation = await writes("ko-greeted", KOREAN);
		expect(conversation.oneShot).toMatchObject({ language: "en", guestLanguage: "ko" });
		const greeting = autoReply(conversation).text;
		expect(greeting).toMatch(/^Thanks for writing to us\./u);
		// The line is its own paragraph, and the label (R7) stays last.
		const paragraphs = greeting.split("\n\n");
		expect(paragraphs.at(-2)).toBe(ENGLISH_REPLY_LINE.en);
		expect(paragraphs.at(-1)).toMatch(/^Auto-reply from /u);
		// The template after the greeting doesn't repeat it.
		expect(conversation.oneShot!.draft.reply).not.toContain(ENGLISH_REPLY_LINE.en);
		expect(conversation.messages[0].translations).toEqual({ en: `[en] ${KOREAN}` });
	});

	test("with the auto-reply off, the first template reply carries the line, and the next one doesn't", async () => {
		await runtime.store.setOfficeAutoReply(OFFICE, false);
		const first = await writes("ko-template", KOREAN);
		expect(first.messages.some((message) => message.source === "auto-reply")).toBe(false);
		expect(first.oneShot!.draft.reply.endsWith(`\n\n${ENGLISH_REPLY_LINE.en}`)).toBe(true);

		const sent = await sendSuggested(first);
		expect(lineCount(sent)).toBe(1);

		const second = await writes("ko-template", "이번 주 토요일에 볼 수 있을까요?");
		expect(second.oneShot!.draft.reply).not.toContain(ENGLISH_REPLY_LINE.en);
		await sendSuggested(second);
		const after = (await runtime.store.getOfficeConversation(OFFICE, second.id)) as Conversation;
		expect(lineCount(after)).toBe(1);
		expect(after.messages.filter((message) => message.direction === "in")).toHaveLength(2);
		for (const message of after.messages.filter((each) => each.direction === "in")) {
			expect(message.translations.en).toBe(`[en] ${message.text}`);
		}
	});

	test("in a Vietnamese office, the operator line carries the line in Vietnamese", async () => {
		await runtime.store.setOfficeLanguage(OFFICE, "vi");
		const conversation = await writes("ko-vi", KOREAN);
		expect(autoReply(conversation).translations.vi).toContain(ENGLISH_REPLY_LINE.vi);
		expect(conversation.oneShot!.draft.officeReply).not.toContain(ENGLISH_REPLY_LINE.vi);
	});
});

test("a French guest is answered in English without the line, and isn't translated (#245)", async () => {
	const conversation = await writes("fr", "Bonjour, je cherche un appartement à louer à Tay Ho");
	expect(conversation.oneShot).toMatchObject({ language: "en", guestLanguage: "fr" });
	expect(lineCount(conversation)).toBe(0);
	expect(conversation.messages[0].translations).toEqual({});
});

test("with the gate open to Korean, the guest is greeted in Korean and never gets the line", async () => {
	useGate(ALL_FIVE);
	const conversation = await writes("ko-open", KOREAN);
	expect(conversation.oneShot).toMatchObject({ language: "ko", guestLanguage: "ko" });
	expect(autoReply(conversation).text).toMatch(/^연락 주셔서 감사합니다\./u);
	expect(lineCount(conversation)).toBe(0);
});
