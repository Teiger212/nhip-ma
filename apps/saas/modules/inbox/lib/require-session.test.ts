import { beforeEach, expect, test, vi } from "vitest";

vi.mock("@repo/auth", () => ({ auth: { api: { getSession: vi.fn() } } }));
vi.mock("@repo/database", () => ({ getOrganizationMembershipsForUser: vi.fn() }));

import { auth } from "@repo/auth";
import { getOrganizationMembershipsForUser } from "@repo/database";

import { requireInboxSession } from "./require-session";

const request = new Request("http://localhost/api/conversations");

function session(activeOrganizationId: string | null) {
	return { session: { id: "s", activeOrganizationId }, user: { id: "agent-1" } } as never;
}

beforeEach(() => {
	vi.mocked(auth.api.getSession).mockReset();
	vi.mocked(getOrganizationMembershipsForUser).mockReset();
	vi.spyOn(console, "warn").mockImplementation(() => {});
});

test("no session is 401 and no membership is looked up", async () => {
	vi.mocked(auth.api.getSession).mockResolvedValue(null as never);
	const gate = await requireInboxSession(request);
	expect(gate.denied?.status).toBe(401);
	expect(getOrganizationMembershipsForUser).not.toHaveBeenCalled();
});

test("the office is the operator's one membership", async () => {
	vi.mocked(auth.api.getSession).mockResolvedValue(session(null));
	vi.mocked(getOrganizationMembershipsForUser).mockResolvedValue([
		{ organizationId: "office-a" },
	] as never);
	const gate = await requireInboxSession(request);
	expect(gate.viewer).toEqual({ userId: "agent-1", officeId: "office-a" });
	expect(getOrganizationMembershipsForUser).toHaveBeenCalledWith("agent-1");
});

test("the session's active organization is a preference, never access", async () => {
	// The audit's critical finding: a user can write this field to any organization id.
	vi.mocked(auth.api.getSession).mockResolvedValue(session("victim-office"));
	vi.mocked(getOrganizationMembershipsForUser).mockResolvedValue([
		{ organizationId: "office-a" },
	] as never);
	const gate = await requireInboxSession(request);
	expect(gate.viewer?.officeId).toBe("office-a");

	vi.mocked(getOrganizationMembershipsForUser).mockResolvedValue([] as never);
	const none = await requireInboxSession(request);
	expect(none.denied?.status).toBe(403);
	expect(await none.denied?.json()).toMatchObject({ error: "no_office" });
});

test("more than one membership is refused, not picked from", async () => {
	vi.mocked(auth.api.getSession).mockResolvedValue(session(null));
	vi.mocked(getOrganizationMembershipsForUser).mockResolvedValue([
		{ organizationId: "office-a" },
		{ organizationId: "office-b" },
	] as never);
	const gate = await requireInboxSession(request);
	expect(gate.denied?.status).toBe(403);
	expect(await gate.denied?.json()).toMatchObject({ error: "ambiguous_office" });
	expect(gate.viewer).toBeUndefined();
});
