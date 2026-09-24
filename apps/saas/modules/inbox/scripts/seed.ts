import { backfillAnswerOperatorNames } from "@repo/database";

import { settleBackgroundWork } from "../lib/background";
import { getRuntime } from "../lib/runtime";
import { DEMO_THREADS, seedInbox } from "../lib/seed";
import {
	WALK_ADMIN_EMAIL,
	WALK_OFFICE_ID,
	WALK_USER_EMAIL,
	WALK_USER_PASSWORD,
} from "../lib/walk-user";
import { seedWalkOffice } from "./seed-walk-office";
import { seedWalkAdmin, seedWalkUser } from "./seed-walk-user";

async function main(): Promise<void> {
	const { store } = getRuntime();

	const walkUser = await seedWalkUser();
	const walkAdmin = await seedWalkAdmin();
	const walkOffice = await seedWalkOffice();
	console.info(
		`Agent login ${walkUser === "exists" ? "already exists" : "created"}: ${WALK_USER_EMAIL} / ${WALK_USER_PASSWORD}`,
	);
	console.info(
		`Admin login ${walkAdmin === "exists" ? "already exists" : "created"}: ${WALK_ADMIN_EMAIL} / ${WALK_USER_PASSWORD} (platform admin, owner of the walk office)`,
	);
	console.info(
		`Walk office ${walkOffice === "exists" ? "already exists" : "created"}: ${WALK_OFFICE_ID}\n`,
	);
	const named = await backfillAnswerOperatorNames();
	if (named > 0) console.info(`Answers given their sender's name (ADR 0013): ${named}\n`);

	const owned = await store.listConversations({ userId: "seed", officeId: WALK_OFFICE_ID });
	const existing = DEMO_THREADS.filter((thread) =>
		owned.some((conv) => conv.pipe === thread.pipe && conv.guestId === thread.guestId),
	).length;
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
		`\n${conversations.length} demo threads in ${WALK_OFFICE_ID}` +
			(existing ? ` (wrote ${created}, skipped ${existing} existing)` : " (fresh write)"),
	);
	console.info(
		"Re-run skips threads that already exist. Delete the office's threads in the database for a fresh set.",
	);
	console.info("Open http://localhost:3010 — sign in, then Inbox. Nothing here is a real guest.");
	// Translations (ADR 0007) run in the background after each inbound; let them land
	// before the connection is released under them.
	await settleBackgroundWork();
	await store.close();
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
