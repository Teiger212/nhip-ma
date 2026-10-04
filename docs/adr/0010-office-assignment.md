# 0010. Offices are assigned by Nhịp, one per operator, and resolved from membership

Date: 2026-09-20. Status: accepted. Extends ADR 0008.

## Context

ADR 0008 made the office the tenant but left three questions open, and an outside audit
found the first exploitable: the inbox trusted the session's "active organization", a
field a signed-in user can set to any organization id through the kit's update-user
endpoint. The other two: which office a thread belongs to when the same guest writes to
two offices, and which credentials a reply goes out on.

## Decision

- **Nhịp assigns.** A platform admin (`user.role === "admin"`) creates an office in the
  kit's admin area, and agents join it through the kit's invitation. Public sign-up is
  closed: an account exists because it was invited into an office. Operators never
  create or pick an office. Manager-invites-agents is a later step that un-hides the same
  kit components inside the office; nothing here forecloses it.
- **One operator, one office.** Membership is read from the membership table on every
  request. Zero memberships is `403 no_office`; more than one is `403 ambiguous_office`,
  a misconfiguration to fix, not a case to support. Accepting an invitation while
  already a member of an office is refused. Access never consults the session's
  active-organization field.
- **One host.** The office comes from the account, so a subdomain per office would carry
  no tenancy weight. Per-agency domains are a later white-label feature.
- **One thread per guest per office.** The thread's identity is (office, pipe, guest).
  Each message records the office's number or OA it travelled through; a reply goes out
  on the number the guest last wrote to. The same guest on WhatsApp and on Zalo stays
  two threads: a Zalo id cannot be matched to a phone number, and ADR 0003 refuses name
  matching.
- **Credentials stay in env for the pilot.** A send is refused
  (`409 pipe_not_configured`) when the thread's number is not the one this deployment's
  credentials belong to. Per-connection credentials are the multi-office step.

## Consequences

- `Conversation.id` for new threads is `office:pipe:guest`; the unique index is on the
  triple. Superseded on the id by the 2026-10-04 amendment below: the id is opaque, and
  every thread was re-keyed. (ADR 0012 had already removed the pre-tenancy `pipe:guest`
  threads and their adopt path: every thread has an office from birth.)
- `Message.pipeExternalId` is the office's endpoint per message. `ZALO_OA_ID` names the
  OA the Zalo token belongs to; unset means the Zalo check is skipped.
- The seed creates two logins: the agent (`walk@nhip.local`) and the platform admin
  (`admin@nhip.local`); the admin owns the walk office and the agent is a member of it.
- `enableSignup` and `enableUsersToCreateOrganizations` are off in the auth config; the
  kit's invitation-only plugin does the rest.

## Amendment (2026-10-04, #141): the thread id is opaque

The id no longer has the `office:pipe:guest` shape. That shape put the guest's phone number
(WhatsApp) or Zalo id in every route, thread link, CRM deal and request log, which reverses the
reason it was kept ("the id is part of every route"): a route is exactly where the guest's
identity should not travel.

- **A thread's id is opaque**: a `cuid()` for a new thread; existing threads were re-keyed to
  random UUIDs by migration `20261004181201_opaque_thread_id` (the six foreign keys to the
  thread cascade on update). Nothing parses an id.
- **The thread's identity is still (office, pipe, guest)**, the unique key. Inbound finds its
  thread by that triple; two first messages racing still collide on it, and the loser's retry
  finds the winner's thread.
- **The guest's phone or Zalo id is stored once**, on the thread (`guestId`, beside
  `guestName`). An Answer no longer copies it (`Answer.to` is dropped; a send reads the
  thread's `guestId`), and vendor message ids, which can encode the guest's WhatsApp number,
  are stored as an HMAC-SHA256 under a key derived from `BETTER_AUTH_SECRET`. No thread id,
  Answer, vendor message id or thread link names the guest. What else can still say who the
  guest was, for deletion (ADR 0020, #138) to clear: the CRM link's `leadName` (the CRM's name
  for the lead, the guest's phone or Zalo id when they gave no name), the mock CRM's leads,
  and message and draft text.
- **A link to a thread the operator cannot open** (an old link, another office's thread)
  says the conversation isn't here; it never opens another guest's thread.
