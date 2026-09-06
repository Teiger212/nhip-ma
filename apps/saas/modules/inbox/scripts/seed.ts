import { conversationId } from "@repo/database/inbox";

import { getRuntime } from "../lib/runtime";
import { DEMO_THREADS, seedInbox } from "../lib/seed";
import { canUseKitAuthDatabase, WALK_USER_EMAIL, WALK_USER_PASSWORD } from "../lib/walk-user";

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

	if (!canUseKitAuthDatabase()) {
		console.info(
			"\nWalk login was skipped because DATABASE_URL is not Postgres. Kit NavBar needs Better Auth.",
		);
		console.info(
			"Set DATABASE_URL=postgresql://postgres:postgres@localhost:5432/supastarter, then:",
		);
		console.info("  docker compose up -d postgres");
		console.info("  pnpm --filter @repo/database generate");
		console.info("  pnpm --filter @repo/database push");
		console.info("  pnpm seed");
	} else {
		const { seedWalkUser } = await import("./seed-walk-user");
		const walkUser = await seedWalkUser();
		if (walkUser === "exists") {
			console.info(`\nWalk login already exists: ${WALK_USER_EMAIL} / ${WALK_USER_PASSWORD}`);
		} else {
			console.info(`\nWalk login: ${WALK_USER_EMAIL} / ${WALK_USER_PASSWORD}`);
		}
	}

	console.info("Open http://localhost:3010 — sign in, then Inbox. Nothing here is a real guest.");
	await store.close();
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
