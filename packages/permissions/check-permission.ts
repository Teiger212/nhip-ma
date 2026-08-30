import { createPermissionRules, type CreatePermissionRulesParams } from "./create-permission-rules";

export type PermissionPath =
	| "admin.access"
	| "organization.read"
	| "organization.manage"
	| "organization.delete"
	| "organization.manageBilling"
	| "organization.accessBillingPortal";

/**
 * Evaluate a single permission against rules derived from the user + membership role.
 * Useful outside of a live Permix context (helpers, procedure handlers with a specific org).
 * Reads the boolean matrix directly — no Permix instance is created per call.
 */
export function checkPermission(
	params: CreatePermissionRulesParams,
	path: PermissionPath,
): boolean {
	const rules = createPermissionRules(params);

	switch (path) {
		case "admin.access":
			return rules.admin.access;
		case "organization.read":
			return rules.organization.read;
		case "organization.manage":
			return rules.organization.manage;
		case "organization.delete":
			return rules.organization.delete;
		case "organization.manageBilling":
			return rules.organization.manageBilling;
		case "organization.accessBillingPortal":
			return rules.organization.accessBillingPortal;
	}
}
