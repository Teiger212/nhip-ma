/**
 * Kit screens Nhịp keeps but does not show yet (kit first: they stay whole for when they
 * are needed). Off means the route answers 404 and nothing links to it.
 *
 * - billing: Account settings → Billing, the plan picker and the checkout return. The kit
 *   prices per user; Nhịp's office pays per seat (ADR 0014), not built. Turn on with it.
 * - start: the kit's start page with sample stats. PRODUCT.md: no claimed metrics.
 * - chatbot: the kit's AI chat demo. Not in PRODUCT.md.
 *
 * An office's own URL redirects to the Inbox instead (its kit start page shows sample
 * revenue and churn): see app/[locale]/(authenticated)/(main)/(organizations)/[organizationSlug].
 */
export const KIT_SCREENS = {
	billing: false,
	start: false,
	chatbot: false,
} as const;
