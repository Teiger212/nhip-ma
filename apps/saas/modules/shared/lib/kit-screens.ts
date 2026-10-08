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
 * - chatbot: the kit's AI chat demo. Not in PRODUCT.md.
 * - docs: the user menu's Documentation link to the kit's docs site; Nhịp's own operator wiki
 *   is #238. Turn on with it.
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
} as const;
