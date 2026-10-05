/**
 * Guest deletion as a test sees it (ADR 0020; run through tsx by `deletion.ts`, like
 * `crm-state.ts`).
 *
 *   tsx tests/support/deletion-state.ts hold <officeId> <conversationId> [operatorId]
 *       an approved reply to the guest's latest message is between approve and the vendor's
 *       answer (`sending`); prints its Answer's id
 *   tsx tests/support/deletion-state.ts release <officeId> <answerId>
 *       the vendor answered: that reply is sent
 *   tsx tests/support/deletion-state.ts records <officeId>
 *       the office's deletion receipts and lead tallies as JSON, oldest first: the platform
 *       admin reading them on request (no screen shows them yet)
 */
import { db } from "@repo/database";
import { createInboxStore } from "@repo/database/inbox";

async function hold(officeId: string, conversationId: string, operatorId: string | null) {
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
		operatorId,
	});
	if (!begun.ok) throw new Error(`hold: approve refused (${begun.reason})`);
	process.stdout.write(begun.answer.id);
}

async function release(officeId: string, answerId: string) {
	const store = createInboxStore(db);
	const answer = await db.answer.findUniqueOrThrow({
		where: { id: answerId, officeId },
		select: { pipe: true },
	});
	await store.completeAnswer(officeId, answerId, {
		mock: true,
		pipe: answer.pipe,
		vendorMessageId: `e2e-held-${answerId}`,
	});
}

async function records(officeId: string) {
	const [receipts, tallies] = await Promise.all([
		db.guestDeletion.findMany({ where: { officeId }, orderBy: [{ at: "asc" }, { id: "asc" }] }),
		db.leadTally.findMany({
			where: { officeId },
			orderBy: [{ firstInboundAt: "asc" }, { id: "asc" }],
		}),
	]);
	process.stdout.write(JSON.stringify({ receipts, tallies }));
}

async function main(): Promise<void> {
	const [command, officeId, id, operatorId] = process.argv.slice(2);
	if (!officeId) throw new Error(`${command ?? "<command>"} <officeId>`);
	if (command === "records") {
		await records(officeId);
	} else if (command === "hold" && id) {
		await hold(officeId, id, operatorId || null);
	} else if (command === "release" && id) {
		await release(officeId, id);
	} else {
		throw new Error(`unknown command ${command}, or its id is missing`);
	}
}

async function run(): Promise<void> {
	try {
		await main();
		process.exit(0);
	} catch (error) {
		console.error(error);
		process.exit(1);
	}
}

// tsx runs this as CommonJS, which has no top-level await; `run` settles every outcome itself.
void run();
