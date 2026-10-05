import { passkey } from "@better-auth/passkey";
import {
	db,
	getInvitationById,
	getOrganizationMembershipsForUser,
	getPurchasesByOrganizationId,
	getPurchasesByUserId,
	getUserByEmail,
	getUserById,
	keepOldestMembership,
} from "@repo/database";
import { config as i18nConfig, type Locale } from "@repo/i18n";
import { logger } from "@repo/logs";
import { sendEmail } from "@repo/mail";
import { createWelcomeNotification } from "@repo/notifications";
import { cancelSubscription } from "@repo/payments";
import { getBaseUrl } from "@repo/utils";
import { betterAuth, type BetterAuthOptions } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { APIError, createAuthMiddleware, getSessionFromCtx } from "better-auth/api";
import { openAPI } from "better-auth/plugins";
import { admin } from "better-auth/plugins/admin";
import { magicLink } from "better-auth/plugins/magic-link";
import { organization } from "better-auth/plugins/organization";
import { twoFactor } from "better-auth/plugins/two-factor";
import { parseCookie as parseCookies } from "cookie";

import { config } from "./config";
import { officeEndHooks } from "./lib/offboarding";
import { updateSeatsInOrganizationSubscription } from "./lib/organization";
import { grantsOwner, isPlatformAdmin } from "./lib/roles";
import { invitationOnlyPlugin } from "./plugins/invitation-only";

const getLocaleFromRequest = (request?: Request) => {
	const cookies = parseCookies(request?.headers.get("cookie") ?? "");
	return (cookies[i18nConfig.localeCookieName] as Locale) ?? i18nConfig.defaultLocale;
};

const appUrl = getBaseUrl(process.env.NEXT_PUBLIC_SAAS_URL, 3000);

/**
 * Extra origins allowed to call the auth API, comma-separated (for example a
 * Cloudflare quick-tunnel origin during a demo). Exact origins or Better Auth
 * wildcards such as `https://*.trycloudflare.com`. Never set in production.
 */
const extraTrustedOrigins = (process.env.AUTH_TRUSTED_ORIGINS ?? "")
	.split(",")
	.map((origin) => origin.trim())
	.filter(Boolean);

/** A provider is only offered when both halves of its credential are configured. */
function socialProvider<T extends object>(
	clientId: string | undefined,
	clientSecret: string | undefined,
	provider: (credentials: { clientId: string; clientSecret: string }) => T,
): T | undefined {
	return clientId && clientSecret ? provider({ clientId, clientSecret }) : undefined;
}

const google = socialProvider(
	process.env.GOOGLE_CLIENT_ID,
	process.env.GOOGLE_CLIENT_SECRET,
	// Sign-in only: accounts come from invitations (ADR 0010), never from a provider.
	(credentials) => ({ ...credentials, scope: ["email", "profile"], disableImplicitSignUp: true }),
);
const github = socialProvider(
	process.env.GITHUB_CLIENT_ID,
	process.env.GITHUB_CLIENT_SECRET,
	(credentials) => ({ ...credentials, scope: ["user:email"], disableImplicitSignUp: true }),
);

/** Cancel the subscriptions among these purchases (the kit's rule, on every delete path). */
async function cancelSubscriptions(purchases: Awaited<ReturnType<typeof getPurchasesByUserId>>) {
	for (const purchase of purchases) {
		if (purchase.type === "SUBSCRIPTION" && purchase.subscriptionId !== null) {
			await cancelSubscription(purchase.subscriptionId);
		}
	}
}

const officeEnd = officeEndHooks({
	// The path the admin's "Remove user" takes, so `databaseHooks.user.delete` runs.
	deleteAccount: async (userId) => {
		const { internalAdapter } = await auth.$context;
		await internalAdapter.deleteUserSessions(userId);
		await internalAdapter.deleteUser(userId);
	},
});

/**
 * The app's auth configuration. `auth` below is built from it; the E2E suite builds a
 * test-only instance from the same options plus Better Auth's testUtils
 * (apps/saas/tests/support/test-auth.ts), so its sessions are the app's own.
 */
export const authOptions = {
	// Explicit baseURL wins over BETTER_AUTH_URL; startup validation checks the two agree.
	baseURL: appUrl,
	trustedOrigins: [appUrl, ...extraTrustedOrigins],
	// Rate limiting is on in production (100/10s per IP and path; sign-in 3/10s). Counters
	// live in the database (the rateLimit table): on Vercel each serverless instance has its
	// own memory, so an in-memory count would not hold. The client IP comes from
	// x-forwarded-for, which Vercel sets.
	rateLimit: { storage: "database" },
	database: prismaAdapter(db, {
		provider: "postgresql",
	}),
	advanced: {
		database: {
			generateId: false,
		},
	},
	session: {
		expiresIn: config.sessionCookieMaxAge,
	},
	databaseHooks: {
		session: {
			create: {
				before: async (session) => {
					const user = await getUserById(session.userId);
					return {
						data: {
							...session,
							activeOrganizationId: user?.lastActiveOrganizationId ?? null,
						},
					};
				},
			},
		},
		user: {
			delete: {
				// Every path that deletes an account (self, admin, ADR 0013) cancels its billing.
				before: async (user) => {
					await cancelSubscriptions(await getPurchasesByUserId(user.id));
				},
			},
			create: {
				after: async (createdUser) => {
					if (!createdUser?.id) {
						return;
					}
					try {
						await createWelcomeNotification(createdUser.id);
					} catch (error) {
						logger.error(error, {
							ctx: "createWelcomeNotification",
							userId: createdUser.id,
						});
					}
				},
			},
		},
	},
	account: {
		accountLinking: {
			enabled: true,
			trustedProviders: ["google", "github"],
		},
	},
	hooks: {
		after: createAuthMiddleware(async (ctx) => {
			if (ctx.path.startsWith("/organization/accept-invitation")) {
				const { invitationId } = ctx.body;

				if (!invitationId) {
					return;
				}

				const invitation = await getInvitationById(invitationId);

				if (!invitation) {
					return;
				}

				await updateSeatsInOrganizationSubscription(invitation.organizationId);
			} else if (ctx.path.startsWith("/organization/remove-member")) {
				const { organizationId } = ctx.body;

				if (!organizationId) {
					return;
				}

				await updateSeatsInOrganizationSubscription(organizationId);
			} else if (ctx.path.startsWith("/organization/leave")) {
				// The kit's leave route fires no organization hook; it returns the member that
				// left, or an error when the leave was refused.
				const left = ctx.context.returned;
				if (
					left &&
					typeof left === "object" &&
					"userId" in left &&
					typeof left.userId === "string"
				) {
					await officeEnd.afterLeave(left.userId);
				}
			}
		}),
		before: createAuthMiddleware(async (ctx) => {
			// A manager grants Agent or Manager, never the kit's `owner` (#82): only the platform
			// admin makes an office's owner. Better Auth refuses `owner` to a kit `admin` already;
			// this also refuses it to a manager who holds `owner`.
			if (
				(ctx.path.startsWith("/organization/invite-member") ||
					ctx.path.startsWith("/organization/update-member-role")) &&
				grantsOwner(ctx.body?.role)
			) {
				const session = await getSessionFromCtx(ctx);
				if (session && !isPlatformAdmin(session.user.role)) {
					throw new APIError("FORBIDDEN", {
						code: "OWNER_NOT_GRANTABLE",
						message: "Only Nhịp makes an office's owner.",
					});
				}
			}
			// One operator, one office (ADR 0010): an account already in an office cannot
			// accept an invitation into another. The gate would refuse it as ambiguous anyway;
			// refusing here keeps the membership table true.
			if (ctx.path.startsWith("/organization/accept-invitation")) {
				// Before-hooks run ahead of the endpoint's session middleware, so
				// `ctx.context.session` is empty here; read it from the request.
				const userId = (await getSessionFromCtx(ctx))?.session.userId;
				if (userId) {
					const memberships = await getOrganizationMembershipsForUser(userId);
					if (memberships.length > 0) {
						throw new APIError("FORBIDDEN", {
							code: "ONE_OFFICE_PER_OPERATOR",
							message: "This account already belongs to an office.",
						});
					}
				}
			}
		}),
	},
	user: {
		additionalFields: {
			onboardingComplete: {
				type: "boolean",
				required: false,
			},
			locale: {
				type: "string",
				required: false,
			},
			lastActiveOrganizationId: {
				type: "string",
				required: false,
			},
		},
		deleteUser: {
			enabled: true,
		},
		changeEmail: {
			enabled: true,
			sendChangeEmailConfirmation: async ({ user: { email, name }, url }, request) => {
				const locale = getLocaleFromRequest(request);
				await sendEmail({
					to: email,
					templateId: "emailVerification",
					context: {
						url,
						name,
					},
					locale,
				});
			},
		},
	},
	emailAndPassword: {
		enabled: true,
		// If signup is disabled, the only way to sign up is via an invitation. So in this case we can auto sign in the user, as the email is already verified by the invitation.
		// If signup is enabled, we can't auto sign in the user, as the email is not verified yet.
		autoSignIn: !config.enableSignup,
		requireEmailVerification: config.enableSignup,
		sendResetPassword: async ({ user, url }, request) => {
			const locale = getLocaleFromRequest(request);
			await sendEmail({
				to: user.email,
				templateId: "forgotPassword",
				context: {
					url,
					name: user.name,
				},
				locale,
			});
		},
		minPasswordLength: 8,
	},
	emailVerification: {
		sendOnSignUp: config.enableSignup,
		autoSignInAfterVerification: true,
		sendVerificationEmail: async ({ user: { email, name }, url }, request) => {
			const locale = getLocaleFromRequest(request);
			await sendEmail({
				to: email,
				templateId: "emailVerification",
				context: {
					url,
					name,
				},
				locale,
			});
		},
	},
	socialProviders: {
		...(google ? { google } : {}),
		...(github ? { github } : {}),
	},
	plugins: [
		admin(),
		passkey(),
		magicLink({
			// Sign-in only: a magic link to an unknown email creates nothing (ADR 0010).
			disableSignUp: true,
			sendMagicLink: async ({ email, url }, ctx) => {
				const request = ctx?.request as Request;

				const locale = getLocaleFromRequest(request);
				await sendEmail({
					to: email,
					templateId: "magicLink",
					context: {
						url,
					},
					locale,
				});
			},
		}),
		organization({
			// Offices are created by the platform admin only (ADR 0010); the kit's
			// `enableUsersToCreateOrganizations` flag never reached Better Auth.
			allowUserToCreateOrganization: (user) => isPlatformAdmin(user.role),
			organizationHooks: {
				// Runs after Better Auth checked the caller's membership and delete permission.
				beforeDeleteOrganization: async (data) => {
					await cancelSubscriptions(await getPurchasesByOrganizationId(data.organization.id));
					await officeEnd.beforeDeleteOrganization(data);
				},
				// One operator, one office, even when two invitations are accepted at once.
				afterAcceptInvitation: async ({ member, user }) => {
					const dropped = await keepOldestMembership(user.id);
					// A simultaneous accept may already have dropped this (newer) membership, in
					// which case `dropped` is empty here; check that this one actually survived.
					const kept =
						!dropped.includes(member.id) &&
						(await db.member.count({ where: { id: member.id } })) > 0;
					if (!kept) {
						throw new APIError("FORBIDDEN", {
							code: "ONE_OFFICE_PER_OPERATOR",
							message: "This account already belongs to an office.",
						});
					}
				},
				afterDeleteOrganization: officeEnd.afterDeleteOrganization,
				afterRemoveMember: officeEnd.afterRemoveMember,
			},
			sendInvitationEmail: async ({ email, id, organization }, request) => {
				const locale = getLocaleFromRequest(request);
				const existingUser = await getUserByEmail(email);

				const url = new URL(
					existingUser ? "/login" : "/signup",
					getBaseUrl(process.env.NEXT_PUBLIC_SAAS_URL, 3000),
				);

				url.searchParams.set("invitationId", id);
				url.searchParams.set("email", email);

				await sendEmail({
					to: email,
					templateId: "organizationInvitation",
					locale,
					context: {
						organizationName: organization.name,
						url: url.toString(),
					},
				});
			},
		}),
		openAPI(),
		invitationOnlyPlugin(),
		twoFactor(),
	],
	onAPIError: {
		onError(error, ctx) {
			logger.error(error, { ctx });
		},
	},
} satisfies BetterAuthOptions;

export const auth = betterAuth(authOptions);

export * from "./lib/organization";

export type Session = typeof auth.$Infer.Session;

export type ActiveOrganization = NonNullable<
	Awaited<ReturnType<typeof auth.api.getFullOrganization>>
>;

export type Organization = typeof auth.$Infer.Organization;

export type OrganizationMemberRole = ActiveOrganization["members"][number]["role"];

export type OrganizationInvitationStatus = typeof auth.$Infer.Invitation.status;

export type OrganizationMetadata = Record<string, unknown> | undefined;
