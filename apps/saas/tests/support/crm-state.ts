/**
 * Puts a thread's CRM lead into a known state for a test (run through tsx by `crm.ts`, like
 * `pipe-state.ts`). Until the CRM's webhook and reconcile land (ADR 0003, the HubSpot
 * slice), nothing in the app reads an outcome from the CRM, so "the CRM reported this lead
 * lost" is set up here, as setup. Never for what a test proves.
 *
 *   tsx tests/support/crm-state.ts lost <officeId> <pipe> <guestId>
 */
import { db } from "@repo/database";
import { Pipe, conversationId, createInboxStore } from "@repo/database/inbox";

async function main(): Promise<void> {
	const [command, ...args] = process.argv.slice(2);
	const store = createInboxStore(db);
	if (command === "lost") {
		const [officeId, pipe, guestId] = args;
		if (!officeId || !pipe || !guestId) throw new Error("lost <officeId> <pipe> <guestId>");
		const id = conversationId(officeId, Pipe.parse(pipe), guestId);
		const now = new Date();
		const leadId = `e2e-lead-${guestId}`;
		// Same kind again keeps the office's other links.
		await store.setCrmConnection(officeId, "mock");
		await store.upsertMockCrmLead({
			id: leadId,
			officeId,
			name: `E2E lead ${guestId}`,
			phone: null,
			outcome: "lost",
			outcomeAt: now.toISOString(),
			outcomeReason: "E2E",
		});
		await store.saveCrmLink(id, {
			kind: "mock",
			leadId,
			leadName: `E2E lead ${guestId}`,
			method: "manual",
			checkedAt: now,
		});
		await store.saveCrmOutcomes(
			[{ conversationId: id, leadId, outcome: "lost", outcomeAt: now, outcomeReason: "E2E" }],
			now,
		);
	} else {
		throw new Error(`unknown command ${command}`);
	}
}

main()
	.then(() => process.exit(0))
	.catch((error) => {
		console.error(error);
		process.exit(1);
	});
