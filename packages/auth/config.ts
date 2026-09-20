import type { AuthConfig } from "./types";

export const config = {
	// Invitation only (ADR 0010): an account exists because Nhịp invited it into an office.
	enableSignup: false,
	enableMagicLink: true,
	enableSocialLogin: true,
	enablePasskeys: true,
	enablePasswordLogin: true,
	enableTwoFactor: true,
	sessionCookieMaxAge: 60 * 60 * 24 * 30,
	users: {
		enableOnboarding: true,
	},
	organizations: {
		enable: true,
		// The organization is the office (ADR 0008). Nhịp creates it in the admin area and
		// invites agents; operators never create or pick one (ADR 0010). The switcher stays
		// hidden because one operator belongs to exactly one office.
		hideOrganization: true,
		enableUsersToCreateOrganizations: false,
		requireOrganization: false,
		forbiddenOrganizationSlugs: [
			"new-organization",
			"admin",
			"settings",
			"ai-demo",
			"organization-invitation",
			"chatbot",
			"inbox",
			"start",
		],
	},
} as const satisfies AuthConfig;
