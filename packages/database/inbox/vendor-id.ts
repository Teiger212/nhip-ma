import { createHmac, hkdfSync } from "node:crypto";

/**
 * A vendor's message id as Nhịp stores it (#141). A WhatsApp message id can encode the guest's
 * number, so the raw id is never stored: every write (`Message`, `Answer`, the webhook log) and
 * the duplicate check store and compare this keyed hash instead. The same raw id always hashes
 * the same, which is all the dedupe needs; nothing reads a raw vendor id back.
 *
 * HMAC-SHA256 under a key derived (HKDF) from `BETTER_AUTH_SECRET` with a fixed label, so there
 * is no new secret to manage, and a database copy without the secret cannot test guesses
 * (phone numbers are few enough to try them all against an unkeyed hash). Rotating
 * `BETTER_AUTH_SECRET` re-keys it: a vendor retry that spans a rotation is filed again.
 */
const LABEL = "nhip/vendor-message-id/v1";

let cached: { secret: string; key: Buffer } | null = null;

function keyFor(secret: string): Buffer {
	if (cached?.secret !== secret) {
		cached = { secret, key: Buffer.from(hkdfSync("sha256", secret, "", LABEL, 32)) };
	}
	return cached.key;
}

/** The stored form of a vendor message id: hex HMAC-SHA256. Throws without `BETTER_AUTH_SECRET`. */
export function hashVendorMessageId(raw: string): string {
	const secret = process.env.BETTER_AUTH_SECRET;
	if (!secret) {
		// Fail closed: an unkeyed hash would make a phone-bearing id recoverable.
		throw new Error("BETTER_AUTH_SECRET is not set: vendor message ids cannot be stored.");
	}
	return createHmac("sha256", keyFor(secret)).update(raw, "utf8").digest("hex");
}

/** `hashVendorMessageId` for an optional id: no id (null or empty) stays null. */
export function storedVendorMessageId(raw: string | null | undefined): string | null {
	return raw ? hashVendorMessageId(raw) : null;
}
