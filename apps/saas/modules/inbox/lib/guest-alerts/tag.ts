import { createHmac } from "node:crypto";

/** The fixed label the tag's key is derived under (ADR 0019): no new env var. */
const LABEL = "nhip-alert-tag";

let cached: { secret: string; key: Buffer } | null = null;

function keyFor(secret: string): Buffer {
	if (cached?.secret !== secret) {
		cached = { secret, key: createHmac("sha256", LABEL).update(secret).digest() };
	}
	return cached.key;
}

/**
 * The notification tag for a thread's alerts (ADR 0019 "Bursts"): a new alert replaces the
 * last one with the same tag, so it is stable per thread, and the thread's id never leaves
 * Nhịp. HMAC-SHA256 of the thread id under the key `HMAC("nhip-alert-tag", BETTER_AUTH_SECRET)`;
 * rotating that secret changes only future tags. Throws without a secret: an unkeyed hash of an
 * id can be guessed.
 */
export function alertTag(
	conversationId: string,
	secret: string | undefined = process.env.BETTER_AUTH_SECRET,
): string {
	if (!secret) {
		throw new Error("BETTER_AUTH_SECRET is not set: an alert's tag cannot be made.");
	}
	return createHmac("sha256", keyFor(secret)).update(conversationId, "utf8").digest("hex");
}
