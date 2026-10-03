/**
 * The CRM seam's decisions, as pure rules (spec #59, "Where the rules live"). The sync module
 * calls them; the store only persists what they decide.
 */

import type { CrmLinkMethod } from "../types";
import type { CrmLead, GuestIdentity } from "./types";

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
