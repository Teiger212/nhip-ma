import { backfillAnswerOperatorNames, db, getUserByEmail } from "@repo/database";
import { createInboxStore } from "@repo/database/inbox";

import {
	RIVER_AGENT2_EMAIL,
	RIVER_AGENT_EMAIL,
	RIVER_MANAGER_EMAIL,
	RIVER_OFFICE_ID,
	DEMO_ADMIN_EMAIL,
	DEMO_AGENT2_EMAIL,
	DEMO_MANAGER_EMAIL,
	DEMO_OFFICE_ID,
	DEMO_AGENT_EMAIL,
	DEMO_PASSWORD,
} from "../lib/demo-user";
import { type SeedEnv, SeedRefused, seedRefusal } from "../lib/dev-seed/guard";
import { SEED_OFFICES, seedDevOffices } from "../lib/dev-seed/seed-offices";
import { refreshTemplate } from "../lib/inbox";
import { inView, isQuiet, threadStatus } from "../lib/queue";
import { getRuntime } from "../lib/runtime";
import { DEMO_THREADS, seedInbox } from "../lib/seed";
import { seedRiverOffice, seedDemoOffice } from "./seed-demo-office";
import {
	seedRiverLogins,
	seedDemoAdmin,
	retireLegacyWalkLogins,
	seedDemoAgent2,
	seedDemoManager,
	seedDemoUser,
} from "./seed-demo-user";

export type SeedOptions = {
	env: SeedEnv;
	/** `--reset`: rewrite what the seed wrote, as of now. */
	reset: boolean;
	now?: number;
	log?: (line: string) => void;
};

/**
 * `pnpm seed` (#69). Refuses first, before anything is written (`seedRefusal`). Then the walk
 * logins and the walk office, as always. Under `E2E` that is all, with the walk's four demo
 * threads: the E2E run's specs build their own offices and read the seed's few threads, so its
 * data never changes. Otherwise it is the rich dev and demo seed: a second office with its own
 * logins, and about sixty invented guests in every Inbox, CRM and alert state
 * (`lib/dev-seed`). The logins are printed at the end.
 */
export async function runSeed({
	env,
	reset,
	now = Date.now(),
	log = console.info,
}: SeedOptions): Promise<void> {
	const refusal = seedRefusal(env);
	if (refusal) throw new SeedRefused(refusal);
	const rich = !env.E2E?.trim();

	const retired = await retireLegacyWalkLogins();
	if (retired > 0) log(`Old walk logins renamed to the Hanoi Nest Seekers team (#264): ${retired}`);
	const walkUser = await seedDemoUser();
	const walkAdmin = await seedDemoAdmin();
	const walkAgent2 = await seedDemoAgent2();
	const walkManager = await seedDemoManager();
	const logins: Array<[string, "created" | "exists", string]> = [
		[DEMO_AGENT_EMAIL, walkUser, "agent, Hanoi Nest Seekers"],
		[DEMO_AGENT2_EMAIL, walkAgent2, "second agent, Hanoi Nest Seekers"],
		[DEMO_MANAGER_EMAIL, walkManager, "manager, Hanoi Nest Seekers: sees every thread, reassigns"],
		[DEMO_ADMIN_EMAIL, walkAdmin, "platform admin: its office memberships open nothing"],
	];
	if (rich) {
		const river = await seedRiverLogins();
		logins.push(
			[RIVER_MANAGER_EMAIL, river[RIVER_MANAGER_EMAIL], "manager, river office"],
			[RIVER_AGENT_EMAIL, river[RIVER_AGENT_EMAIL], "agent, river office"],
			[RIVER_AGENT2_EMAIL, river[RIVER_AGENT2_EMAIL], "second agent, river office"],
		);
		// Before the walk office, so the platform admin's active office stays the walk office.
		const riverOffice = await seedRiverOffice();
		log(
			`River office ${riverOffice === "exists" ? "already exists" : "created"}: ${RIVER_OFFICE_ID}`,
		);
	}
	const walkOffice = await seedDemoOffice();
	log(`Walk office ${walkOffice === "exists" ? "already exists" : "created"}: ${DEMO_OFFICE_ID}`);
	const named = await backfillAnswerOperatorNames();
	if (named > 0) log(`Answers given their sender's name (ADR 0013): ${named}`);

	if (rich) {
		await seedRich({ reset, now, log });
	} else {
		await seedDemoDemo({ reset, log });
	}

	log("\nLogins (password for all: walkthrough):");
	for (const [email, result, role] of logins) {
		log(`  ${email} / ${DEMO_PASSWORD}  ${role}${result === "created" ? " (created)" : ""}`);
	}
	log("Nothing here is a real guest.");
}

/** The E2E seed, unchanged: the walk's four demo threads, Minji agent 1's, Yuki agent 2's. */
async function seedDemoDemo({
	reset,
	log,
}: {
	reset: boolean;
	log: (line: string) => void;
}): Promise<void> {
	const { store } = getRuntime();
	const owned = reset
		? []
		: await store.listConversations({ userId: "seed", officeId: DEMO_OFFICE_ID, role: "manager" });
	const existing = DEMO_THREADS.filter((thread) =>
		owned.some((conv) => conv.pipe === thread.pipe && conv.guestId === thread.guestId),
	).length;
	const conversations = await seedInbox(DEMO_OFFICE_ID, { reset });
	for (const conv of conversations) {
		const q = conv.oneShot?.qualification;
		const paper = conv.oneShot?.paperwork?.mentioned ? "paperwork flagged" : "no paperwork";
		log(
			`${conv.id}  ${conv.guestName}  ${q?.rentOrBuy ?? "—"}  ${q?.timeframe ?? "—"}  ${q?.areaOfInterest ?? "—"}  ${paper}`,
		);
	}
	// Every state of assignment (ADR 0022): Minji is agent 1's, Yuki agent 2's, the rest Unassigned
	// (the manager's alone). Rewritten on every seed, so the demo always starts the same.
	const agent1 = await getUserByEmail(DEMO_AGENT_EMAIL);
	const agent2 = await getUserByEmail(DEMO_AGENT2_EMAIL);
	const owners: Record<string, string | null> = {
		"demo-ko-stay": agent1?.id ?? null,
		"demo-jp-buy": agent2?.id ?? null,
	};
	for (const conv of conversations) {
		await store.setOwner(conv.id, owners[conv.guestId] ?? null, DEMO_OFFICE_ID);
		// The template introduces the owner it now has (ADR 0024).
		const reassigned = await store.getOfficeConversation(DEMO_OFFICE_ID, conv.id);
		if (reassigned) await refreshTemplate(store, reassigned);
	}
	const created = conversations.length - existing;
	log(
		`\n${conversations.length} demo threads in ${DEMO_OFFICE_ID}` +
			(existing ? ` (wrote ${created}, skipped ${existing} existing)` : " (fresh write)"),
	);
	log(
		"Re-run skips threads that already exist. `pnpm seed --reset` rewrites them as of now (the fresh pair goes Quiet after 48 hours).",
	);
}

/** The rich seed, then what each office now holds, as its manager's Inbox counts it. */
async function seedRich({
	reset,
	now,
	log,
}: {
	reset: boolean;
	now: number;
	log: (line: string) => void;
}): Promise<void> {
	const results = await seedDevOffices({ reset, now });
	const store = createInboxStore(db);
	log("");
	for (const result of results) {
		const threads = await store.listConversationSummaries({
			userId: "seed",
			officeId: result.officeId,
			role: "manager",
		});
		const count = (keep: (thread: (typeof threads)[number]) => boolean) =>
			threads.filter(keep).length;
		const greeted = await db.message.count({
			where: { officeId: result.officeId, source: "auto_reply" },
		});
		const office = SEED_OFFICES.find((each) => each.officeId === result.officeId);
		const crm = office?.mockCrm
			? `, ${count((thread) => threadStatus(thread) === "won")} Won, ${count((thread) => threadStatus(thread) === "lost")} Lost, ${count((thread) => !thread.crm)} Not in CRM yet`
			: ", no CRM";
		log(
			`${result.officeId}: wrote ${result.written} guests, skipped ${result.skipped} already there. ` +
				`${threads.length} threads: ${count((thread) => inView(thread, "unassigned"))} Unassigned, ` +
				`${count((thread) => inView(thread, "yourTurn"))} Waiting (${count((thread) => isQuiet(thread, now))} Quiet), ` +
				`${count((thread) => inView(thread, "sent"))} Sent${crm}, ${greeted} greeted.`,
		);
		for (const warning of result.warnings) log(`  Warning: ${warning}`);
	}
	log(
		"\nA re-run adds nothing. `pnpm seed -- --reset` rewrites the seed's guests as of now (fresh ones go Quiet after 48 hours).",
	);
	log(
		`Open the app, sign in, then Inbox: the walk office's manager sees ${DEMO_OFFICE_ID}, the river office's ${RIVER_OFFICE_ID}.`,
	);
}
