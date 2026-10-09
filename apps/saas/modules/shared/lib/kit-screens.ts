/**
 * Kit screens Nhịp keeps but does not show yet (kit first: they stay whole for when they
 * are needed). Off means the route answers 404 and nothing links to it.
 *
 * - billing: Account settings → Billing, the plan picker and the checkout return. The kit
 *   prices per user; Nhịp's office pays per seat (ADR 0014), not built. Turn on with it.
 * - officeBilling: an office's Settings → Billing (`/<office>/settings/billing`), the kit's
 *   plans for the office. Hidden with the account's until ADR 0014's billing is built (#198;
 *   ADR 0022, 2026-10-06, #210).
 * - start: the kit's start page with sample stats. PRODUCT.md: no claimed metrics.
 * - chatbot: the kit's AI chat demo. Not in PRODUCT.md. Its oRPC `ai` router is unmounted
 *   (`packages/api/orpc/router.ts`) and `AiChat.tsx` is out of the type-check (tsconfig).
 * - docs: the user menu's Documentation link to the kit's docs site; Nhịp's own operator wiki
 *   is #238. Turn on with it.
 * - magicLink: the login page's Password / Magic link tabs and the magic-link form. Operators
 *   sign in with email and password (#94); the auth plugin stays on, only its screen is hidden.
 * - passkeyLogin: the login page's "Or continue with" and "Login with passkey". Same: the plugin
 *   and Settings' passkeys stay; the login screen offers only what operators use (#94).
 *
 * An office's own URL redirects to the Inbox instead (its kit start page shows sample
 * revenue and churn): see app/[locale]/(authenticated)/(main)/(organizations)/[organizationSlug].
 */
export const KIT_SCREENS = {
	billing: false,
	officeBilling: false,
	start: false,
	chatbot: false,
	docs: false,
	magicLink: false,
	passkeyLogin: false,
} as const;
