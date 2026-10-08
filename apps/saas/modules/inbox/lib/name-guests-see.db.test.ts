import { createInboxStore } from "@repo/database/inbox";
import { afterEach, beforeEach, describe, expect, test } from "vitest";

import { testDb, useTestDatabaseForAppClient } from "./test-store";

useTestDatabaseForAppClient();

import { settleBackgroundWork } from "./background";
import { mockInboxConfig } from "./config";
import { noDraftAdapter } from "./drafts";
import { ingestEvents, refreshTemplate, setNameGuestsSee } from "./inbox";
import { type Runtime, setRuntimeForTests } from "./runtime";
import { guestMessage, membership, TEST_SECRETS_KEY, threadOf } from "./test-fixtures";
import type { Conversation } from "./types";

/**
 * Name guests see (#266, CONTEXT.md): the template suggested reply introduces the thread's owner
 * by the name they set on their account page, never by a word of their account name; with none
 * set it names the office alone (pending Eyal's nod). Setting it writes the untouched template
 * again on the operator's own open threads, as assigning does (ADR 0024): a model draft and
 * another operator's threads are left as they are.
 */

const OFFICE = "office-a";
const OA = "oa-1";
const LAN = { userId: "agent-1", officeId: OFFICE };
const OFFICE_INTRO = new RegExp(`^Hi, this is ${OFFICE}\\.`);
const introducing = (name: string) => new RegExp(`^Hi, I'm ${name} from ${OFFICE}\\.`);

let runtime: Runtime;
let seq = 0;

beforeEach(async () => {
	runtime = {
		store: createInboxStore(testDb),
		config: mockInboxConfig({ pipeSecretsKey: TEST_SECRETS_KEY }),
		drafts: noDraftAdapter,
	};
	setRuntimeForTests(runtime);
	await runtime.store.claimPipe({ pipe: "zalo", externalId: OA, officeId: OFFICE });
	await membership(OFFICE, "agent-1", "member");
	await membership(OFFICE, "agent-2", "member");
	// Family name first, as Vietnamese names are: its first word is not what guests call her.
	await testDb.user.update({ where: { id: "agent-1" }, data: { name: "Trần Thị Lan" } });
});

afterEach(async () => {
	await settleBackgroundWork();
	setRuntimeForTests(null);
});

/** A guest's first message, auto-reply off so the template is the first one; assigned to `owner`. */
async function threadOwnedBy(guestId: string, owner: string): Promise<Conversation> {
	seq += 1;
	await ingestEvents(runtime, [
		guestMessage(guestId, {
			text: "Hi, we're looking to rent an apartment in Tay Ho",
			vendorMessageId: `zalo-msg-${seq}`,
			at: Date.now() + seq,
			pipeExternalId: OA,
		}),
	]);
	await settleBackgroundWork();
	const { id } = await threadOf(OFFICE, guestId);
	expect(await runtime.store.reassign(id, owner, OFFICE)).not.toBeNull();
	const moved = await runtime.store.getOfficeConversation(OFFICE, id);
	return (await refreshTemplate(runtime.store, moved as Conversation)) as Conversation;
}

async function draftOf(conversation: Conversation) {
	return (await runtime.store.getOfficeConversation(OFFICE, conversation.id))?.oneShot?.draft;
}

describe("the template introduces the owner by their name guests see (#266)", () => {
	beforeEach(async () => {
		await runtime.store.setOfficeAutoReply(OFFICE, false);
	});

	test("with none set, the office alone and no word of the account name; set, it is written again by it; cleared, the office again", async () => {
		const owned = await threadOwnedBy("g1", "agent-1");
		const unnamed = owned.oneShot?.draft.reply ?? "";
		expect(unnamed).toMatch(OFFICE_INTRO);
		for (const word of ["Trần", "Thị", "Lan"]) expect(unnamed).not.toContain(word);

		expect(await setNameGuestsSee(runtime.store, LAN, "  Lan ")).toBe("Lan");
		expect(await runtime.store.nameGuestsSee("agent-1")).toBe("Lan");
		expect(await draftOf(owned)).toMatchObject({
			source: "template",
			answersMessageId: owned.unansweredInboundId,
			reply: expect.stringMatching(introducing("Lan")),
		});

		expect(await setNameGuestsSee(runtime.store, LAN, " ")).toBeNull();
		expect(await runtime.store.nameGuestsSee("agent-1")).toBeNull();
		expect((await draftOf(owned))?.reply).toBe(unnamed);
	});

	test("a model draft, and another operator's thread, are left as they are", async () => {
		const withModel = await threadOwnedBy("g2", "agent-1");
		const modelDraft = {
			reply: "Happy to help.",
			answersMessageId: withModel.unansweredInboundId,
			source: "model" as const,
		};
		await runtime.store.setDraft(OFFICE, withModel.id, modelDraft);
		const colleagues = await threadOwnedBy("g3", "agent-2");
		const theirs = colleagues.oneShot?.draft;

		await setNameGuestsSee(runtime.store, LAN, "Lan");
		expect(await draftOf(withModel)).toEqual(modelDraft);
		expect(await draftOf(colleagues)).toEqual(theirs);
	});
});
