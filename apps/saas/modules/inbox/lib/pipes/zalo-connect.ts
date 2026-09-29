import crypto from "node:crypto";

import type { InboxConfig } from "../config";
import { decryptSecret, encryptSecret } from "./secrets";

/** The cookie that carries a connect attempt from Nhịp to Zalo's consent and back. */
export const ZALO_CONNECT_COOKIE = "nhip_zalo_connect";
const TEN_MINUTES_MS = 10 * 60 * 1000;

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
		cookie: encryptSecret(JSON.stringify(attempt), key),
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
		const attempt = JSON.parse(decryptSecret(cookie, config.pipeSecretsKey)) as ConnectAttempt;
		const sameState =
			attempt.state.length === state.length &&
			crypto.timingSafeEqual(Buffer.from(attempt.state), Buffer.from(state));
		return sameState && attempt.expiresAt > Date.now() ? attempt : null;
	} catch {
		return null;
	}
}
