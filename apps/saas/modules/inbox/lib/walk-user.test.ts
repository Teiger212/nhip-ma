import { expect, test } from "vitest";

import { isPostgresDatabaseUrl } from "./walk-user";

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
