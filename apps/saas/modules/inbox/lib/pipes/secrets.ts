import crypto from "node:crypto";

/**
 * Vendor tokens at rest (`inbox_pipe_credential`, a CRM's on `inbox_crm_connection`) and the
 * connect cookie: AES-256-GCM under `PIPE_SECRETS_KEY` (32 random bytes, base64), which lives
 * only in the deployment's env.
 * A database copy without the key cannot send as the office. `context` is bound in as
 * associated data, so a sealed value only opens where it was sealed (this OA's refresh
 * token, the connect cookie): one moved to another row or purpose fails to open.
 */
const VERSION = "v1";
const TAG_BYTES = 16;

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

export function encryptSecret(plain: string, base64Key: string, context: string): string {
	const iv = crypto.randomBytes(12);
	const cipher = crypto.createCipheriv("aes-256-gcm", keyFrom(base64Key), iv, {
		authTagLength: TAG_BYTES,
	});
	cipher.setAAD(Buffer.from(context, "utf8"));
	const body = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
	return [
		VERSION,
		iv.toString("base64"),
		cipher.getAuthTag().toString("base64"),
		body.toString("base64"),
	].join(":");
}

export function decryptSecret(sealed: string, base64Key: string, context: string): string {
	const [version, iv, tag, body] = sealed.split(":");
	if (version !== VERSION || !iv || !tag || !body) {
		throw new Error("Not a sealed pipe secret");
	}
	const tagBytes = Buffer.from(tag, "base64");
	if (tagBytes.length !== TAG_BYTES) throw new Error("Not a sealed pipe secret");
	const decipher = crypto.createDecipheriv(
		"aes-256-gcm",
		keyFrom(base64Key),
		Buffer.from(iv, "base64"),
		{ authTagLength: TAG_BYTES },
	);
	decipher.setAAD(Buffer.from(context, "utf8"));
	decipher.setAuthTag(tagBytes);
	return Buffer.concat([decipher.update(Buffer.from(body, "base64")), decipher.final()]).toString(
		"utf8",
	);
}

/** Where a pipe token is sealed: its pipe, endpoint and kind. */
export function tokenContext(pipe: string, externalId: string, kind: "access" | "refresh"): string {
	return `token:${pipe}:${externalId}:${kind}`;
}

/** Where an office's CRM access token is sealed: its CRM kind and office. */
export function crmTokenContext(kind: string, officeId: string): string {
	return `token:crm:${kind}:${officeId}:access`;
}
