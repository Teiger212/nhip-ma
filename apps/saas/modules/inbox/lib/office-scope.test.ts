import { expect, test } from "vitest";

import { oneShot } from "./draft";
import { testDb, testInboxStore } from "./test-store";
import type { Store } from "./types";

/**
 * The office is the tenant (ADR 0010, #95): every store method acts for one office, and
 * an id of another office's row (thread ids are opaque, but never trusted as a key) reaches
 * nothing there. The database holds the same line: a row's office is its thread's.
 */
const OURS = "office-a";
const THEIRS = "office-b";

const guestWrites = async (store: Store, officeId: string, guestId: string) => {
	const { conversation } = await store.upsertInbound(
		{
			pipe: "zalo",
			source: "guest",
			guestId,
			guestName: null,
			text: "Looking to rent in Tay Ho",
			vendorMessageId: null,
			pipeExternalId: null,
		},
		officeId,
	);
	return conversation;
};

/** Another office's thread with a sending Answer, a translation failure and a CRM claim. */
async function theirThread(store: Store) {
	const thread = await guestWrites(store, THEIRS, "their-guest");
	const inboundId = thread.unansweredInboundId!;
	await store.setOneShot(THEIRS, thread.id, oneShot("Looking to rent in Tay Ho", inboundId));
	await store.recordTranslationFailure(THEIRS, inboundId, "en", new Date());
	const begun = await store.beginAnswer({
		officeId: THEIRS,
		conversationId: thread.id,
		inboundId,
		text: "Their reply",
		operatorId: "agent-2",
	});
	if (!begun.ok) throw new Error(begun.reason);
	await store.setCrmConnection(THEIRS, "mock");
	await store.claimCrmLink(THEIRS, thread.id);
	return { thread, inboundId, answerId: begun.answer.id };
}

/** Run a write across offices; whether it refuses or does nothing, it must not land. */
const attempt = (write: Promise<unknown>) => write.then(() => undefined).catch(() => undefined);

test("one office's id reads nothing of another office's thread", async () => {
	const store = await testInboxStore();
	const { thread, inboundId } = await theirThread(store);

	expect(await store.getOfficeConversation(OURS, thread.id)).toBeNull();
	expect(await store.guestInboundText(OURS, thread.id)).toBe("");
	expect(await store.translationFailures(OURS, [inboundId], "en")).toEqual([]);
	// Their own office still reads it.
	expect((await store.getOfficeConversation(THEIRS, thread.id))?.id).toBe(thread.id);
	expect(await store.translationFailures(THEIRS, [inboundId], "en")).toHaveLength(1);
	await store.close();
});

test("one office's id writes nothing into another office's thread", async () => {
	const store = await testInboxStore();
	const { thread, inboundId } = await theirThread(store);
	const before = await testDb.draft.findUniqueOrThrow({ where: { conversationId: thread.id } });

	expect(
		await store.setDraft(OURS, thread.id, {
			reply: "planted",
			answersMessageId: inboundId,
			source: "model",
		}),
	).toBeNull();
	expect(await store.setOneShot(OURS, thread.id, oneShot("planted", inboundId))).toBeNull();
	await attempt(store.setTranslation(OURS, inboundId, "en", "planted"));
	await attempt(store.recordTranslationFailure(OURS, inboundId, "vi", new Date()));

	expect(await testDb.draft.findUniqueOrThrow({ where: { conversationId: thread.id } })).toEqual(
		before,
	);
	expect(await testDb.translation.count({ where: { messageId: inboundId } })).toBe(0);
	expect(await testDb.translationFailure.count({ where: { messageId: inboundId } })).toBe(1);
	await store.close();
});

test("one office cannot answer, complete, fail or mark another office's Answer", async () => {
	const store = await testInboxStore();
	const { thread, answerId } = await theirThread(store);
	const unanswered = await guestWrites(store, THEIRS, "their-other-guest");

	await attempt(
		store.completeAnswer(OURS, answerId, {
			mock: true,
			pipe: "zalo",
			vendorMessageId: "planted",
		}),
	);
	await attempt(store.failAnswer(OURS, answerId, "planted"));
	await attempt(store.markAnswerUnknown(OURS, answerId, "planted"));
	// Our office naming their unanswered thread and message as if they were ours.
	await attempt(
		store.beginAnswer({
			officeId: OURS,
			conversationId: unanswered.id,
			inboundId: unanswered.unansweredInboundId!,
			text: "planted",
			operatorId: "agent-1",
		}),
	);

	const answer = await testDb.answer.findUniqueOrThrow({ where: { id: answerId } });
	expect(answer).toMatchObject({ status: "sending", text: "Their reply", failureReason: null });
	expect(await testDb.message.count({ where: { conversationId: thread.id } })).toBe(1);
	expect((await store.getOfficeConversation(THEIRS, thread.id))?.owner?.id).toBe("agent-2");
	expect(await testDb.answer.count({ where: { conversationId: unanswered.id } })).toBe(0);
	expect((await store.getOfficeConversation(THEIRS, unanswered.id))?.owner).toBeNull();
	await store.close();
});

test("one office cannot release, complete or overwrite another office's CRM link", async () => {
	const store = await testInboxStore();
	const { thread } = await theirThread(store);

	await attempt(store.releaseCrmLink(OURS, thread.id));
	expect(await testDb.crmLink.count({ where: { conversationId: thread.id } })).toBe(1);

	await attempt(
		store.completeCrmLink(OURS, thread.id, { leadId: "planted", leadName: "X", method: "created" }),
	);
	expect(
		(await testDb.crmLink.findUniqueOrThrow({ where: { conversationId: thread.id } })).leadId,
	).toBeNull();

	await store.completeCrmLink(THEIRS, thread.id, {
		leadId: "lead-1",
		leadName: "Lan",
		method: "created",
	});
	await attempt(
		store.saveCrmOutcome(OURS, thread.id, "lead-1", {
			outcome: "won",
			outcomeAt: null,
			outcomeReason: null,
			outcomeObservedAt: null,
		}),
	);
	expect(
		(await testDb.crmLink.findUniqueOrThrow({ where: { conversationId: thread.id } })).outcome,
	).toBeNull();
	await store.close();
});

/** Postgres refused the row: a foreign key it would break. */
const FOREIGN_KEY = { code: "P2003" };

test("the database refuses a row whose office is not its thread's", async () => {
	const store = await testInboxStore();
	const { thread, inboundId } = await theirThread(store);
	await store.setCrmConnection(OURS, "mock");

	await expect(
		testDb.message.create({
			data: {
				id: "planted-message",
				conversationId: thread.id,
				officeId: OURS,
				direction: "in",
				source: "guest",
				text: "planted",
				at: new Date(),
			},
		}),
	).rejects.toMatchObject(FOREIGN_KEY);
	await expect(
		testDb.translation.create({
			data: { messageId: inboundId, officeId: OURS, locale: "vi", text: "x" },
		}),
	).rejects.toMatchObject(FOREIGN_KEY);
	await expect(
		testDb.qualification.update({ where: { conversationId: thread.id }, data: { officeId: OURS } }),
	).rejects.toMatchObject(FOREIGN_KEY);
	await expect(
		testDb.answer.updateMany({ where: { conversationId: thread.id }, data: { officeId: OURS } }),
	).rejects.toMatchObject(FOREIGN_KEY);
	// A CRM link names its office twice (the connection and the thread); they must agree.
	await expect(
		testDb.crmLink.update({ where: { conversationId: thread.id }, data: { officeId: OURS } }),
	).rejects.toMatchObject(FOREIGN_KEY);
	await store.close();
});

test("a draft answers a message that exists, and goes with it", async () => {
	const store = await testInboxStore();
	const { thread, inboundId } = await theirThread(store);

	await expect(
		testDb.draft.update({
			where: { conversationId: thread.id },
			data: { answersMessageId: "no-such-message" },
		}),
	).rejects.toMatchObject(FOREIGN_KEY);
	await testDb.answer.deleteMany({ where: { inboundId } });
	await testDb.message.delete({ where: { id: inboundId } });
	expect(
		(await testDb.draft.findUniqueOrThrow({ where: { conversationId: thread.id } }))
			.answersMessageId,
	).toBeNull();
	await store.close();
});
