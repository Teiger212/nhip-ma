/**
 * The CRM seam's decisions, as pure rules (spec #59, "Where the rules live"). The sync module
 * calls them; the store only persists what they decide.
 */

import type { CrmLinkMethod, CrmOutcome } from "../types";
import type { CrmLead, GuestIdentity, LeadOutcome } from "./types";

export type LeadDecision =
	| { action: "reuse"; lead: CrmLead; method: Exclude<CrmLinkMethod, "created"> }
	| { action: "create"; method: "created" }
	| { action: "ambiguous" };

/**
 * What to do with a guest, given the CRM leads that match them (Q11, Q13): reuse the one lead,
 * found by the guest's phone or Zalo id; create one when there is none; with more than one,
 * neither: Nhịp never guesses which lead is meant, nor adds another copy of the person. A
 * manager links it by hand. Open deals join this rule with HubSpot (#65).
 */
export function decideLead(matches: CrmLead[], identity: GuestIdentity): LeadDecision {
	if (matches.length === 0) return { action: "create", method: "created" };
	if (matches.length > 1) return { action: "ambiguous" };
	return { action: "reuse", lead: matches[0], method: identity.phone ? "phone" : "zaloId" };
}

/**
 * What Nhịp caches after the CRM reports a lead's outcome (ADR 0003, Q3). A won or lost outcome
 * is observed when Nhịp first sees it: seen again, it keeps that time; a different decision is a
 * new observation; an open lead has none. The CRM's own date is kept for display only.
 */
export function observeOutcome(
	previous: CrmOutcome | null,
	reported: LeadOutcome,
	now: Date,
): CrmOutcome {
	const decided = reported.status === "won" || reported.status === "lost";
	const sameDecision = decided && previous?.outcome === reported.status;
	return {
		outcome: reported.status,
		outcomeAt: reported.at,
		outcomeReason: reported.reason,
		outcomeObservedAt: !decided
			? null
			: sameDecision
				? (previous?.outcomeObservedAt ?? now.toISOString())
				: now.toISOString(),
	};
}
