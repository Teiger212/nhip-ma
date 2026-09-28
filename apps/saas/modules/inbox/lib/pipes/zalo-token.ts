import type { InboxConfig } from "../config";
import type { Store } from "../types";
import { decryptSecret, encryptSecret } from "./secrets";
import { refreshZaloToken, SendError } from "./vendors";

/** Refresh this long before Zalo's stated expiry, so a send never races the clock. */
export const ZALO_REFRESH_MARGIN_MS = 5 * 60 * 1000;

/**
 * The OA has no usable tokens: never connected, or a refresh failed and the single-use
 * refresh token may be spent. Only a platform admin reconnecting the OA fixes it.
 */
export class ZaloDisconnectedError extends SendError {
	constructor(oaId: string, reason: string) {
		super(`Zalo OA ${oaId} is disconnected (${reason}); a platform admin must reconnect it`, null, "config");
		this.name = "ZaloDisconnectedError";
	}
}

/**
 * The OA's current access token, refreshed first when it is close to expiry. Runs under the
 * credential's row lock (`withPipeCredentialLock`): a Zalo refresh token works once, so two
 * instances refreshing together would lock the OA out. The new pair is written in the same
 * transaction; a failed refresh writes nothing and is never retried with the old token.
 */
export async function zaloAccessToken(input: {
	store: Store;
	config: InboxConfig;
	oaId: string;
	now?: number;
}): Promise<string> {
	const { store, config, oaId } = input;
	const { appId, appSecret } = config.zalo;
	const key = config.pipeSecretsKey;
	if (!appId || !appSecret || !key) {
		throw new SendError(
			"Zalo live send needs ZALO_APP_ID, ZALO_APP_SECRET and PIPE_SECRETS_KEY",
			null,
			"config",
		);
	}
	return store.withPipeCredentialLock("zalo", oaId, async (current, save) => {
		if (!current) throw new ZaloDisconnectedError(oaId, "never connected");
		const now = input.now ?? Date.now();
		if (current.accessTokenExpiresAt.getTime() - now > ZALO_REFRESH_MARGIN_MS) {
			return decryptSecret(current.accessToken, key);
		}
		let fresh: Awaited<ReturnType<typeof refreshZaloToken>>;
		try {
			fresh = await refreshZaloToken({
				appId,
				appSecret,
				refreshToken: decryptSecret(current.refreshToken, key),
			});
		} catch (err) {
			const reason = err instanceof Error ? err.message : "refresh failed";
			console.error(`[zalo] token refresh failed for OA ${oaId}: ${reason}`);
			throw new ZaloDisconnectedError(oaId, reason);
		}
		try {
			await save({
				accessToken: encryptSecret(fresh.accessToken, key),
				refreshToken: encryptSecret(fresh.refreshToken, key),
				accessTokenExpiresAt: new Date(now + fresh.expiresInSec * 1000),
			});
		} catch (err) {
			// Zalo spent the old refresh token; the new one is lost with this write.
			console.error(`[zalo] OA ${oaId} refreshed but its new tokens were not saved; reconnect it`, err);
			throw new ZaloDisconnectedError(oaId, "new tokens not saved");
		}
		return fresh.accessToken;
	});
}
