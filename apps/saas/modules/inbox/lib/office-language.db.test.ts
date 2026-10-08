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

/** The walk office's role for the signed-in operator: its manager unless a test says otherwise. */
let role = "admin";

vi.mock("@repo/database", () => ({
	getOrganizationMembershipsForUser: vi.fn(async () => [{ organizationId: "walk-office", role }]),
}));

import { auth } from "@repo/auth";

import { GET as getConversation } from "../../../app/api/conversations/[id]/route";
import { GET as getLanguage, PUT as putLanguage } from "../../../app/api/office/language/route";
import { POST as inject } from "../../../app/dev/inbound/route";
import { settleBackgroundWork } from "./background";
import { mockInboxConfig } from "./config";
import type { DraftAdapter } from "./drafts";
import { peekTestRuntime, setRuntimeForTests } from "./runtime";
import { json, params, post, WALK_SESSION } from "./test-fixtures";
import type { Conversation } from "./types";

/**
 * One office language (ADR 0025, #256): the manager sets EN or VI, and a guest message is
 * translated once, into it. An office whose manager hasn't set one is in English (decided by
 * Eyal, 2026-10-08). After a change, opening an older thread translates it into the new
 * language then; translations in the old one are kept.
 */

const OFFICE = "walk-office";

/** Every translation the model is asked for, as `<to>`. */
const calls: string[] = [];

const adapter: DraftAdapter = {
	serves: () => true,
	translate: async ({ to, text }) => {
		calls.push(to);
		return `[${to}] ${text}`;
	},
	draft: async () => null,
};

beforeEach(() => {
	role = "admin";
	vi.mocked(auth.api.getSession).mockReset();
	vi.mocked(auth.api.getSession).mockResolvedValue(WALK_SESSION as never);
	calls.length = 0;
	setRuntimeForTests({
		store: createInboxStore(testDb),
		config: mockInboxConfig(),
		drafts: adapter,
	});
});

afterEach(async () => {
	await settleBackgroundWork();
	const runtime = peekTestRuntime();
	if (runtime) await runtime.store.close();
	setRuntimeForTests(null);
});

function put(language: unknown): Request {
	return new Request("http://localhost/api/office/language", {
		method: "PUT",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ language }),
	});
}

async function setLanguage(language: "en" | "vi"): Promise<void> {
	const res = await json(await putLanguage(put(language)));
	expect(res.status).toBe(200);
}

async function arrive(guestId: string, text: string): Promise<Conversation> {
	const res = await json(
		await inject(post("http://localhost/dev/inbound", { pipe: "zalo", guestId, text })),
	);
	expect(res.status).toBe(200);
	await settleBackgroundWork();
	return res.body.conversation as Conversation;
}

/** Open the thread as a browser would, `?locale=` and all, and wait for what it started. */
async function open(id: string, locale = "en"): Promise<Conversation> {
	const res = await getConversation(
		new Request(`http://localhost/api/conversations/${encodeURIComponent(id)}?locale=${locale}`),
		params(id),
	);
	expect(res.status).toBe(200);
	await settleBackgroundWork();
	const again = await getConversation(
		new Request(`http://localhost/api/conversations/${encodeURIComponent(id)}`),
		params(id),
	);
	return (await again.json()) as Conversation;
}

const KOREAN = "안녕하세요. 서호에서 방 두 개짜리 아파트를 찾고 있어요.";
const VIETNAMESE = "Chào anh, em đang tìm căn hộ hai phòng ngủ ở Tây Hồ.";

test("an office no manager has set reads as English, and its Korean message is translated once, into English (ADR 0025)", async () => {
	const read = await json(await getLanguage(new Request("http://localhost/api/office/language")));
	expect(read.body).toEqual({ language: "en" });

	const conv = await arrive("ko-default", KOREAN);
	expect(calls).toEqual(["en"]);
	expect((await open(conv.id, "vi")).messages[0].translations).toEqual({ en: `[en] ${KOREAN}` });
});

test("at ingest, a Korean message in a Vietnamese office makes one call, into Vietnamese; a Vietnamese one makes none (ADR 0025)", async () => {
	await setLanguage("vi");

	const korean = await arrive("ko-vi-office", KOREAN);
	expect(calls).toEqual(["vi"]);
	expect((await open(korean.id)).messages[0].translations).toEqual({ vi: `[vi] ${KOREAN}` });

	calls.length = 0;
	const vietnamese = await arrive("vi-vi-office", VIETNAMESE);
	expect(calls).toEqual([]);
	expect((await open(vietnamese.id)).messages[0].translations).toEqual({});
	expect(calls).toEqual([]);
});

test("opening a thread fills the office language only, whatever ?locale= asks (ADR 0025)", async () => {
	// A message from before translation existed: no model at ingest.
	setRuntimeForTests({
		store: createInboxStore(testDb),
		config: mockInboxConfig(),
		drafts: { ...adapter, serves: () => false },
	});
	const conv = await arrive("ko-before-translation", KOREAN);
	setRuntimeForTests({
		store: createInboxStore(testDb),
		config: mockInboxConfig(),
		drafts: adapter,
	});

	const opened = await open(conv.id, "vi");
	expect(calls).toEqual(["en"]);
	expect(opened.messages[0].translations).toEqual({ en: `[en] ${KOREAN}` });
	await open(conv.id, "vi");
	expect(calls).toEqual(["en"]);
});

test("after the office switches to Vietnamese, an English translation is kept and opening the thread adds the Vietnamese one (Eyal, 2026-10-08)", async () => {
	const conv = await arrive("ko-switch", KOREAN);
	expect(calls).toEqual(["en"]);

	await setLanguage("vi");
	const opened = await open(conv.id, "en");
	expect(calls).toEqual(["en", "vi"]);
	expect(opened.messages[0].translations).toEqual({
		en: `[en] ${KOREAN}`,
		vi: `[vi] ${KOREAN}`,
	});
});

test("only a manager sets the office language: an agent gets 403 and a signed-out caller 401, and it stays as it was; every member reads it (ADR 0025)", async () => {
	await setLanguage("vi");

	role = "member";
	const agent = await json(await putLanguage(put("en")));
	expect(agent.status).toBe(403);
	const agentRead = await json(
		await getLanguage(new Request("http://localhost/api/office/language")),
	);
	expect(agentRead.body).toEqual({ language: "vi" });

	vi.mocked(auth.api.getSession).mockResolvedValue(null as never);
	expect((await putLanguage(put("en"))).status).toBe(401);
	expect((await getLanguage(new Request("http://localhost/api/office/language"))).status).toBe(401);

	role = "admin";
	vi.mocked(auth.api.getSession).mockResolvedValue(WALK_SESSION as never);
	expect(await peekTestRuntime()?.store.officeLanguage(OFFICE)).toBe("vi");
	expect((await json(await putLanguage(put("fr")))).status).toBe(400);
});
