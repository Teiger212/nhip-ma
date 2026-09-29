import crypto from "node:crypto";

import type { InboxConfig } from "../config";
import type { Store } from "../types";
import { decryptSecret, encryptSecret, tokenContext } from "./secrets";
import { exchangeZaloCode, zaloOaProfile } from "./vendors";

/** The cookie that carries a connect attempt from Nhịp to Zalo's consent and back. */
export const ZALO_CONNECT_COOKIE = "nhip_zalo_connect";
const TEN_MINUTES_MS = 10 * 60 * 1000;
const CONNECT_CONTEXT = "zalo-connect-cookie";

type ConnectAttempt = { state: string; verifier: string; officeId: string; expiresAt: number };

export function zaloCallbackUrl(appUrl: string): string {
	return new URL("/api/pipes/zalo/callback", appUrl).toString();
}

/**
 * Start a connect for an office: a random `state` and PKCE verifier, sealed into a cookie
 * (encrypted with PIPE_SECRETS_KEY), and the challenge Zalo's consent page needs.
 */
export function beginZaloConnect(officeId: string, config: InboxConfig) {
	const key = config.pipeSecretsKey;
	if (!key) throw new Error("PIPE_SECRETS_KEY is not set");
	const attempt: ConnectAttempt = {
		state: crypto.randomBytes(16).toString("base64url"),
		verifier: crypto.randomBytes(32).toString("base64url"),
		officeId,
		expiresAt: Date.now() + TEN_MINUTES_MS,
	};
	const challenge = crypto.createHash("sha256").update(attempt.verifier).digest("base64url");
	return {
		state: attempt.state,
		challenge,
		cookie: encryptSecret(JSON.stringify(attempt), key, CONNECT_CONTEXT),
		maxAgeSec: TEN_MINUTES_MS / 1000,
	};
}

/** The attempt the callback belongs to, or null when the cookie is missing, stale or not ours. */
export function readZaloConnect(
	cookie: string | undefined,
	state: string | null,
	config: InboxConfig,
): ConnectAttempt | null {
	if (!cookie || !state || !config.pipeSecretsKey) return null;
	try {
		const attempt = JSON.parse(
			decryptSecret(cookie, config.pipeSecretsKey, CONNECT_CONTEXT),
		) as ConnectAttempt;
		const sameState =
			attempt.state.length === state.length &&
			crypto.timingSafeEqual(Buffer.from(attempt.state), Buffer.from(state));
		return sameState && attempt.expiresAt > Date.now() ? attempt : null;
	} catch {
		return null;
	}
}

export type ZaloConnectOutcome = "connected" | "held" | "refused" | "failed";

/**
 * Finish a connect: exchange the code for the OA's first tokens, and store them encrypted on
 * the office's connection. The OA is whichever one Zalo issued the tokens for, never the
 * callback URL's word for it (the query string can be edited between Zalo's consent and the
 * callback). An OA another office holds is refused (ADR 0017).
 */
export async function completeZaloConnect(input: {
	attempt: Pick<ConnectAttempt, "verifier" | "officeId">;
	code: string | null;
	claimedOaId: string | null;
	config: InboxConfig;
	store: Store;
}): Promise<ZaloConnectOutcome> {
	const { config, store, attempt } = input;
	const { appId, appSecret } = config.zalo;
	const key = config.pipeSecretsKey;
	if (!input.code || !appId || !appSecret || !key) return "refused";
	try {
		const tokens = await exchangeZaloCode({
			appId,
			appSecret,
			code: input.code,
			codeVerifier: attempt.verifier,
		});
		const { oaId } = await zaloOaProfile(tokens.accessToken);
		if (input.claimedOaId && input.claimedOaId !== oaId) {
			console.error("[zalo] callback oa_id does not match the token's OA; refusing");
			return "refused";
		}
		const claimed = await store.claimPipe({
			pipe: "zalo",
			externalId: oaId,
			officeId: attempt.officeId,
		});
		if (!claimed.ok) return "held";
		await store.savePipeCredential("zalo", oaId, {
			accessToken: encryptSecret(tokens.accessToken, key, tokenContext("zalo", oaId, "access")),
			refreshToken: encryptSecret(tokens.refreshToken, key, tokenContext("zalo", oaId, "refresh")),
			accessTokenExpiresAt: new Date(Date.now() + tokens.expiresInSec * 1000),
		});
		return "connected";
	} catch (err) {
		console.error("[zalo] connect failed", err);
		return "failed";
	}
}
