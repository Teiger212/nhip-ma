import crypto from "node:crypto";

/**
 * Vendor tokens at rest (`inbox_pipe_credential`): AES-256-GCM under `PIPE_SECRETS_KEY`
 * (32 random bytes, base64), which lives only in the deployment's env. A database copy
 * without the key cannot send as the office.
 */
const VERSION = "v1";

function keyFrom(base64Key: string): Buffer {
	const key = Buffer.from(base64Key, "base64");
	if (key.length !== 32) {
		throw new Error("PIPE_SECRETS_KEY must be 32 bytes, base64-encoded");
	}
	return key;
}

export function isValidSecretsKey(base64Key: string): boolean {
	try {
		keyFrom(base64Key);
		return true;
	} catch {
		return false;
	}
}

export function encryptSecret(plain: string, base64Key: string): string {
	const iv = crypto.randomBytes(12);
	const cipher = crypto.createCipheriv("aes-256-gcm", keyFrom(base64Key), iv);
	const body = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
	return [VERSION, iv, cipher.getAuthTag(), body].map((p) => (typeof p === "string" ? p : p.toString("base64"))).join(":");
}

export function decryptSecret(sealed: string, base64Key: string): string {
	const [version, iv, tag, body] = sealed.split(":");
	if (version !== VERSION || !iv || !tag || !body) {
		throw new Error("Not a sealed pipe secret");
	}
	const decipher = crypto.createDecipheriv("aes-256-gcm", keyFrom(base64Key), Buffer.from(iv, "base64"));
	decipher.setAuthTag(Buffer.from(tag, "base64"));
	return Buffer.concat([decipher.update(Buffer.from(body, "base64")), decipher.final()]).toString("utf8");
}
