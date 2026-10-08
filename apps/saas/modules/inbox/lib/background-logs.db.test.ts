import { createInboxStore } from "@repo/database/inbox";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

import { testDb, useTestDatabaseForAppClient } from "./test-store";

useTestDatabaseForAppClient();

import { settleBackgroundWork } from "./background";
import { mockInboxConfig } from "./config";
import type { DraftAdapter } from "./drafts";
import { ingestEvents } from "./inbox";
import { type Runtime, setRuntimeForTests } from "./runtime";
import { guestMessage, TEST_SECRETS_KEY, threadOf } from "./test-fixtures";
import { scheduleMissingTranslations } from "./translate";
import type { Conversation } from "./types";

/**
 * Server logs are telemetry under Vietnam's PDPL (#220): Vercel keeps them. A background job
 * that fails logs the kind of job and the kind of error, never the thread's id, the guest's
 * Zalo id, a message's id, nor anything the guest wrote, even when the error's own message
 * quotes them, as a model's, a vendor's or the database's can.
 */

const OFFICE = "office-a";
const OA = "oa-1";
/** A Zalo user id: what an old `office:pipe:guest` thread id ends in. */
const GUEST_ID = "3891748223501947521";
const GUEST_NAME = "Nguyễn Thị Lan";
const GUEST_TEXT = "Chào anh, em muốn thuê căn hộ 2 phòng ngủ ở Tây Hồ";

/** A model that fails, quoting what it was sent, as a provider's error can. */
const failingModel: DraftAdapter = {
	serves: () => true,
	translate: async ({ text }) => {
		throw new Error(`model refused to translate: ${text}`);
	},
	draft: async ({ guestName, messages }) => {
		throw new Error(`model refused ${guestName}: ${messages.map((m) => m.text).join(" | ")}`);
	},
};

let runtime: Runtime;

beforeEach(async () => {
	runtime = {
		store: createInboxStore(testDb),
		config: mockInboxConfig({ pipeSecretsKey: TEST_SECRETS_KEY }),
		drafts: failingModel,
	};
	setRuntimeForTests(runtime);
	await runtime.store.claimPipe({ pipe: "zalo", externalId: OA, officeId: OFFICE });
});

afterEach(async () => {
	await settleBackgroundWork();
	setRuntimeForTests(null);
});

test("a failing background job logs its kind and the error's kind, never a thread id, guest id or guest text", async () => {
	const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
	const error = vi.spyOn(console, "error").mockImplementation(() => undefined);

	// A new guest's first message, through the webhook path: the greeting goes out, then the
	// follow-up draft and the translation run in the background, and the model fails both.
	await ingestEvents(runtime, [
		guestMessage(GUEST_ID, {
			guestName: GUEST_NAME,
			text: GUEST_TEXT,
			vendorMessageId: "zalo-msg-1",
			pipeExternalId: OA,
		}),
	]);
	await settleBackgroundWork();
	const { id } = await threadOf(OFFICE, GUEST_ID);
	const conversation = (await runtime.store.getOfficeConversation(OFFICE, id)) as Conversation;

	// Opening the thread looks for missing translations; the database fails, quoting the keys.
	vi.spyOn(runtime.store, "translationFailures").mockRejectedValue(
		new Error(`no translation failures for thread ${id}, message ${conversation.messages[0].id}`),
	);
	scheduleMissingTranslations(runtime, conversation);
	await settleBackgroundWork();

	const logged = JSON.stringify([...warn.mock.calls, ...error.mock.calls]);
	// The jobs did fail, so what follows checks real failure lines.
	expect(logged).toContain("inbox background job failed: follow-up draft");
	expect(logged).toContain("inbox background job failed: translate");
	expect(logged).toContain("inbox background job failed: translations");
	for (const secret of [
		id,
		GUEST_ID,
		GUEST_NAME,
		"thuê căn hộ",
		...conversation.messages.map((message) => message.id),
	]) {
		expect(logged).not.toContain(secret);
	}
	// Still useful for debugging: each line names the error's kind.
	expect(logged).toContain('"kind":"Error"');
});
