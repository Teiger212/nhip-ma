/**
 * Guest deletion as a test sees it (ADR 0020; run in the state process, state-process.ts, for
 * `deletion.ts`).
 */
import { db } from "@repo/database";
import { createInboxStore } from "@repo/database/inbox";

/**
 * An approved reply to the guest's latest message is between approve and the vendor's answer
 * (`sending`); answers its Answer's id. `operatorId` is who approved it; empty, nobody.
 */
export async function holdReply(
	officeId: string,
	conversationId: string,
	operatorId?: string,
): Promise<string> {
	const store = createInboxStore(db);
	const thread = await store.getOfficeConversation(officeId, conversationId);
	if (!thread?.unansweredInboundId) {
		throw new Error("hold: the thread has no guest message waiting for a reply");
	}
	const begun = await store.beginAnswer({
		officeId,
		conversationId,
		inboundId: thread.unansweredInboundId,
		text: "E2E: a reply still sending",
		operatorId: operatorId || null,
	});
	if (!begun.ok) throw new Error(`hold: approve refused (${begun.reason})`);
	return begun.answer.id;
}

/** The vendor answered: the held reply is sent. */
export async function releaseReply(officeId: string, answerId: string): Promise<void> {
	const answer = await db.answer.findUniqueOrThrow({
		where: { id: answerId, officeId },
		select: { pipe: true },
	});
	await createInboxStore(db).completeAnswer(officeId, answerId, {
		mock: true,
		pipe: answer.pipe,
		vendorMessageId: `e2e-held-${answerId}`,
	});
}

/**
 * The office's deletion receipts and lead tallies, oldest first, read afresh: the platform admin
 * reading them on request (no screen shows them yet).
 */
export async function deletionRecords(officeId: string) {
	const [receipts, tallies] = await Promise.all([
		db.guestDeletion.findMany({ where: { officeId }, orderBy: [{ at: "asc" }, { id: "asc" }] }),
		db.leadTally.findMany({
			where: { officeId },
			orderBy: [{ firstInboundAt: "asc" }, { id: "asc" }],
		}),
	]);
	return { receipts, tallies };
}
