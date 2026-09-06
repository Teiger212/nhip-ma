import { expect, test } from "vitest";

import { inboxStyles, isInboxStyle, resolveInboxStyle } from "./inbox-style";

test("inbox style resolves to olive unless a known variation is given", () => {
	expect(inboxStyles).toEqual(["olive", "swiss", "flat"]);
	expect(resolveInboxStyle(undefined)).toBe("olive");
	expect(resolveInboxStyle("")).toBe("olive");
	expect(resolveInboxStyle("glass")).toBe("olive");
	expect(resolveInboxStyle("swiss")).toBe("swiss");
	expect(resolveInboxStyle("flat")).toBe("flat");
	expect(isInboxStyle(42)).toBe(false);
});
