import { isOrganizationAdmin, isOrganizationOwner } from "@repo/auth/lib/helper";
import { grantsOwner } from "@repo/auth/lib/roles";
import { checkPermission } from "@repo/permissions";
import { describe, expect, it } from "vitest";

const organization = {
	id: "org-1",
	members: [
		{ userId: "owner-user", role: "owner" },
		{ userId: "admin-user", role: "admin" },
		{ userId: "member-user", role: "member" },
	],
} as Parameters<typeof isOrganizationOwner>[0];

function membershipRoleFor(userId: string) {
	return organization?.members.find((member) => member.userId === userId)?.role;
}

describe("organization permission checks", () => {
	it("allows owners to manage and delete the organization", () => {
		const membershipRole = membershipRoleFor("owner-user");

		expect(checkPermission({ membershipRole }, "organization.manage")).toBe(true);
		expect(checkPermission({ membershipRole }, "organization.delete")).toBe(true);
		expect(isOrganizationOwner(organization, { id: "owner-user" })).toBe(true);
		expect(isOrganizationAdmin(organization, { id: "owner-user" })).toBe(true);
	});

	it("allows organization admins to manage but not delete", () => {
		const membershipRole = membershipRoleFor("admin-user");

		expect(checkPermission({ membershipRole }, "organization.manage")).toBe(true);
		expect(checkPermission({ membershipRole }, "organization.delete")).toBe(false);
		expect(isOrganizationOwner(organization, { id: "admin-user" })).toBe(false);
		expect(isOrganizationAdmin(organization, { id: "admin-user" })).toBe(true);
	});

	it("rejects regular members for manage and delete", () => {
		const membershipRole = membershipRoleFor("member-user");

		expect(checkPermission({ membershipRole }, "organization.manage")).toBe(false);
		expect(checkPermission({ membershipRole }, "organization.delete")).toBe(false);
		expect(isOrganizationOwner(organization, { id: "member-user" })).toBe(false);
		expect(isOrganizationAdmin(organization, { id: "member-user" })).toBe(false);
	});

	it("escalates global admins for manage but not delete", () => {
		const user = { id: "outside-admin", role: "admin" };

		expect(
			checkPermission(
				{
					user,
					membershipRole: null,
				},
				"organization.manage",
			),
		).toBe(true);
		expect(
			checkPermission(
				{
					user,
					membershipRole: null,
				},
				"organization.delete",
			),
		).toBe(false);
		expect(isOrganizationOwner(organization, user)).toBe(false);
		expect(isOrganizationAdmin(organization, user)).toBe(true);
	});
});

describe("grantsOwner (#82: only the platform admin makes an office's owner)", () => {
	it("finds owner in a role, a comma list or an array", () => {
		expect(grantsOwner("owner")).toBe(true);
		expect(grantsOwner("member, owner")).toBe(true);
		expect(grantsOwner(["admin", "owner"])).toBe(true);
	});

	it("passes Agent and Manager, and anything that is not a role", () => {
		expect(grantsOwner("member")).toBe(false);
		expect(grantsOwner("admin,member")).toBe(false);
		expect(grantsOwner(["admin"])).toBe(false);
		expect(grantsOwner("owners")).toBe(false);
		expect(grantsOwner(undefined)).toBe(false);
		expect(grantsOwner(42)).toBe(false);
	});
});
