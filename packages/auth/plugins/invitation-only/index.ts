import { getInvitationById } from "@repo/database";
import type { BetterAuthPlugin } from "better-auth";
import { APIError, createAuthMiddleware } from "better-auth/api";

import { config } from "../../config";

export const invitationOnlyPlugin = () =>
	({
		id: "invitationOnlyPlugin",
		hooks: {
			before: [
				{
					matcher: (context) => !!context.path?.startsWith("/sign-up/email"),
					handler: createAuthMiddleware(async (ctx) => {
						if (config.enableSignup) {
							return;
						}

						// The invitation id travels only in the invitation email, so holding it proves
						// the mailbox. An email that merely has a pending invitation is not enough:
						// anyone could register it first and keep a way back in (red team T1).
						const email = String(ctx.body?.email ?? "")
							.trim()
							.toLowerCase();
						const invitationId = ctx.headers?.get("x-invitation-id") ?? "";
						const invitation = invitationId ? await getInvitationById(invitationId) : null;
						const valid =
							invitation !== null &&
							invitation.status === "pending" &&
							invitation.expiresAt.getTime() > Date.now() &&
							invitation.email.trim().toLowerCase() === email;

						if (!valid) {
							throw new APIError("BAD_REQUEST", {
								code: "INVALID_INVITATION",
								message: "No invitation found for this email",
							});
						}
					}),
				},
			],
			after: [
				{
					matcher: (context) => !!context.path?.startsWith("/sign-up/email"),
					handler: createAuthMiddleware(async (ctx) => {
						if (config.enableSignup) {
							return;
						}
						// The before-hook only let this sign-up through with a valid invitation id,
						// which arrives only in the invitee's mailbox: the email is proven. Better
						// Auth refuses to accept an invitation from an unverified email, and closed
						// sign-up sends no verification mail, so without this no invitee could join.
						const userId = ctx.context.newSession?.user.id;
						if (userId) {
							await ctx.context.internalAdapter.updateUser(userId, { emailVerified: true });
						}
					}),
				},
			],
		},
		$ERROR_CODES: {
			INVALID_INVITATION: {
				code: "INVALID_INVITATION",
				message: "No invitation found for this email",
			},
		},
	}) satisfies BetterAuthPlugin;
