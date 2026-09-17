import { expect, test } from "vitest";

import { resolveSendMode } from "./runtime";

test("SEND_MODE is mock unless the value is exactly live", () => {
	expect(resolveSendMode(undefined)).toBe("mock");
	expect(resolveSendMode("")).toBe("mock");
	expect(resolveSendMode("mock")).toBe("mock");
	expect(resolveSendMode("MOCK")).toBe("mock");
	expect(resolveSendMode("live")).toBe("live");
});
