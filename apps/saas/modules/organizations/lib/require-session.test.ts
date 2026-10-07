import { beforeEach, expect, test, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@auth/lib/server", () => ({ getSession: vi.fn() }));
vi.mock("@i18n/routing", () => ({ localeRedirect: vi.fn() }));
vi.mock("next-intl/server", () => ({ getLocale: vi.fn() }));

import { getSession } from "@auth/lib/server";
import { localeRedirect } from "@i18n/routing";
import { getLocale } from "next-intl/server";

import { requireSession } from "./require-session";

/** Next's redirect throws, so nothing after it runs; the stand-in does the same. */
class Redirected extends Error {}

beforeEach(() => {
	vi.mocked(getSession).mockReset();
	vi.mocked(getLocale).mockReset().mockResolvedValue("vi");
	vi.mocked(localeRedirect)
		.mockReset()
		.mockImplementation(() => {
			throw new Redirected();
		});
});

test("without a session it sends the visitor to login in their language, and returns nothing", async () => {
	vi.mocked(getSession).mockResolvedValue(null);

	await expect(requireSession()).rejects.toBeInstanceOf(Redirected);
	expect(localeRedirect).toHaveBeenCalledExactlyOnceWith({ href: "/login", locale: "vi" });
});

test("with a session it hands the session back and sends nobody anywhere", async () => {
	const session = { session: { id: "s" }, user: { id: "agent-1" } };
	vi.mocked(getSession).mockResolvedValue(session as never);

	await expect(requireSession()).resolves.toBe(session);
	expect(localeRedirect).not.toHaveBeenCalled();
});
