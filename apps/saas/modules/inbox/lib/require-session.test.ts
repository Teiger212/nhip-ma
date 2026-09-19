import { beforeEach, expect, test, vi } from "vitest";

vi.mock("@repo/auth", () => ({ auth: { api: { getSession: vi.fn() } } }));
vi.mock("@repo/database", () => ({ getFirstOrganizationMembershipForUser: vi.fn() }));

import { auth } from "@repo/auth";
import { getFirstOrganizationMembershipForUser } from "@repo/database";

import { requireInboxSession } from "./require-session";

const request = new Request("http://localhost/api/conversations");

beforeEach(() => {
	vi.mocked(auth.api.getSession).mockReset();
	vi.mocked(getFirstOrganizationMembershipForUser).mockReset();
});

test("no session is 401", async () => {
	vi.mocked(auth.api.getSession).mockResolvedValue(null as never);
	const gate = await requireInboxSession(request);
	expect(gate.denied?.status).toBe(401);
	expect(getFirstOrganizationMembershipForUser).not.toHaveBeenCalled();
});

test("the session's active organization is the office", async () => {
	vi.mocked(auth.api.getSession).mockResolvedValue({
		session: { id: "s", activeOrganizationId: "office-a" },
		user: { id: "agent-1" },
	} as never);
	const gate = await requireInboxSession(request);
	expect(gate.viewer).toEqual({ userId: "agent-1", officeId: "office-a" });
	expect(getFirstOrganizationMembershipForUser).not.toHaveBeenCalled();
});

test("without an active organization, the first membership is the office", async () => {
	vi.mocked(auth.api.getSession).mockResolvedValue({
		session: { id: "s", activeOrganizationId: null },
		user: { id: "agent-1" },
	} as never);
	vi.mocked(getFirstOrganizationMembershipForUser).mockResolvedValue({
		organizationId: "office-b",
	} as never);
	const gate = await requireInboxSession(request);
	expect(gate.viewer).toEqual({ userId: "agent-1", officeId: "office-b" });
	expect(getFirstOrganizationMembershipForUser).toHaveBeenCalledWith("agent-1");
});

test("an operator in no office is 403, never a viewer of everything", async () => {
	vi.mocked(auth.api.getSession).mockResolvedValue({
		session: { id: "s", activeOrganizationId: null },
		user: { id: "agent-1" },
	} as never);
	vi.mocked(getFirstOrganizationMembershipForUser).mockResolvedValue(null as never);
	const gate = await requireInboxSession(request);
	expect(gate.denied?.status).toBe(403);
	expect(await gate.denied?.json()).toMatchObject({ error: "no_office" });
	expect(gate.viewer).toBeUndefined();
});
