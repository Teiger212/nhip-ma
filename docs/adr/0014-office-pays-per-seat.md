# 0014. The office pays per seat; a lapsed office is locked, a closing one is purged after 30 days

Date: 2026-09-24. Status: accepted. Extends ADRs 0008 and 0013.

## Context

The kit bills the user (`billingAttachedTo: "user"`), but CONTEXT names the manager, meaning
the office, as the customer. Billing on the user would make an agent the payer. ADR 0013
could then delete a subscription along with the agent's account. Nothing says what happens
when an office stops paying or asks to be deleted. The kit's plan redirect sits on its
`[organizationSlug]` routes, and Nhịp's Inbox and Home do not live there.

## Decision

- **The office pays, per seat.** `billingAttachedTo: "organization"` with seat-based
  prices. A seat is one operator in the office. The platform admin is not a seat, even
  while owning an office. The price and trial stay in `packages/payments/config.ts`. The
  kit already changes the seat count when an invitation is accepted or a member is
  removed.
- **A lapsed office is locked and keeps receiving.** When the paid period ends without
  renewal, Nhịp's gate refuses Inbox, Home and sends (`403 office_lapsed`) and shows a
  "subscription ended" screen with the way back. Guest messages keep landing and are
  stored under the office, so nothing a guest wrote is lost. Paying again unlocks
  everything as it was. No account ends: a lapse ends no membership (ADR 0013).
- **Closing an office takes 30 days.** A firm that asks to be deleted is marked closing.
  Billing is cancelled and every operator is locked out that day. A platform admin can
  restore it within 30 days. After that the office is purged: its threads (ADR 0012) and
  its operators' accounts (ADR 0013). The kit's immediate delete stays, but only for the
  purge and for offices that never went live.

## Considered options

- **Flat price per office.** It is simpler, but a two-agent office pays what a twenty-agent
  agency pays, and the kit's seat plumbing goes unused.
- **Read-only when lapsed.** The product would keep delivering its value (the queue and the
  numbers) without payment.
- **Stop receiving when lapsed.** Guests who write during the lapse would be lost for good.
  That hurts the agency's clients, not just the agency.
- **Immediate deletion.** One mistaken click, or one angry owner, would destroy an office's
  whole history.

## Consequences

- Seat counting excludes platform admins. `updateSeatsInOrganizationSubscription` counts
  every member today, so it has to change.
- The lock is Nhịp's own gate (`requireInboxSession`, Home's loader and approve), not the
  kit's redirect.
- While lapsed, inbound messages are stored but not drafted or translated, because model
  calls cost money. The drafts are made when the office pays again or an agent opens the
  thread.
- A closing office needs a state (`closingAt` on the organization) and a daily purge job.
  Nothing in the stack schedules jobs yet.
- Billing is managed on the kit's organization billing page by the office's owner. Until
  managers have logins (ADR 0010's later step), a platform admin does it for them.
- The pilot can ship with `requireActiveSubscription` off. Once it is on, this ADR is the
  behaviour.
