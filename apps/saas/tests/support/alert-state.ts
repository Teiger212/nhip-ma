/**
 * The alert log as a test sees it (ADR 0019; run through tsx by `alerts.ts`, like
 * `crm-state.ts`). A phone's lock screen is out of a test's reach, so E2E reads the log a mock
 * deployment writes instead: one row per operator per alert. Reading it is looking at the
 * operators' phones. Nothing here writes.
 *
 *   tsx tests/support/alert-state.ts alerts <officeId>   the office's alerts as JSON, oldest first
 *   tsx tests/support/alert-state.ts devices <userId>    the operator's devices as JSON, oldest first
 */
import { db } from "@repo/database";

async function main(): Promise<void> {
	const [command, id] = process.argv.slice(2);
	if (!id) throw new Error(`${command ?? "<command>"} <id>`);
	if (command === "alerts") {
		const rows = await db.inboxAlert.findMany({
			where: { officeId: id },
			orderBy: [{ createdAt: "asc" }, { id: "asc" }],
			select: {
				id: true,
				userId: true,
				conversationId: true,
				officeId: true,
				kind: true,
				sounded: true,
				link: true,
				createdAt: true,
			},
		});
		process.stdout.write(JSON.stringify(rows));
	} else if (command === "devices") {
		const rows = await db.pushSubscription.findMany({
			where: { userId: id },
			orderBy: [{ createdAt: "asc" }, { id: "asc" }],
			select: { id: true, userId: true },
		});
		process.stdout.write(JSON.stringify(rows));
	} else {
		throw new Error(`unknown command ${command}`);
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
