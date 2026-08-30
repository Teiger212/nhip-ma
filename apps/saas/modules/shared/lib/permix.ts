import "server-only";
import {
	createPermissionRules,
	type CreatePermissionRulesParams,
	type PermissionsDefinition,
} from "@repo/permissions";
import { createPermix } from "permix/next";

/**
 * Per-request Permix instance (React cache()). Setup once early in the
 * authenticated layout; nested setup() replaces rules for the rest of that
 * request only — keep membership when re-setting for a specific organization.
 */
export const permix = createPermix<PermissionsDefinition>();

export function setupPermissions(params: CreatePermissionRulesParams) {
	permix.setup(createPermissionRules(params));
}
