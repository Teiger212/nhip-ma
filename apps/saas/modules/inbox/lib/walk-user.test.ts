import { afterEach, beforeEach, expect, test, vi } from "vitest";

import { isPostgresDatabaseUrl, isWalkBypassAuthEnabled, walkInboxRedirectUrl } from "./walk-user";

// Other test files stub NODE_ENV / WALK_BYPASS_AUTH; pin them so the defaults are deterministic.
beforeEach(() => {
	vi.stubEnv("WALK_BYPASS_AUTH", "");
	vi.stubEnv("NODE_ENV", "test");
});

afterEach(() => {
	vi.unstubAllEnvs();
});

test("walk bypass is on only when WALK_BYPASS_AUTH is exactly 1 outside production", () => {
	expect(isWalkBypassAuthEnabled(undefined)).toBe(false);
	expect(isWalkBypassAuthEnabled("")).toBe(false);
	expect(isWalkBypassAuthEnabled("true")).toBe(false);
	expect(isWalkBypassAuthEnabled("0")).toBe(false);
	expect(isWalkBypassAuthEnabled("1", "development")).toBe(true);
	expect(isWalkBypassAuthEnabled("1", "test")).toBe(true);
	expect(isWalkBypassAuthEnabled("1", "production")).toBe(false);
});

test("walk inbox redirect uses NEXT_PUBLIC_SAAS_URL and a locale prefix", () => {
	expect(walkInboxRedirectUrl("https://demo.trycloudflare.com").href).toBe(
		"https://demo.trycloudflare.com/en/inbox",
	);
	expect(walkInboxRedirectUrl("http://localhost:3010").href).toBe("http://localhost:3010/en/inbox");
	expect(walkInboxRedirectUrl(undefined).href).toBe("http://localhost:3010/en/inbox");
	expect(walkInboxRedirectUrl("http://localhost:3010", "vi").href).toBe(
		"http://localhost:3010/vi/inbox",
	);
});

test("kit auth seed only runs against a postgres URL", () => {
	expect(isPostgresDatabaseUrl(undefined)).toBe(false);
	expect(isPostgresDatabaseUrl("")).toBe(false);
	expect(isPostgresDatabaseUrl("file:./data/nhip.db")).toBe(false);
	expect(isPostgresDatabaseUrl("postgresql://postgres:postgres@localhost:5432/supastarter")).toBe(
		true,
	);
	expect(isPostgresDatabaseUrl("postgres://postgres:postgres@localhost:5432/supastarter")).toBe(
		true,
	);
});
