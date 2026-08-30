"use client";

import {
	createPermissionRules,
	type CreatePermissionRulesParams,
	type PermissionsDefinition,
} from "@repo/permissions";
import type { DehydratedState } from "permix";
import { createPermix } from "permix";
import { PermixHydrate, PermixProvider as ReactPermixProvider, usePermix } from "permix/react";
import { type ReactNode, useEffect } from "react";

/**
 * Browser-tab singleton (permix/react). Same PermissionsDefinition as the
 * server instance from permix/next — never share the server helper across the
 * RSC boundary; only dehydrate()/PermixHydrate state.
 */
export const clientPermix = createPermix<PermissionsDefinition>();

export function PermixProvider({
	state,
	children,
}: {
	state: DehydratedState<PermissionsDefinition>;
	children: ReactNode;
}) {
	return (
		<ReactPermixProvider permix={clientPermix}>
			<PermixHydrate state={state}>{children}</PermixHydrate>
		</ReactPermixProvider>
	);
}

/**
 * Hydrate restores boolean checks but does not set isReady. Call setup() on
 * the client with the same rule shape whenever the user or membership changes.
 */
export function useSetupClientPermissions({
	user,
	membershipRole = null,
}: CreatePermissionRulesParams) {
	const userRole = user?.role ?? null;

	useEffect(() => {
		clientPermix.setup(
			createPermissionRules({
				user,
				membershipRole,
			}),
		);
	}, [user, userRole, membershipRole]);
}

/** Active-organization checks. For a specific organizationId, use checkPermission. */
export function usePermissions() {
	return usePermix(clientPermix);
}
