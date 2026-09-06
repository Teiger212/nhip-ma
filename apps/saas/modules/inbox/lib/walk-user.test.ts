import { expect, test } from "vitest";

import { isPostgresDatabaseUrl, isWalkBypassAuthEnabled } from "./walk-user";

test("walk bypass is on only when WALK_BYPASS_AUTH is exactly 1", () => {
	expect(isWalkBypassAuthEnabled(undefined)).toBe(false);
	expect(isWalkBypassAuthEnabled("")).toBe(false);
	expect(isWalkBypassAuthEnabled("true")).toBe(false);
	expect(isWalkBypassAuthEnabled("0")).toBe(false);
	expect(isWalkBypassAuthEnabled("1")).toBe(true);
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
