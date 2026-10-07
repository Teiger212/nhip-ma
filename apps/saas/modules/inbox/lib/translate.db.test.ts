import { createInboxStore } from "@repo/database/inbox";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

import { resetTestInbox, testDb } from "./test-store";

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

import { GET as getConversation } from "../../../app/api/conversations/[id]/route";
import { GET as listConversations } from "../../../app/api/conversations/route";
import { POST as inject } from "../../../app/dev/inbound/route";
import { settleBackgroundWork } from "./background";
import { mockInboxConfig } from "./config";
import type { DraftAdapter } from "./drafts";
import { peekTestRuntime, setRuntimeForTests } from "./runtime";
import { TRANSLATION_MAX_ATTEMPTS, TRANSLATION_RETRY_AFTER_MS } from "./translate";
import type { Conversation } from "./types";

/**
 * Translation (ADR 0007) runs once per guest message per operator language. A failed model
 * call stores no translation, so without a record of the failure every read would call the
 * paid model again. The failure is kept in the database and the model is asked again only
 * after a backoff, a bounded number of times.
 */

const WALK_SESSION = {
	session: { id: "walk-session", activeOrganizationId: "walk-office" },
	user: { id: "walk-user" },
};

const MINUTE = 60_000;

/** What the model is asked to translate, and what it answers (null: it failed). */
const calls: string[] = [];
let answer: (to: string, text: string) => string | null = () => null;

const countingAdapter: DraftAdapter = {
	provider: "openai-compatible",
	translate: async ({ text, to }) => {
		calls.push(to);
		return answer(to, text);
	},
	followUp: async () => null,
};

beforeEach(async () => {
	vi.mocked(auth.api.getSession).mockReset();
	vi.mocked(auth.api.getSession).mockResolvedValue(WALK_SESSION as never);
	calls.length = 0;
	answer = () => null;
	await resetTestInbox();
	setRuntimeForTests({
		store: createInboxStore(testDb),
		config: mockInboxConfig(),
		drafts: countingAdapter,
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

async function arrive(text: string): Promise<Conversation> {
	const res = await inject(
		new Request("http://localhost/dev/inbound", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ pipe: "zalo", guestId: "backoff-guest", text }),
		}),
	);
	expect(res.status).toBe(200);
	return ((await res.json()) as { conversation: Conversation }).conversation;
}

/** One read of the list, as every open inbox and Home do every 10 seconds. */
async function pollList(): Promise<void> {
	const res = await listConversations(new Request("http://localhost/api/conversations?locale=vi"));
	expect(res.status).toBe(200);
	await settleBackgroundWork();
}

/** One read of the open thread in Vietnamese. */
async function openThread(id: string): Promise<Conversation> {
	const res = await getConversation(
		new Request(`http://localhost/api/conversations/${encodeURIComponent(id)}?locale=vi`),
		{ params: Promise.resolve({ id }) },
	);
	expect(res.status).toBe(200);
	const conversation = (await res.json()) as Conversation;
	await settleBackgroundWork();
	return conversation;
}

/** Move the recorded failure back in time, as if the backoff had passed. */
async function ageFailure(messageId: string, locale: string, ms: number): Promise<void> {
	const failure = await testDb.translationFailure.findUniqueOrThrow({
		where: { messageId_locale: { messageId, locale } },
	});
	await testDb.translationFailure.update({
		where: { messageId_locale: { messageId, locale } },
		data: { lastFailedAt: new Date(failure.lastFailedAt.getTime() - ms) },
	});
}

test("a failing model is not called again by polls or reads until the backoff has passed (ADR 0007)", async () => {
	// At ingest the model is asked once per operator language, and fails.
	const conv = await arrive("안녕하세요. Tay Ho에서 2 bedroom 임대 찾고 있어요.");
	await settleBackgroundWork();
	expect(calls.sort()).toEqual(["en", "vi"]);
	const messageId = conv.messages[0].id;

	// The list never asks for translations, however often it is polled.
	for (let poll = 0; poll < 3; poll += 1) await pollList();
	// Opening the thread within the backoff does not ask again either.
	await openThread(conv.id);
	await openThread(conv.id);
	expect(calls).toHaveLength(2);

	// Once the backoff has passed, opening the thread asks again, once, for its language.
	await ageFailure(messageId, "vi", TRANSLATION_RETRY_AFTER_MS);
	await openThread(conv.id);
	await openThread(conv.id);
	expect(calls).toEqual(["en", "vi", "vi"]);

	// The model answers this time: the translation lands and its failure is cleared.
	answer = (to, text) => `[${to}] ${text}`;
	await ageFailure(messageId, "vi", TRANSLATION_RETRY_AFTER_MS);
	await openThread(conv.id);
	const opened = await openThread(conv.id);
	expect(opened.messages[0].translations.vi).toBe(`[vi] ${conv.messages[0].text}`);
	expect(calls).toEqual(["en", "vi", "vi", "vi"]);
	expect(await testDb.translationFailure.count({ where: { messageId, locale: "vi" } })).toBe(0);
});

test("after the last allowed attempt fails, the model is never asked again for that message (ADR 0007)", async () => {
	const conv = await arrive("Здравствуйте. Ищу аренду в Ciputra.");
	await settleBackgroundWork();
	const messageId = conv.messages[0].id;
	for (let attempt = 1; attempt < TRANSLATION_MAX_ATTEMPTS; attempt += 1) {
		await ageFailure(messageId, "vi", TRANSLATION_RETRY_AFTER_MS);
		await openThread(conv.id);
	}
	expect(calls.filter((to) => to === "vi")).toHaveLength(TRANSLATION_MAX_ATTEMPTS);

	await ageFailure(messageId, "vi", 24 * 60 * MINUTE);
	await openThread(conv.id);
	expect(calls.filter((to) => to === "vi")).toHaveLength(TRANSLATION_MAX_ATTEMPTS);
	const opened = await openThread(conv.id);
	expect(opened.messages[0].translations.vi).toBeUndefined();
});
