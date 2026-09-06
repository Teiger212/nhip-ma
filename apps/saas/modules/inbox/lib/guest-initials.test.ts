import { expect, test } from "vitest";

import { guestInitials } from "./guest-initials";

test("uses the first letter of a single given name", () => {
	expect(guestInitials("Minji")).toBe("M");
	expect(guestInitials("Thảo")).toBe("T");
});

test("uses first and last initials for multi-word names", () => {
	expect(guestInitials("Alexei Petrov")).toBe("AP");
});

test("falls back when the label is blank", () => {
	expect(guestInitials("   ")).toBe("?");
});
