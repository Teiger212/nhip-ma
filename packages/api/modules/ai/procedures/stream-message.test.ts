import { call } from "@orpc/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@repo/auth", () => ({
	auth: {
		api: {
			getSession: vi.fn(),
		},
	},
}));

import { auth } from "@repo/auth";

import { authenticatedSession } from "../../../test/session";
import { streamMessage } from "./stream-message";

describe("streamMessage", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.mocked(auth.api.getSession).mockResolvedValue(authenticatedSession());
	});

	it("rejects malformed UI messages before invoking the model", async () => {
		await expect(
			call(
				streamMessage,
				{
					messages: [
						{
							role: "user",
						},
					],
				},
				{ context: { headers: new Headers() } },
			),
		).rejects.toMatchObject({
			code: "BAD_REQUEST",
			message: "Invalid chat messages",
		});
	});

	it("rejects empty message histories at the input boundary", async () => {
		await expect(
			call(streamMessage, { messages: [] }, { context: { headers: new Headers() } }),
		).rejects.toBeDefined();
	});
});
