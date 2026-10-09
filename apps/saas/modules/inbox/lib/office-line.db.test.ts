import { createInboxStore } from "@repo/database/inbox";
import { afterEach, beforeEach, describe, expect, test } from "vitest";

import { testDb, useTestDatabaseForAppClient } from "./test-store";

useTestDatabaseForAppClient();

import { settleBackgroundWork } from "./background";
import { mockInboxConfig } from "./config";
import { noDraftAdapter } from "./drafts";
import { greetingTemplate } from "./greeting";
import {
	approveAndSend,
	changeOfficeLanguage,
	ingestEvents,
	refreshOfficeTemplates,
} from "./inbox";
import { replyTemplate } from "./reply-template";
import { type Runtime, setRuntimeForTests } from "./runtime";
import { guestMessage, TEST_SECRETS_KEY, threadOf } from "./test-fixtures";
import type { Conversation, GuestLanguage, InboundEvent, Message } from "./types";

/**
 * The operator line as stored (#242, ADR 0007 as amended): the auto-reply and the template
 * suggested reply carry the same template in the office language, with no model call; a reply
 * sent as suggested keeps its line on the sent message; an edited one keeps none.
 */

const OFFICE = "office-a";
const OA = "oa-1";
const MANAGER = { userId: "agent-1", officeId: OFFICE, role: "manager" as const };
const KOREAN = "안녕하세요, Tay Ho에서 아파트 임대 찾고 있어요";

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

function guest(guestId: string, text: string): InboundEvent {
	seq += 1;
	return guestMessage(guestId, {
		text,
		vendorMessageId: `zalo-line-${seq}`,
		at: Date.now() + seq,
		pipeExternalId: OA,
	});
}

async function arrive(guestId: string, text: string): Promise<Conversation> {
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

/** The template suggested reply for the thread as it stands, in `language`. */
function template(conversation: Conversation, language: GuestLanguage): string {
	const shot = conversation.oneShot!;
	return replyTemplate(language, shot.qualification, {
		...conversation,
		agentName: null,
		officeName: OFFICE,
	});
}

describe("a Korean guest in an English office", () => {
	test("the auto-reply carries the English template as its line", async () => {
		const conversation = await arrive("ko-1", KOREAN);
		const { qualification } = conversation.oneShot!;
		const greeting = autoReply(conversation);
		expect(greeting.text).toBe(greetingTemplate("ko", qualification, OFFICE));
		expect(greeting.translations).toEqual({ en: greetingTemplate("en", qualification, OFFICE) });
	});

	test("the suggested reply carries the English template", async () => {
		const conversation = await arrive("ko-2", KOREAN);
		const { draft } = conversation.oneShot!;
		expect(draft.reply).toBe(template(conversation, "ko"));
		expect(draft.officeReply).toBe(template(conversation, "en"));
	});

	test("sent as suggested, the reply keeps its line; written by the template", async () => {
		const conversation = await arrive("ko-3", KOREAN);
		const { draft } = conversation.oneShot!;
		const result = await approveAndSend(
			conversation.id,
			{ inboundId: conversation.unansweredInboundId ?? undefined, text: draft.reply },
			MANAGER,
		);
		expect(result.ok).toBe(true);
		const sent = (await runtime.store.getOfficeConversation(
			OFFICE,
			conversation.id,
		))!.messages.find((message) => message.source === "nhip");
		expect(sent).toMatchObject({ writtenBy: "template", translations: { en: draft.officeReply } });
	});

	test("an edited reply keeps no line", async () => {
		const conversation = await arrive("ko-4", KOREAN);
		const result = await approveAndSend(
			conversation.id,
			{
				inboundId: conversation.unansweredInboundId ?? undefined,
				text: `${conversation.oneShot!.draft.reply} 감사합니다.`,
				edited: true,
			},
			MANAGER,
		);
		expect(result.ok).toBe(true);
		const sent = (await runtime.store.getOfficeConversation(
			OFFICE,
			conversation.id,
		))!.messages.find((message) => message.source === "nhip");
		expect(sent).toMatchObject({ writtenBy: null, translations: {} });
	});

	test("a model draft sent as it was keeps the model's English text, as a translation", async () => {
		const conversation = await arrive("ko-5", KOREAN);
		const reply = "확인해 보고 이 채팅으로 다시 연락드리겠습니다.";
		await runtime.store.setDraft(OFFICE, conversation.id, {
			reply,
			answersMessageId: conversation.unansweredInboundId,
			source: "model",
			officeReply: "I'll check and get back to you here.",
		});
		await approveAndSend(
			conversation.id,
			{ inboundId: conversation.unansweredInboundId ?? undefined, text: reply },
			MANAGER,
		);
		const sent = (await runtime.store.getOfficeConversation(
			OFFICE,
			conversation.id,
		))!.messages.find((message) => message.source === "nhip");
		expect(sent).toMatchObject({
			writtenBy: "model",
			translations: { en: "I'll check and get back to you here." },
		});
	});
});

describe("no line in the office language", () => {
	test("an English guest in an English office", async () => {
		const conversation = await arrive("en-1", "Hi, we're looking to rent an apartment in Tay Ho");
		expect(autoReply(conversation).translations).toEqual({});
		expect(conversation.oneShot!.draft.officeReply).toBeUndefined();
	});

	test("a French guest, answered in English, in an English office (#245)", async () => {
		const conversation = await arrive("fr-1", "Bonjour, je cherche un appartement à louer");
		expect(autoReply(conversation).translations).toEqual({});
		expect(conversation.oneShot!.draft.officeReply).toBeUndefined();
	});
});

describe("a Vietnamese office", () => {
	test("the lines are the Vietnamese templates", async () => {
		await runtime.store.setOfficeLanguage(OFFICE, "vi");
		const conversation = await arrive("ko-vi", KOREAN);
		const { qualification, draft } = conversation.oneShot!;
		expect(autoReply(conversation).translations).toEqual({
			vi: greetingTemplate("vi", qualification, OFFICE),
		});
		expect(draft.officeReply).toBe(template(conversation, "vi"));
	});

	test("after the manager changes the language, the open suggestion's line follows", async () => {
		const conversation = await arrive("ko-change", KOREAN);
		await runtime.store.setOfficeLanguage(OFFICE, "vi");
		await refreshOfficeTemplates(runtime.store, MANAGER);
		const after = (await runtime.store.getOfficeConversation(OFFICE, conversation.id))!;
		expect(after.oneShot!.draft.officeReply).toBe(template(after, "vi"));
		// The auto-reply keeps the line it was sent with.
		expect(Object.keys(autoReply(after).translations)).toEqual(["en"]);
	});
});

/**
 * A model draft's operator-language text is written in the office language of its moment (#288,
 * ADR 0025): after the manager changes the language it is dropped, so no line shows under the
 * waiting draft and a send stores none, never a line labelled with one language holding another's.
 */
describe("a model draft waiting across an office-language change", () => {
	const reply = "확인해 보고 이 채팅으로 다시 연락드리겠습니다.";
	const line = "I'll check and get back to you here.";

	async function waitingModelDraft(guestId: string) {
		const conversation = await arrive(guestId, KOREAN);
		await runtime.store.setDraft(OFFICE, conversation.id, {
			reply,
			answersMessageId: conversation.unansweredInboundId,
			source: "model",
			officeReply: line,
		});
		return conversation;
	}

	async function sentUnedited(conversation: Conversation) {
		await approveAndSend(
			conversation.id,
			{ inboundId: conversation.unansweredInboundId ?? undefined, text: reply },
			MANAGER,
		);
		return (await runtime.store.getOfficeConversation(OFFICE, conversation.id))!.messages.find(
			(message) => message.source === "nhip",
		);
	}

	test("English text, office switched to Vietnamese, sent unedited: no operator line", async () => {
		const conversation = await waitingModelDraft("ko-288-a");
		await changeOfficeLanguage(runtime.store, OFFICE, "vi");
		const waiting = (await runtime.store.getOfficeConversation(OFFICE, conversation.id))!;
		expect(waiting.oneShot!.draft.officeReply).toBeUndefined();
		const sent = await sentUnedited(conversation);
		expect(sent).toMatchObject({ writtenBy: "model", translations: {} });
	});

	test("a language set to what it already is keeps the line", async () => {
		const conversation = await waitingModelDraft("ko-288-b");
		await changeOfficeLanguage(runtime.store, OFFICE, "en");
		const sent = await sentUnedited(conversation);
		expect(sent).toMatchObject({ writtenBy: "model", translations: { en: line } });
	});

	test("a draft written after the change keeps its line, in the new language", async () => {
		await changeOfficeLanguage(runtime.store, OFFICE, "vi");
		const conversation = await arrive("ko-288-c", KOREAN);
		const viLine = "Tôi sẽ kiểm tra và phản hồi lại ở đây.";
		await runtime.store.setDraft(OFFICE, conversation.id, {
			reply,
			answersMessageId: conversation.unansweredInboundId,
			source: "model",
			officeReply: viLine,
		});
		const sent = await sentUnedited(conversation);
		expect(sent).toMatchObject({ writtenBy: "model", translations: { vi: viLine } });
	});
});
