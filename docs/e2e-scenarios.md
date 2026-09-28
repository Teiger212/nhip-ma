# E2E scenarios

What a person does in Nhịp is tested end to end, not with unit tests (AGENTS.md, "What
gets a test"). The E2E tools and architecture are still to be planned; until then each
user-driven flow is written here, so the plan starts from a list instead of a memory. When
a scenario gets its test, link the spec file next to it.

Seed: `pnpm seed --reset` (walk office, mock CRM). Logins: `walk@nhip.local` (agent),
`admin@nhip.local` (platform admin), password `walkthrough`.

## CRM (ADR 0003)

1. **Link a thread by hand.** As the agent, open Minji's thread, choose "Link to CRM lead",
   search "minji", pick Minji Park. The header shows "In CRM: Minji Park".
2. **Unlink sticks.** Unlink Minji's thread; after the next refresh (10 minutes, or reload
   after changing the TTL for the test) it is still unlinked, even though her phone would
   match.
3. **A lead of another office cannot be linked.** Posting another office's lead id to
   `/api/conversations/:id/crm-link` answers 404 `lead_not_found`; another office's thread
   answers 404 `not_found`.
4. **No CRM, no picker.** With the office's CRM set to None, the thread shows no CRM chip
   and the leads search answers 409 `crm_not_connected`.
5. **Lost leaves the queue, and comes back.** Alexei (lost in the mock CRM) is under Sent
   with "Lost", not in Your turn or Quiet. Send a guest message as Alexei
   (`POST /dev/inbound`); he is back in Your turn.
6. **Home counts deals from the CRM.** Home shows Closings and Lost with "From your CRM ·
   n of m leads linked". Link a second thread to the same won lead: Closings does not go
   up.
7. **CRM down.** With the CRM failing (a test adapter that throws), Home loads, shows the
   cached Closings and Lost, and says the CRM did not answer in time.
8. **The admin connects an office.** As the platform admin, Admin → Organizations → walk
   office → CRM: choose None; the agent's Home shows "Connect your CRM". Choose Mock CRM;
   the numbers return. A non-admin calling the admin CRM procedure is refused.

## Auth (red team batch A, `reports/audit-2026-09-27/`)

1. **An invitee joins.** Open the invitation email's link, sign up; the account is signed in,
   its email counts as verified, and it lands in the office. (Before: a new invitee could
   not accept at all.) Spec: `apps/saas/tests/auth-join.spec.ts` (Auth 1).
2. **Registering someone else's invited email fails.** Sign-up with an invited email but no
   invitation link (or someone else's, or an expired one) is refused (T1). Spec: `apps/saas/tests/auth-signup.spec.ts` (Auth 2; expired invitation is `fixme`: nothing a person does expires one early).
3. **No account without an invitation.** A magic link or Google/GitHub sign-in for an email
   with no account creates nothing (T4). Spec: `apps/saas/tests/auth-signup.spec.ts` (Auth 3; weak until E2E mail is readable, OAuth skipped: not configured).
4. **Only the platform admin creates offices.** An agent calling organization create gets
   403; the platform admin succeeds (T3). Spec: `apps/saas/tests/auth-signup.spec.ts` (Auth 4).
5. **One office, even at once.** One account accepting two offices' invitations at the same
   moment ends in exactly one office; the other accept answers `ONE_OFFICE_PER_OPERATOR`
   (T5). Spec: `apps/saas/tests/auth-join.spec.ts` (Auth 5).
6. **Deleting an office needs permission first.** An unauthenticated or non-owner delete
   request is refused before anything (subscriptions included) is touched (T2). Spec: `apps/saas/tests/auth-join.spec.ts` (Auth 6; subscriptions untouched is not observable from outside).
7. **Only a manager replaces the logo.** A member asking for a logo upload URL gets 403 (T6). Spec: `apps/saas/tests/auth-join.spec.ts` (Auth 7).
