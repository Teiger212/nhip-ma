import { expect, test } from "vitest";

import { mockInboxConfig } from "./config";
import { transmit } from "./pipes";
import { resolveSendMode } from "./runtime";
import type { Conversation } from "./types";

test("SEND_MODE is mock unless the value is exactly live", () => {
	expect(resolveSendMode(undefined)).toBe("mock");
	expect(resolveSendMode("")).toBe("mock");
	expect(resolveSendMode("mock")).toBe("mock");
	expect(resolveSendMode("MOCK")).toBe("mock");
	expect(resolveSendMode("live")).toBe("live");
});

test("transmit stays mock when mode is not live even if tokens exist", async () => {
	const conversation = {
		pipe: "whatsapp",
		guestId: "16315551181",
	} as Conversation;
	const result = await transmit({
		conversation,
		text: "hello",
		config: mockInboxConfig({ whatsapp: { accessToken: "token", phoneNumberId: "phone" } }),
	});
	expect(result.mock).toBe(true);
	expect(result.pipe).toBe("whatsapp");
	expect(result.to).toBe("16315551181");
});
