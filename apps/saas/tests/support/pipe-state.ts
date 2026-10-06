/**
 * Puts an office's Zalo OA into a known state for a test (run in the state process,
 * state-process.ts, for `pipes.ts`). The consent on Zalo's own screens cannot be driven, so a
 * connected OA is set up here, as setup, with the server's PIPE_SECRETS_KEY (playwright.config.ts
 * loads the same env). Never for what a test proves.
 */
import { db } from "@repo/database";
import { createInboxStore } from "@repo/database/inbox";

import { encryptSecret, tokenContext } from "../../modules/inbox/lib/pipes/secrets";

function secretsKey(): string {
	const key = process.env.PIPE_SECRETS_KEY;
	if (!key) throw new Error("PIPE_SECRETS_KEY is not set (the E2E env sets it)");
	return key;
}

/** The office holds the OA, connected (or already `disconnected`). */
export async function connectZalo(officeId: string, oaId: string, state?: string): Promise<void> {
	const key = secretsKey();
	const store = createInboxStore(db);
	const claimed = await store.claimPipe({ pipe: "zalo", externalId: oaId, officeId });
	if (!claimed.ok) throw new Error(`OA ${oaId} is held by office ${claimed.heldBy}`);
	await store.savePipeCredential("zalo", oaId, {
		accessToken: encryptSecret("e2e-access-token", key, tokenContext("zalo", oaId, "access")),
		refreshToken: encryptSecret("e2e-refresh-token", key, tokenContext("zalo", oaId, "refresh")),
		accessTokenExpiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
	});
	if (state === "disconnected") {
		await store.markPipeDisconnected("zalo", oaId, "E2E: refresh refused");
	}
}

/** The office holds the WhatsApp number. */
export async function connectWhatsApp(officeId: string, phoneNumberId: string): Promise<void> {
	// WhatsApp still sends from the deployment's own number (env); the office only holds it.
	const claimed = await createInboxStore(db).claimPipe({
		pipe: "whatsapp",
		externalId: phoneNumberId,
		officeId,
	});
	if (!claimed.ok) throw new Error(`number ${phoneNumberId} is held by office ${claimed.heldBy}`);
}

/** No office holds the OA. */
export async function releaseZalo(oaId: string): Promise<void> {
	await createInboxStore(db).releasePipe("zalo", oaId);
}
