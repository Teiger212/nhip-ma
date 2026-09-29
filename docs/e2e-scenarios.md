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

## Roles (ADR 0015, ADR 0018)

The seed makes the platform admin the owner of the walk office (the kit makes whoever
creates an office its owner). That membership must open nothing.

1. **The platform admin lands in the admin area.** Signing in as the platform admin opens
   Admin → Organizations, not the Inbox. The sidebar offers the admin area only: no Inbox,
   no Home. Spec: `apps/saas/tests/roles.spec.ts` (Roles 1).
2. **A platform admin's membership opens no guests.** As the platform admin, opening
   `/inbox`, `/home` or `/` lands in the admin area, and the inbox's conversations API
   answers 403. The agent of the same office still lands in the Inbox and sees its threads.
   Spec: `apps/saas/tests/roles.spec.ts` (Roles 2; also a thread of the office,
   `/api/conversations/:id`, answers 403).

## Pipe connections (ADR 0017)

The consent on Zalo's own screens (the OA owner approving Nhịp's app) happens at Zalo and is
not driven here; a test sets up a connected or disconnected OA directly, as setup.

1. **The platform admin starts connecting a Zalo OA.** Admin → Organizations → an office →
   Connections lists Zalo and WhatsApp, each "Not connected". "Connect Zalo OA" takes the
   browser to Zalo's consent page for Nhịp's Zalo app, carrying Nhịp's callback address.
   Spec: `apps/saas/tests/pipes.spec.ts` (Pipes 1; a new office, so nothing else connects to it).
2. **Only the platform admin connects.** An agent sees no Connections; asking for the connect
   address as an agent is refused (403), and signed out it is refused too (401).
   Spec: `apps/saas/tests/pipes.spec.ts` (Pipes 2).
3. **A disconnected pipe blocks its replies, and nothing else.** With one of the office's
   Zalo OAs disconnected, the agent's inbox says Zalo is disconnected. On a thread whose
   replies go out from that OA the send button is disabled with that reason, and approving
   through the API is refused (409). A new guest message on that OA still arrives in its
   thread. A thread on another, connected OA of the same office still sends, and so does a
   WhatsApp thread. The platform admin's Connections shows that OA as "Needs reconnect" and
   the other as "Connected". Spec: `apps/saas/tests/pipes.spec.ts` (Pipes 3; in the walk
   office, with its WhatsApp number; "still sends" is an approve that lands the reply under
   Sent, a mock send in E2E).
4. **Disconnecting.** The platform admin disconnects the office's Zalo OA: Connections shows
   it "Not connected", and a new guest message to that OA no longer arrives in the office.
   Spec: `apps/saas/tests/pipes.spec.ts` (Pipes 4; a new office with an invited member who
   watches the inbox; the confirmation names the OA; the thread stays, the same guest's next
   message and a new guest's first message do not arrive).

## Staging smoke (ADR 0016)

After every staging deploy, a read-only check that the deployed app is up and still guarded.
It runs against the deployment itself, signs nobody in, and writes nothing.

1. **The app answers.** The login page loads in English and Vietnamese with its sign-in
   button; the auth API says it is up. Spec: `apps/saas/tests/smoke/staging.spec.ts` (Staging smoke 1).
2. **Guests' data stays guarded.** Signed out, the inbox's conversations and pipe status
   APIs refuse (401), and the admin area sends the visitor to login. Spec:
   `apps/saas/tests/smoke/staging.spec.ts` (Staging smoke 2; red: staging answers 404 for the pipe status API, 2026-09-29).
3. **Webhooks fail closed.** An unsigned WhatsApp or Zalo webhook is refused (403). Spec:
   `apps/saas/tests/smoke/staging.spec.ts` (Staging smoke 3).
