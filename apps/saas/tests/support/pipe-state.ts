/**
 * Puts an office's Zalo OA into a known state for a test (run through tsx by `pipes.ts`: the
 * Prisma client is ESM, which Playwright's loader cannot import). The consent on Zalo's own
 * screens cannot be driven, so a connected OA is set up here, as setup, with the server's
 * PIPE_SECRETS_KEY (playwright.config.ts loads the same env). Never for what a test proves.
 *
 *   tsx tests/support/pipe-state.ts connect <officeId> <oaId> [disconnected]
 *   tsx tests/support/pipe-state.ts release <oaId>
 */
import { db } from "@repo/database";
import { createInboxStore } from "@repo/database/inbox";

import { encryptSecret } from "../../modules/inbox/lib/pipes/secrets";

async function main(): Promise<void> {
	const [command, ...args] = process.argv.slice(2);
	const store = createInboxStore(db);
	const key = process.env.PIPE_SECRETS_KEY;
	if (!key) throw new Error("PIPE_SECRETS_KEY is not set (the E2E env sets it)");
	if (command === "connect") {
		const [officeId, oaId, state] = args;
		if (!officeId || !oaId) throw new Error("connect <officeId> <oaId> [disconnected]");
		const claimed = await store.claimPipe({ pipe: "zalo", externalId: oaId, officeId });
		if (!claimed.ok) throw new Error(`OA ${oaId} is held by office ${claimed.heldBy}`);
		await store.savePipeCredential("zalo", oaId, {
			accessToken: encryptSecret("e2e-access-token", key),
			refreshToken: encryptSecret("e2e-refresh-token", key),
			accessTokenExpiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
		});
		if (state === "disconnected") {
			await store.markPipeDisconnected("zalo", oaId, "E2E: refresh refused");
		}
	} else if (command === "release") {
		const [oaId] = args;
		if (!oaId) throw new Error("release <oaId>");
		await store.releasePipe("zalo", oaId);
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
