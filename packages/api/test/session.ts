import type { Session } from "@repo/auth";

/**
 * What the mocked `auth.api.getSession` returns for a signed-in user in the procedure tests:
 * `user-1` on `session-1`, a plain `user` with no active organization. Overrides set the fields
 * a test needs to differ.
 */
export function authenticatedSession(
	overrides: { session?: Partial<Session["session"]>; user?: Partial<Session["user"]> } = {},
): Session {
	return {
		session: {
			id: "session-1",
			createdAt: new Date(),
			updatedAt: new Date(),
			userId: "user-1",
			expiresAt: new Date(Date.now() + 60_000),
			token: "session-token",
			ipAddress: null,
			userAgent: null,
			impersonatedBy: null,
			activeOrganizationId: null,
			...overrides.session,
		},
		user: {
			id: "user-1",
			name: "Test User",
			email: "test@example.com",
			emailVerified: true,
			image: null,
			createdAt: new Date(),
			updatedAt: new Date(),
			role: "user",
			banned: null,
			banReason: null,
			banExpires: null,
			onboardingComplete: true,
			locale: null,
			twoFactorEnabled: false,
			lastActiveOrganizationId: null,
			...overrides.user,
		},
	};
}
