import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@repo/auth", () => ({
	auth: {
		api: {
			signInEmail: vi.fn(),
		},
	},
}));

import { auth } from "@repo/auth";

import { createWalkBypassResponse } from "./walk-bypass";
import { WALK_USER_EMAIL, WALK_USER_PASSWORD } from "./walk-user";

const SESSION_COOKIE = "better-auth.session_token=walk-session; Path=/; HttpOnly; SameSite=Lax";

describe("createWalkBypassResponse", () => {
	const originalBypass = process.env.WALK_BYPASS_AUTH;
	const originalSaasUrl = process.env.NEXT_PUBLIC_SAAS_URL;

	beforeEach(() => {
		process.env.NEXT_PUBLIC_SAAS_URL = "http://localhost:3010";
		delete process.env.WALK_BYPASS_AUTH;
		vi.mocked(auth.api.signInEmail).mockReset();
	});

	afterEach(() => {
		if (originalBypass === undefined) {
			delete process.env.WALK_BYPASS_AUTH;
		} else {
			process.env.WALK_BYPASS_AUTH = originalBypass;
		}
		if (originalSaasUrl === undefined) {
			delete process.env.NEXT_PUBLIC_SAAS_URL;
		} else {
			process.env.NEXT_PUBLIC_SAAS_URL = originalSaasUrl;
		}
	});

	it("returns 403 when WALK_BYPASS_AUTH is not 1", async () => {
		const response = await createWalkBypassResponse(
			new Request("https://demo.trycloudflare.com/api/walk-bypass"),
		);

		expect(response.status).toBe(403);
		expect(auth.api.signInEmail).not.toHaveBeenCalled();
	});

	it("signs in the walk user and forwards Better Auth Set-Cookie to /inbox", async () => {
		process.env.WALK_BYPASS_AUTH = "1";
		const signInResponse = new Response(JSON.stringify({ user: { email: WALK_USER_EMAIL } }), {
			status: 200,
			headers: {
				"Set-Cookie": SESSION_COOKIE,
			},
		});
		vi.mocked(auth.api.signInEmail).mockResolvedValue(
			signInResponse as unknown as Awaited<ReturnType<typeof auth.api.signInEmail>>,
		);

		const response = await createWalkBypassResponse(
			new Request("https://demo.trycloudflare.com/api/walk-bypass", {
				headers: { origin: "https://demo.trycloudflare.com" },
			}),
		);

		expect(response.status).toBe(307);
		expect(response.headers.get("location")).toBe("https://demo.trycloudflare.com/inbox");
		expect(response.headers.getSetCookie()).toContain(SESSION_COOKIE);
		expect(auth.api.signInEmail).toHaveBeenCalledWith({
			body: {
				email: WALK_USER_EMAIL,
				password: WALK_USER_PASSWORD,
			},
			headers: expect.any(Headers),
			asResponse: true,
		});

		const signInHeaders = vi.mocked(auth.api.signInEmail).mock.calls[0]?.[0]?.headers as Headers;
		expect(signInHeaders.get("origin")).toBe("http://localhost:3010");
	});

	it("returns the Better Auth status when walk sign-in fails", async () => {
		process.env.WALK_BYPASS_AUTH = "1";
		vi.mocked(auth.api.signInEmail).mockResolvedValue(
			new Response("Unauthorized", { status: 401 }) as unknown as Awaited<
				ReturnType<typeof auth.api.signInEmail>
			>,
		);

		const response = await createWalkBypassResponse(
			new Request("http://localhost:3010/api/walk-bypass"),
		);

		expect(response.status).toBe(401);
		expect(response.headers.get("location")).toBeNull();
	});
});
