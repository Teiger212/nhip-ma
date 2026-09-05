import { conversationId } from "@repo/database/inbox";

import { getRuntime } from "../lib/runtime";
import { DEMO_THREADS, seedInbox } from "../lib/seed";

async function main(): Promise<void> {
	const { store } = getRuntime();
	const existing = (
		await Promise.all(
			DEMO_THREADS.map((thread) =>
				store.getConversation(conversationId(thread.pipe, thread.guestId)),
			),
		)
	).filter(Boolean).length;
	const conversations = await seedInbox();
	for (const conv of conversations) {
		const q = conv.oneShot?.qualification;
		const paper = conv.oneShot?.paperwork?.mentioned ? "paperwork flagged" : "no paperwork";
		console.info(
			`${conv.id}  ${conv.guestName}  ${q?.rentOrBuy ?? "—"}  ${q?.timeframe ?? "—"}  ${q?.areaOfInterest ?? "—"}  ${paper}`,
		);
	}
	const created = conversations.length - existing;
	console.info(
		`\n${conversations.length} demo threads in ${store.filePath}` +
			(existing ? ` (wrote ${created}, skipped ${existing} existing)` : " (fresh write)"),
	);
	console.info("Re-run skips threads that already exist. Delete data/nhip.db for a fresh set.");
	console.info("Open http://localhost:3010 — the inbox. Nothing here is a real guest.");
	await store.close();
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
