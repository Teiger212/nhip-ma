import { ORPCError, os } from "@orpc/server";
import { auth } from "@repo/auth";
import { createPermissionRules } from "@repo/permissions";

import { permix } from "./permix";

export const publicProcedure = os.$context<{
	headers: Headers;
}>();

export const protectedProcedure = publicProcedure.use(async ({ context, next }) => {
	const session = await auth.api.getSession({
		headers: context.headers,
	});

	if (!session) {
		throw new ORPCError("UNAUTHORIZED");
	}

	// Setup with the user only. Org-scoped checks resolve membership for the
	// target organizationId via checkPermission / membership helpers — not the
	// session active org (which is often a different org than the procedure input).
	return await next({
		context: {
			session: session.session,
			user: session.user,
			...permix.setupContext(
				createPermissionRules({
					user: session.user,
				}),
			),
		},
	});
});

export const adminProcedure = protectedProcedure.use(permix.checkMiddleware("admin.access"));
