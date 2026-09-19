import { conversationId } from "@repo/database/inbox";

import { settleBackgroundWork } from "../lib/background";
import { getRuntime } from "../lib/runtime";
import { DEMO_THREADS, seedInbox } from "../lib/seed";
import {
	canUseKitAuthDatabase,
	WALK_OFFICE_ID,
	WALK_USER_EMAIL,
	WALK_USER_PASSWORD,
} from "../lib/walk-user";

async function main(): Promise<void> {
	const { store } = getRuntime();

	if (!canUseKitAuthDatabase()) {
		console.info(
			"Walk login and office were skipped because DATABASE_URL is not Postgres. Kit NavBar needs Better Auth.",
		);
		console.info(
			"Set DATABASE_URL=postgresql://postgres:postgres@localhost:5432/supastarter, then:",
		);
		console.info("  brew services start postgresql@16   # or: docker compose up -d postgres");
		console.info("  pnpm --filter @repo/database generate");
		console.info("  pnpm --filter @repo/database push");
		console.info("  pnpm seed\n");
	} else {
		const { seedWalkUser } = await import("./seed-walk-user");
		const { seedWalkOffice } = await import("./seed-walk-office");
		const walkUser = await seedWalkUser();
		const walkOffice = await seedWalkOffice();
		console.info(
			`Walk login ${walkUser === "exists" ? "already exists" : "created"}: ${WALK_USER_EMAIL} / ${WALK_USER_PASSWORD}`,
		);
		console.info(
			`Walk office ${walkOffice === "exists" ? "already exists" : "created"}: ${WALK_OFFICE_ID}\n`,
		);
	}

	const existing = (
		await Promise.all(
			DEMO_THREADS.map((thread) =>
				store.getConversation(conversationId(thread.pipe, thread.guestId)),
			),
		)
	).filter(Boolean).length;
	const conversations = await seedInbox(WALK_OFFICE_ID);
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
	// Files written before office tenancy carry threads with no office; the walk office
	// takes them so nothing disappears from the queue after an upgrade.
	const adopted = await store.adoptUnownedThreads(WALK_OFFICE_ID);
	if (adopted > 0) {
		console.info(`${adopted} thread(s) without an office now belong to ${WALK_OFFICE_ID}.`);
	}
	console.info("Re-run skips threads that already exist. Delete data/nhip.db for a fresh set.");
	console.info("Open http://localhost:3010 — sign in, then Inbox. Nothing here is a real guest.");
	// Translations (ADR 0007) run in the background after each inbound; let them land
	// before the file is closed under them.
	await settleBackgroundWork();
	await store.close();
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
