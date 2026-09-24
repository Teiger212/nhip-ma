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
  triple. Pre-tenancy threads keep their `pipe:guest` ids and are adopted by an office
  unless that guest already has a thread there, in which case they stay unowned and are
  reported. Superseded on this point by ADR 0012: `officeId` is required and there is no
  adopt path; every thread has an office from birth.
- `Message.pipeExternalId` is the office's endpoint per message. `ZALO_OA_ID` names the
  OA the Zalo token belongs to; unset means the Zalo check is skipped.
- The seed creates two logins: the agent (`walk@nhip.local`) and the platform admin
  (`admin@nhip.local`); the admin owns the walk office and the agent is a member of it.
- `enableSignup` and `enableUsersToCreateOrganizations` are off in the auth config; the
  kit's invitation-only plugin does the rest.
