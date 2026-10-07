import { expect, test, vi } from "vitest";

import { hashVendorMessageId, storedVendorMessageId } from "./vendor-id";

/**
 * #141, ADR 0010 (amended): a vendor message id is stored keyed and hashed, never raw. A
 * WhatsApp id can carry the guest's number, and phone numbers are few enough to try them all
 * against an unkeyed hash, so the hash must depend on the deployment's secret, and storing must
 * fail rather than fall back to an unkeyed hash when there is none.
 */
const RAW = "wamid.HBgL84901234567FQIAEhgUM0FCQjI";
const SECRET_A = "vendor-id-test-secret-a-0123456789abcdef";
const SECRET_B = "vendor-id-test-secret-b-0123456789abcdef";

test("the stored form never holds the raw id, and the same id always stores the same", () => {
	vi.stubEnv("BETTER_AUTH_SECRET", SECRET_A);
	const stored = hashVendorMessageId(RAW);
	expect(stored).not.toContain("84901234567");
	expect(stored).not.toContain("wamid");
	expect(hashVendorMessageId(RAW), "a vendor retry finds the stored message").toBe(stored);
	expect(hashVendorMessageId(`${RAW}x`), "another message stores differently").not.toBe(stored);
});

test("the hash is keyed: another secret stores the same id differently", () => {
	vi.stubEnv("BETTER_AUTH_SECRET", SECRET_A);
	const underA = hashVendorMessageId(RAW);
	vi.stubEnv("BETTER_AUTH_SECRET", SECRET_B);
	expect(hashVendorMessageId(RAW)).not.toBe(underA);
});

test("with no secret, storing a vendor id fails rather than storing an unkeyed hash", () => {
	vi.stubEnv("BETTER_AUTH_SECRET", "");
	expect(() => hashVendorMessageId(RAW)).toThrow(/BETTER_AUTH_SECRET/);
	expect(() => storedVendorMessageId(RAW)).toThrow(/BETTER_AUTH_SECRET/);
	expect(storedVendorMessageId(null), "no id is still no id").toBeNull();
});
