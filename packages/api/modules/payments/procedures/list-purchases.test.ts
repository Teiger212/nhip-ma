import { call } from "@orpc/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@repo/auth", () => ({
	auth: {
		api: {
			getSession: vi.fn(),
		},
	},
}));

vi.mock("@repo/database", async () => {
	const { z } = await import("zod");

	return {
		PurchaseSchema: z.object({}),
		getOrganizationMembership: vi.fn(),
		getPurchasesByOrganizationId: vi.fn(),
		getPurchasesByUserId: vi.fn(),
	};
});

import { auth } from "@repo/auth";
import {
	getOrganizationMembership,
	getPurchasesByOrganizationId,
	getPurchasesByUserId,
} from "@repo/database";

import { authenticatedSession } from "../../../test/session";
import { listPurchases } from "./list-purchases";

const organizationMembership = {
	id: "membership-1",
	organizationId: "organization-1",
	userId: "user-1",
	role: "member",
	createdAt: new Date(),
	organization: {
		id: "organization-1",
		name: "Test Organization",
		slug: "test-organization",
		logo: null,
		createdAt: new Date(),
		metadata: null,
		paymentsCustomerId: null,
	},
} satisfies NonNullable<Awaited<ReturnType<typeof getOrganizationMembership>>>;

describe("listPurchases", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.mocked(auth.api.getSession).mockResolvedValue(authenticatedSession());
	});

	it("rejects access to purchases for an organization the user does not belong to", async () => {
		vi.mocked(getOrganizationMembership).mockResolvedValueOnce(null);

		await expect(
			call(
				listPurchases,
				{ organizationId: "organization-2" },
				{ context: { headers: new Headers() } },
			),
		).rejects.toMatchObject({ code: "FORBIDDEN" });

		expect(getPurchasesByOrganizationId).not.toHaveBeenCalled();
	});

	it("allows organization members to list their organization's purchases", async () => {
		vi.mocked(getOrganizationMembership).mockResolvedValueOnce(organizationMembership);
		vi.mocked(getPurchasesByOrganizationId).mockResolvedValueOnce([]);

		const result = await call(
			listPurchases,
			{ organizationId: "organization-1" },
			{ context: { headers: new Headers() } },
		);

		expect(result).toEqual([]);
		expect(getPurchasesByOrganizationId).toHaveBeenCalledWith("organization-1");
	});

	it("scopes personal purchases to the authenticated user", async () => {
		vi.mocked(getPurchasesByUserId).mockResolvedValueOnce([]);

		const result = await call(listPurchases, {}, { context: { headers: new Headers() } });

		expect(result).toEqual([]);
		expect(getPurchasesByUserId).toHaveBeenCalledWith("user-1");
		expect(getOrganizationMembership).not.toHaveBeenCalled();
	});
});
