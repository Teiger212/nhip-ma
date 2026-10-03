/**
 * The CRM seam's decisions, as pure rules (spec #59, "Where the rules live"). The sync module
 * calls them; the store only persists what they decide.
 */

export type LeadDecision<Lead> =
	| { action: "reuse"; lead: Lead }
	| { action: "create" }
	| { action: "ambiguous" };

/**
 * What to do with a new guest, given the CRM's leads that match them (Q11, Q13): reuse the one
 * lead, create one when there is none, and with more than one, neither: Nhịp never guesses
 * which lead is meant, nor adds another copy of the person. A manager links it by hand.
 */
export function decideLead<Lead>(matches: Lead[]): LeadDecision<Lead> {
	if (matches.length === 1) return { action: "reuse", lead: matches[0] };
	return matches.length === 0 ? { action: "create" } : { action: "ambiguous" };
}
