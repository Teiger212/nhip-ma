import type { InboxConfig } from "../config";
import type { Store } from "../types";
import { decryptSecret, encryptSecret, tokenContext } from "./secrets";
import { refreshZaloToken, SendError, ZaloTokenRefused } from "./vendors";

/** Refresh this long before Zalo's stated expiry, so a send never races the clock. */
export const ZALO_REFRESH_MARGIN_MS = 5 * 60 * 1000;

/** What operators are told; the OA id and Zalo's own words stay with the platform admin. */
const DISCONNECTED_MESSAGE = "This Zalo connection is disconnected; Nhịp has been notified.";

/**
 * The OA has no usable tokens: never connected, Zalo refused its refresh token, or the stored
 * tokens cannot be read. Only a platform admin reconnecting the OA fixes it. `newly` is true
 * when this call is the one that recorded the disconnect (so it alerts once).
 */
export class ZaloDisconnectedError extends SendError {
	readonly reason: string;
	readonly newly: boolean;
	constructor(reason: string, newly = false) {
		super(DISCONNECTED_MESSAGE, null, "config");
		this.name = "ZaloDisconnectedError";
		this.reason = reason;
		this.newly = newly;
	}
}

type Outcome = { token: string } | { disconnected: string; newly: boolean };

/**
 * The OA's current access token, refreshed first when it is close to expiry. Runs under the
 * credential's row lock (`withPipeCredentialLock`): a Zalo refresh token works once, so two
 * instances refreshing together would lock the OA out. The new pair, or the disconnect, is
 * written in the same transaction. Only a definite refusal from Zalo (or unreadable stored
 * tokens) disconnects the OA; a timeout or an outage is a plain send failure, retried later.
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
		throw new SendError("Zalo is not configured on this deployment", null, "config");
	}
	const open = (sealed: string, kind: "access" | "refresh") =>
		decryptSecret(sealed, key, tokenContext("zalo", oaId, kind));

	let outcome: Outcome;
	try {
		outcome = await store.withPipeCredentialLock("zalo", oaId, async (current, save) => {
			if (!current) return { disconnected: "never connected", newly: false };
			if (current.disconnectedAt) {
				return { disconnected: current.disconnectedReason ?? "disconnected", newly: false };
			}
			const disconnect = async (reason: string): Promise<Outcome> => {
				await save({ disconnectedAt: new Date(), disconnectedReason: reason });
				return { disconnected: reason, newly: true };
			};
			const now = input.now ?? Date.now();
			let refreshToken: string;
			try {
				if (current.accessTokenExpiresAt.getTime() - now > ZALO_REFRESH_MARGIN_MS) {
					return { token: open(current.accessToken, "access") };
				}
				refreshToken = open(current.refreshToken, "refresh");
			} catch {
				return disconnect("stored tokens unreadable");
			}
			let fresh;
			try {
				fresh = await refreshZaloToken({ appId, appSecret, refreshToken });
			} catch (err) {
				if (err instanceof ZaloTokenRefused) return disconnect(err.message);
				throw err;
			}
			await save({
				accessToken: encryptSecret(fresh.accessToken, key, tokenContext("zalo", oaId, "access")),
				refreshToken: encryptSecret(fresh.refreshToken, key, tokenContext("zalo", oaId, "refresh")),
				accessTokenExpiresAt: new Date(now + fresh.expiresInSec * 1000),
			});
			return { token: fresh.accessToken };
		});
	} catch (err) {
		// Nothing was sent: an outage, a timeout, or the lock itself failing. A definite
		// failure the operator may retry, never an ambiguous delivery.
		console.error(`[zalo] could not get a token for OA ${oaId}`, err);
		throw new SendError("Zalo could not be reached; nothing was sent. Try again.", null, "config");
	}
	if ("token" in outcome) return outcome.token;
	if (outcome.newly) console.error(`[zalo] OA ${oaId} disconnected: ${outcome.disconnected}`);
	throw new ZaloDisconnectedError(outcome.disconnected, outcome.newly);
}
