/**
 * Many guests at once, as setup (run in the state process, state-process.ts, for `guests.ts`;
 * #222). A spec about what the Inbox shows of many threads, not about how a guest's message
 * arrives, writes them through the inbox store's own calls: the ones a Zalo webhook, a
 * manager's assignment and an agent's approval make. Nothing that follows a message runs (no
 * alert, auto-reply or draft), and a reply is sent mock. A spec that proves the arrival brings
 * its guest in by a signed webhook.
 */
import { randomUUID } from "node:crypto";

import { db } from "@repo/database";
import { createInboxStore } from "@repo/database/inbox";

/** How many guests are written at once, within the database pool. */
const AT_ONCE = 8;

/**
 * Each guest writes once to the office's Zalo OA; then, by `fate`, nothing (`unassigned`), the
 * thread is given to `ownerId` (`assigned`), or given to them and answered by them (`answered`).
 */
export async function seedZaloGuests(
	officeId: string,
	oaId: string,
	fate: string,
	ownerId: string,
	...guestIds: string[]
): Promise<void> {
	if (fate !== "unassigned" && fate !== "assigned" && fate !== "answered") {
		throw new Error(`guests: no such fate ${fate}`);
	}
	if (fate !== "unassigned" && !ownerId) throw new Error(`guests: ${fate} needs an owner`);
	const store = createInboxStore(db);
	const seedOne = async (guestId: string) => {
		const { conversation } = await store.upsertInbound(
			{
				pipe: "zalo",
				source: "guest",
				guestId,
				guestName: null,
				text: `Hello from ${guestId}`,
				vendorMessageId: randomUUID(),
				pipeExternalId: oaId,
			},
			officeId,
		);
		if (fate === "unassigned") return;
		if (!(await store.setOwner(conversation.id, ownerId, officeId))) {
			throw new Error(`guests: ${ownerId} cannot be given ${guestId}'s thread`);
		}
		if (fate !== "answered") return;
		if (!conversation.unansweredInboundId) {
			throw new Error(`guests: ${guestId} has nothing to answer`);
		}
		const begun = await store.beginAnswer({
			officeId,
			conversationId: conversation.id,
			inboundId: conversation.unansweredInboundId,
			text: `Reply to ${guestId}`,
			operatorId: ownerId,
		});
		if (!begun.ok) throw new Error(`guests: answering ${guestId} refused (${begun.reason})`);
		await store.completeAnswer(officeId, begun.answer.id, {
			mock: true,
			pipe: "zalo",
			vendorMessageId: `e2e-guests-${begun.answer.id}`,
		});
	};
	for (let i = 0; i < guestIds.length; i += AT_ONCE) {
		await Promise.all(guestIds.slice(i, i + AT_ONCE).map(seedOne));
	}
}
