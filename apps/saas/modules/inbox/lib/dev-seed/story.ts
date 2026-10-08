import type { GuestDeletionReason, Pipe } from "../types";

/**
 * The rich dev and demo seed's vocabulary (#69). Each invented guest has a story: what they
 * wrote, who the manager gave them to, who answered, what the CRM said. The seed plays it
 * through the app's own calls, each step at its own time (`clock.ts`). Nothing here is a real
 * guest: every name, number and message is invented.
 */

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** How long before the seed runs a step happened. */
export const minutesAgo = (n: number) => n * MINUTE;
export const hoursAgo = (n: number) => n * HOUR;
export const daysAgo = (n: number) => n * DAY;

/** An operator of the office, by role: its two agents and its manager. */
export type Actor = "agent" | "agent2" | "manager";

/**
 * The message in each operator language (ADR 0007). The seed writes the ones the app would
 * translate (`needsTranslation`): never into the message's own language, so an English message
 * carries only `vi`; and none for a guest whose language Nhịp doesn't support (#245): French or
 * Chinese carry none.
 */
export type Translations = { en?: string; vi?: string };

export type StoryStep = { ago: number } & (
	| { kind: "writes"; text: string; translations: Translations }
	| { kind: "assigns"; to: Actor | null }
	| { kind: "replies"; by: Actor; text: string }
	| { kind: "crm"; outcome: "won" | "lost"; reason: string | null }
);

/** The guest writes (a guest message through the inbound path). */
export const writes = (ago: number, text: string, translations: Translations): StoryStep => ({
	kind: "writes",
	ago,
	text,
	translations,
});

/** The office's manager gives the thread to an operator, or back to Unassigned (ADR 0022). */
export const assigns = (ago: number, to: Actor | null): StoryStep => ({ kind: "assigns", ago, to });

/** An operator approves and sends a reply to the guest's latest message (ADR 0011). */
export const replies = (ago: number, by: Actor, text: string): StoryStep => ({
	kind: "replies",
	ago,
	by,
	text,
});

/** The office's CRM marks the guest's lead won or lost, and Nhịp hears of it (ADR 0003). */
export const crmMarks = (
	ago: number,
	outcome: "won" | "lost",
	reason: string | null = null,
): StoryStep => ({ kind: "crm", ago, outcome, reason });

export type SeedGuest = {
	pipe: Pipe;
	/**
	 * WhatsApp: the guest's number as its `wa_id`, from the 555-0100 to 555-0199 range North
	 * America keeps for fiction, so it reaches no one and still parses (the CRM matches on it).
	 * Zalo: an invented user id.
	 */
	guestId: string;
	name: string | null;
	story: StoryStep[];
	/** The office's auto-reply greets the guest's first message, seconds after it (ADR 0021). */
	greeted?: true;
	/** The mock CRM is down when the guest first writes: "Not in CRM yet" (#211). */
	crmDown?: true;
	/**
	 * After the story, the office's manager deletes the guest for this reason (ADR 0020), with
	 * `SEED_DELETION_NOTE`. Only a receipt and a lead tally stay.
	 */
	deleted?: GuestDeletionReason;
};

/** A lead already in the office's mock CRM before any guest wrote (ADR 0003). */
export type SeedCrmLead = {
	name: string;
	pipe: Pipe;
	/** E.164. */
	phone?: string;
	zaloUserId?: string;
};

export type SeedOffice = {
	officeId: string;
	/** The emails of the office's operators, by role. */
	operators: Record<Actor, string>;
	/** Whether the office's CRM is the mock CRM (ADR 0003); an office without one has no CRM. */
	mockCrm: boolean;
	/** Whether the office's auto-reply is on (ADR 0021). Never turned on by the seed (S1). */
	autoReply: boolean;
	crmLeads: SeedCrmLead[];
	guests: SeedGuest[];
};

/**
 * The note on the seed's deletion receipt: how a re-run knows the deletion is done, and how
 * `--reset` finds the receipt. It names no one, so masking leaves it as it is.
 */
export const SEED_DELETION_NOTE =
	"Demo data: the guest asked on WhatsApp to have their data deleted.";
