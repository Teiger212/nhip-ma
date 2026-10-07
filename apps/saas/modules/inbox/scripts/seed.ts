import { db } from "@repo/database";

import { settleBackgroundWork } from "../lib/background";
import { SeedRefused } from "../lib/dev-seed/guard";
import { runSeed } from "./run-seed";

/** `pnpm seed [-- --reset]` (#69): see `runSeed`. */
async function main(): Promise<void> {
	try {
		await runSeed({ env: process.env, reset: process.argv.includes("--reset") });
	} finally {
		// The E2E seed's demo threads translate and alert in the background (ADR 0007, 0019): let
		// that land before the connection is released under it.
		await settleBackgroundWork();
		await db.$disconnect();
	}
}

main().catch((err: unknown) => {
	// A refusal says why in one sentence; anything else needs its stack.
	console.error(err instanceof SeedRefused ? err.message : err);
	process.exit(1);
});
