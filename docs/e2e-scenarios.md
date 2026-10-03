# E2E scenarios

What a person does in Nhịp is tested end to end, not with unit tests (AGENTS.md, "What
gets a test"). The E2E tools and architecture are still to be planned; until then each
user-driven flow is written here, so the plan starts from a list instead of a memory. When
a scenario gets its test, link the spec file next to it.

Seed: `pnpm seed --reset` (walk office, mock CRM). Logins: `walk@nhip.local` (agent),
`admin@nhip.local` (platform admin), password `walkthrough`.

## CRM (ADR 0003, spec #59)

The office's CRM holds each lead's outcome; Nhịp writes the lead and reads the outcome back. In
E2E the office's CRM is the **mock CRM**: connecting an office to it is setup
(`connectMockCrm`), and reading its leads (`mockCrmLeads`) is looking at the CRM, as a manager
would in HubSpot. No test writes Nhịp's own link to a lead. Each scenario names its ticket.

1. **A new guest becomes a lead in the CRM** (#61). An office on the mock CRM: a new guest
   writes on Zalo. The agent opens the thread and its header says "In CRM: <the guest's name>"
   (read-only); the office's manager sees the same on that thread.
   The mock CRM holds one lead for that guest, with their Zalo user id, pipe and a link to the
   thread, and no message text. The guest writes again: still one lead. An office with no CRM:
   the header says nothing about a CRM, and no lead is made.
   Spec: `apps/saas/tests/crm.spec.ts` (CRM 1; offices of the test's own with an invited agent
   and, on the mock CRM, an invited manager (the kit's `admin`);
   a nameless Zalo guest's name is their Zalo id, as the Inbox lists them; "no second lead" and
   "no lead" are judged once a later guest's lead, on the mock CRM, has arrived).
2. **The admin sets an office's CRM** (#62). As the platform admin, the office's Connections
   card: choose Mock, and a new guest becomes a lead; choose None, and the thread's CRM status
   goes. A non-admin is refused.
3. **Won or lost leaves the queue, and comes back** (#63). The lead is marked lost in the mock
   CRM, which tells Nhịp: the thread is under Sent with a neutral "Lost" where the turn was, not
   in Your turn, and the nav count drops. The guest writes again: back in Your turn. A won lead
   shows "Won". A notice with a bad signature is refused.
   Spec: `apps/saas/tests/crm.spec.ts` (CRM 3; an office of the test's own with one invited agent
   and a second waiting guest, so the counts are exact; "neutral" is the tone of the row's pipe
   badge; the CRM telling Nhịp again that the lead is lost, after the guest wrote, keeps them in
   Your turn (the outcome is timed from when Nhịp first saw it, ADR 0003), judged once another
   lead marked won after it has left Your turn; a notice signed with the wrong secret, or not
   signed, answers 401).
4. **A failed CRM write heals** (#64). With the mock CRM failing, a new guest's message still
   arrives and is in Your turn at once; the manager sees "Not in CRM yet". When the CRM
   recovers, the lead appears and the thread says "In CRM".
5. **The reconcile catches a missed outcome** (#67). A lead marked lost with no notice to Nhịp
   is resolved after the reconcile runs.
6. **Home counts deals from the CRM** (#68). Home shows Closings and Lost "as of" the last check,
   and loads at once with the CRM failing. Two threads on one won lead count one closing.
7. **A manager links or unlinks by hand** (#70). As the manager, search the CRM ("min", 3
   characters at least) and link Minji's thread to Minji Park; the agent sees it read-only and
   has no link controls. Unlinked, it stays unlinked. Another office's lead or thread answers
   404; an agent linking a colleague's thread finds nothing.

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
   `apps/saas/tests/smoke/staging.spec.ts` (Staging smoke 2).
3. **Webhooks fail closed.** An unsigned WhatsApp or Zalo webhook is refused (403). Spec:
   `apps/saas/tests/smoke/staging.spec.ts` (Staging smoke 3).

## Webhook deliveries (ADR 0017)

For "the guest says they wrote, but nothing arrived". A delivery log holds when each webhook
came, on which pipe and endpoint, whether its signature held, and what became of its messages;
never message text or who the guest is. A refused (unsigned) delivery records only its pipe and
time: nothing in it can be trusted.

1. **Every delivery is on record.** As the platform admin, Admin → Webhooks lists the latest
   deliveries, newest first: a signed message to a connected Zalo OA shows as filed to its
   office; one to an OA no office holds shows as dropped (no office); an unsigned one shows
   as refused (bad signature). Spec: `apps/saas/tests/webhooks.spec.ts` (Webhook deliveries 1;
   a refused delivery carries no endpoint or message id, so the spec knows its own by where it
   sits between two signed ones).
2. **No guest data in the log.** The page never shows a message's text or the guest's id.
   Spec: `apps/saas/tests/webhooks.spec.ts` (Webhook deliveries 2; the API's answer too).
3. **Only the platform admin sees it.** An agent sees no Webhooks page; its API refuses the
   agent (403) and a visitor who is signed out (401). Spec: `apps/saas/tests/webhooks.spec.ts`
   (Webhook deliveries 3).

## Pool then owner (ADR 0015)

Seed: the walk office has two agents (`walk@nhip.local`, `walk2@nhip.local`) and a manager
(`manager@nhip.local`, kit role `admin`), password `walkthrough`. Demo threads: Minji is agent
1's, Yuki is agent 2's, Alexei and Thảo are in the pool.

1. **A new guest lands in the pool.** A guest writes to the office for the first time: both
   agents see the thread in their Inbox, marked as in the pool, and so does the manager.
   Spec: `apps/saas/tests/pool-owner.spec.ts` (Pool 1; a new Zalo guest on the test's own OA, in the list and the thread header).
2. **The first agent to answer owns it.** Agent 1 approves a reply on a pool thread: it stays
   in agent 1's Inbox, shown as theirs, and leaves agent 2's Inbox, counts and search. Agent 2
   opening it by address, or through the API, finds nothing (404).
   Spec: `apps/saas/tests/pool-owner.spec.ts` (Pool 2; the Inbox has no per-thread address, so "by address" is
   `GET /api/conversations/:id`; "counts and search" is searching the guest under All: every
   count says 0. Agent 1's "Yours" is checked after reloading the Inbox: after a send in Your
   turn, the Inbox moves on to the next waiting guest (the sent thread leaves Your turn), so
   the header then shows that next thread).
3. **Two agents answering at once end with one owner.** Agent 1 and agent 2 approve the same
   pool thread at the same moment: one reply is sent, and the thread belongs to whoever sent it.
   Spec: `apps/saas/tests/pool-owner.spec.ts` (Pool 3; both approvals fired at once through the API: exactly one
   is 200, the manager sees only that reply and that sender as owner, the other agent 404).
4. **The guest's next message goes to the owner.** The guest writes again on an owned thread:
   it is Your turn for agent 1 only; agent 2 still does not see it.
   Spec: `apps/saas/tests/pool-owner.spec.ts` (Pool 4).
5. **The manager sees every thread and reassigns.** The manager sees pool threads and every
   agent's threads, each marked with its owner. Reassigning agent 1's thread to agent 2 moves
   it: agent 2 now has it, agent 1 no longer does. Returning it to the pool shows it to both
   agents again. Spec: `apps/saas/tests/pool-owner.spec.ts` (Pool 5; owners shown on the test's own threads and,
   read only, on the seed's Minji and Yuki; reassigning through the header's Owner control).
6. **A reply from the vendor's own app claims nothing.** A reply the office sent from the
   WhatsApp or Zalo app itself leaves the thread in the pool.
   Spec: `apps/saas/tests/pool-owner.spec.ts` (Pool 6; Zalo only: an `oa_send_text` echo shows in the thread and
   the thread stays Pool for both agents and the manager; the next agent to answer in Nhịp
   owns it. The WhatsApp echo is not tested yet).
7. **The manager filters by owner.** The manager's Inbox filter All / Pool / an operator shows
   exactly those threads.
   Spec: `apps/saas/tests/pool-owner.spec.ts` (Pool 7; under the All view: each filter lists its threads, not the
   others, and every listed thread carries that owner).
8. **A new agent's first day.** A newly joined agent sees only the pool; with nothing in it,
   the Inbox says guests waiting for anyone appear there.
   Spec: `apps/saas/tests/pool-owner.spec.ts` (Pool 8; one newcomer joins the walk office and sees only pool
   threads; another joins a new office with no guests and sees the empty-pool text).
9. **An agent cannot reassign.** An agent's thread has no Owner control, and the reassign API
   refuses an agent (403).
   Spec: `apps/saas/tests/pool-owner.spec.ts` (Pool 9; the manager's control on the same thread is the positive
   control; 403 for handing on, returning to the pool and taking a pool thread; nothing moves).

## Home (ADR 0002, ADR 0004, ADR 0015)

1. **Waiting now opens the thread.** As the agent, Home lists the guests whose turn it is,
   oldest waiting first and quiet ones last, the same order as the inbox's Your turn. Choosing
   one opens the inbox with that thread selected (on a phone, the thread itself).
2. **Waiting now lists only what the operator can open.** A thread another agent owns is not
   in agent 1's Waiting now; the manager's lists it.
3. **Nobody waiting.** With every guest answered, Waiting now says "No guest is waiting."
4. **The nav counts Your turn on every page.** The amber number beside Inbox in the sidebar
   equals the inbox's Your turn count, on Home, the Inbox and Settings alike. Approving a
   reply lowers it; a guest writing in raises it within the inbox's poll. The platform admin
   sees no number. Spec: `apps/saas/tests/nav-count.spec.ts` (Home 4; an office of the test's
   own with one invited agent, so the counts are exact: three guests, one approved, so Your
   turn 2 differs from Sent and All; Home and Settings loaded afresh; a guest raises it on
   Settings, the Inbox and Home without a reload; the platform admin, owner of that office,
   is judged on a Settings page opened before the agent's and after the agent's has shown a
   new guest, and in the admin area).
5. **Leads by day adds up.** The bars of Home's 30 days sum to Leads in; a guest who first
   wrote just after midnight in Vietnam (before midnight UTC) is counted on the Vietnamese day.
