import { expect, test } from "vitest";

import { canUseKitAuthDatabase } from "./walk-user";

test("kit auth seed only runs against a postgres URL", () => {
	expect(canUseKitAuthDatabase(undefined)).toBe(false);
	expect(canUseKitAuthDatabase("")).toBe(false);
	expect(canUseKitAuthDatabase("file:./data/nhip.db")).toBe(false);
	expect(canUseKitAuthDatabase("postgresql://postgres:postgres@localhost:5432/supastarter")).toBe(
		true,
	);
	expect(canUseKitAuthDatabase("postgres://postgres:postgres@localhost:5432/supastarter")).toBe(
		true,
	);
});
