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
   Spec: `apps/saas/tests/crm.spec.ts` (CRM 2; offices of the test's own, put on the mock CRM
   through the admin's setting, never `connectMockCrm`; the choice is judged saved on a reloaded
   Connections card; "becomes a lead" is the agent's "In CRM: <name>" and one lead in the mock
   CRM; "refused" is the office's own agent and manager seeing no CRM setting and getting 403 from
   `GET`/`PUT /api/crm/connection`, 401 signed out, the office still on None afterwards, and the
   admin's same `PUT` taken).
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
   and loads at once with the CRM failing. Two threads on one won lead count one closing. An
   office with no CRM shows Closings and Lost hatched with "No CRM" and the line "Closings and
   lost come from your CRM. Nhịp connects the one your office uses.", and no call to connect
   one.
7. **A manager links or unlinks by hand** (#70). As the manager, search the CRM ("min", 3
   characters at least) and link Minji's thread to Minji Park; the agent sees it read-only and
   has no link controls. Unlinked, it stays unlinked. Another office's lead or thread answers
   404; an agent linking a colleague's thread finds nothing.
8. **The admin connects an office to HubSpot** (#65). As the platform admin, on the office's
   Connections card: choose HubSpot, enter the office's HubSpot access token and save. After a
   reload the card shows HubSpot with a token set, and never the token itself; neither does
   `GET /api/crm/connection`. HubSpot with no token is not saved. Saving a new token replaces
   it, still unseen. The office's agent and manager find no CRM setting and get 403 from the
   API; signed out, 401. No guest writes on a HubSpot office here and nothing calls HubSpot:
   the HubSpot adapter is held to its contract by Vitest on recorded HubSpot HTTP (spec #59
   stories 13 to 20), and the token's encryption at rest is ADR 0017's.
   Spec: `apps/saas/tests/crm.spec.ts` (CRM 8; offices of the test's own on no CRM, fake tokens
   only; choosing HubSpot saves nothing until the token is saved, judged through the API; "never
   the token" is the literal token absent from the reloaded page's HTML, from `GET`'s raw answer
   and from the `PUT`'s; the token field is a password field and empty after a reload; "not
   saved" with no token is the card asking for it and the office still on None, and `PUT` with
   no token answering 400; "refused" is as in CRM 2, before and after the office has a token).
9. **Only CRMs Nhịp can connect are choosable** (#123). As the platform admin, the CRM
   selector lists the CRMs on the roadmap (the built-in CRM, Bitrix24, Getfly CRM, Zoho CRM)
   as disabled "coming soon" options that can't be saved. In production, the mock CRM isn't
   offered.

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
It runs against the deployment itself, signs nobody in, and writes nothing. The same checks
gate production: each production deployment passes them before Vercel gives it the domain
(`.github/workflows/production-smoke.yml`, #113).

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
   each signed delivery goes to an OA id of its own and is known by that endpoint; a refused
   delivery carries no endpoint, so the spec knows its own by where it sits between two signed
   ones).
2. **No guest data in the log.** The page never shows a message's text, the guest's id, or the
   vendor's message id (a WhatsApp message id can carry the guest's number; #141 stores only a
   keyed hash of it, which the page does not show). A delivery is known by its endpoint and
   outcome.
   Spec: `apps/saas/tests/webhooks.spec.ts` (Webhook deliveries 2; the API's answer too; Zalo
   message ids stand in for WhatsApp's, the rule being the same for every vendor id).
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
   Spec: `apps/saas/tests/home.spec.ts` (Home 1; an office of the test's own, holding a WhatsApp
   number of its own, with one invited agent; five WhatsApp guests with explicit write times (30,
   20 and 10 minutes ago; 5 and 3 days ago, Quiet), sent in another order; Waiting now's order is
   the rule's and the inbox's Your turn order with Quiet opened; "selected" is that guest's thread
   open beside the list, not the first guest's; on a phone, a Quiet guest's thread with no list).
2. **Waiting now lists only what the operator can open.** A thread another agent owns is not
   in agent 1's Waiting now; the manager's lists it.
3. **Nobody waiting.** With every guest answered, Waiting now says "No guest is waiting."
   Spec: `apps/saas/tests/home.spec.ts` (Home 3; an office of the test's own with one invited
   agent and two guests, answered one by one through the Inbox: Waiting now lists both, then the
   one left and no empty text, then says "No guest is waiting." and lists no guest).
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
   Spec: `apps/saas/tests/home.spec.ts` (Home 5; an office of the test's own with one invited
   agent; WhatsApp guests with explicit write times: one at 17:30 UTC ten days back (00:30 in
   Vietnam the next day) who writes again today, one today, one three days back, and two either
   side of the window's first Vietnamese midnight; a bar is `data-test="leads-by-day-bar"` with
   `data-day` and `data-leads`, a day with no bar has no lead. The bars must be exactly the
   guests' first-write Vietnamese days inside Home's 30 days, worked out when Home loads, one lead
   per guest: this per-day match catches a lead counted per message, a window a day short, and (at
   most hours of the day) a rolling 30×24 hours. Leads in, read from the funnel, equals their sum).

## Thread links (ADR 0010, #141)

A thread's id is opaque: it names the thread, never the guest. The guest's phone number or Zalo
id is stored once, on the thread, and travels in no address.

1. **A thread's address names no guest.** A WhatsApp guest writes from their phone number. Every
   address that opens their thread carries its id and never the phone: Home's Waiting now link,
   the link on their lead in the office's CRM, and the inbox's request for the thread
   (`/api/conversations/<id>`). That link opens the guest's thread.
   Spec: `apps/saas/tests/thread-links.spec.ts` (Thread links 1; an office of the test's own on
   the mock CRM, holding a WhatsApp number of its own, with one invited agent and two guests, the
   linked one second in the queue; the three addresses carry one id, and the phone is in none of
   them, raw or decoded; Home's and the CRM's links each open the guest's thread).
2. **A stale or unknown link opens no one's thread.** The agent follows an inbox link whose
   `?thread=` names no thread they can open: an old link, a made-up id, or a thread of another
   office. The inbox says the conversation isn't here (`data-test="thread-not-found"`) and shows
   no thread, never the first guest in the queue; the list still shows the agent's guests, and
   choosing one opens it.
   Spec: `apps/saas/tests/thread-links.spec.ts` (Thread links 2; "an old link" is
   `<office>:whatsapp:<the guest's phone>`, the id's shape before ADR 0010's opaque ids; "another
   office" is a walk-office thread; "no thread" is no guest's message in the open thread and
   nothing to answer).
3. **A link to an answered thread opens that thread.** A link to a thread the agent already
   answered (in Sent, not Your turn) opens that thread, not the first guest waiting.
   Spec: `apps/saas/tests/thread-links.spec.ts` (Thread links 3; the link is the one on the
   answered guest's lead in the mock CRM; the thread shows the guest's message and the reply).

## Alerts (ADR 0019, spec #84)

A phone's lock screen is out of reach of a test, so E2E reads the **alert log**. E2E runs with
`SEND_MODE=mock` and a throwaway VAPID pair (`.env.e2e`): Nhịp decides every alert exactly as
it would live, writes one `inbox_alert` row per operator per alert (who, which thread, kind
`guest`, `returned`, `assigned` or `test`, whether it sounded, and its link
`/<locale>/inbox?alert=<the row's own id>`), and sends no push. Reading that log
(`alertState.alerts(officeId)`, through `tests/support/alert-state.ts` run by tsx, like
`crm-state.ts`) is looking at the operators' phones; `alertState.devices(userId)` lists an
operator's devices. No test writes the log or a device row.

- **Recipients are exact:** guests write through signed Zalo webhooks to an office of the
  test's own (as in Pool), with two invited agents, an invited manager, and the platform admin
  who created it (its kit `owner`).
- **A device** is added through the app's own API, in the test's own signed-in session:
  `POST /api/alerts/devices` with
  `{ "endpoint": "https://fcm.googleapis.com/fcm/send/e2e-<random>", "keys": { "p256dh": <a
base64url P-256 public key, 65 bytes>, "auth": <base64url, 16 bytes> } }` → 201. The host is
  on the push-service allow-list; a mock deployment never calls it. Headless Chromium cannot
  subscribe to a real push service, so the browser's own subscribe is proven on staging's
  phones.
- **Permission state** is set before the page loads with `addInitScript` (overriding
  `Notification.permission` and `Notification.requestPermission`): headless Chromium reports
  "denied" by default.
- **Red first for the right reason:** the migration and `alert-state.ts` land unwired before
  the red run, so a red test fails on the missing alert, not a missing table.

1. **A pool guest alerts every agent and manager** (#132). A new guest writes: the log
   holds one sounding `guest` alert for agent 1, agent 2 and the manager, and none for anyone
   else. Each alert's link starts with its operator's locale and carries no thread id: `/en/`
   for an operator set to English, `/vi/` for one with no locale set.
   Spec: `apps/saas/tests/alerts.spec.ts` (Alerts 1; agent 1 sets English through the kit's
   user update, the others never chose one).
2. **An owned thread's guest alerts only its owner** (#132). Agent 1 answers a pool guest
   (claims it); the guest writes again: one new alert, for agent 1. Agent 2 and the manager get
   none for that message.
   Spec: `apps/saas/tests/alerts.spec.ts` (Alerts 2; agent 1 answers through the approve API.
   Their second alert is within 2 minutes of the first, so it is a silent replacement.)
3. **A reassignment alerts the new owner, with a bell row** (#133). The manager gives agent
   1's thread to agent 2 through the header's Owner control: the log holds one `assigned` alert
   for agent 2 and none for anyone else; agent 2's bell shows "A manager gave you a thread",
   with no guest's name, and it opens the thread. The manager gives a thread to themselves: no
   alert, no bell row. (No email: Vitest on the kit producer; E2E mail is not readable.)
4. **A thread returned to the pool alerts the pool** (#133). The manager returns agent 1's
   thread to the pool: the log holds one `returned` alert for agent 1 and agent 2, none for the
   manager who returned it (whoever acts is never alerted for it), and none for the platform
   admin. No bell row.
5. **A vendor retry alerts no one** (#132). The same signed Zalo message is delivered
   twice: the thread holds one message, and the log holds one alert per recipient, not two.
   Spec: `apps/saas/tests/alerts.spec.ts` (Alerts 5; one signed body, same `msg_id`, posted twice).
6. **A burst makes one sounding alert** (#132). A pool guest writes five messages within 20
   seconds, two of them at the same moment: each recipient has exactly one sounding alert on
   that thread; the rest are silent replacements. (The 2-minute window itself is a Vitest rule
   with an explicit clock.)
   Spec: `apps/saas/tests/alerts.spec.ts` (Alerts 6).
7. **The platform admin is never alerted** (#132). In an office of its own, a pool guest
   writes, then an agent claims the thread and the guest writes again: the agents and manager
   have their rows, and the platform admin, the office's kit `owner`, has none.
   Spec: `apps/saas/tests/alerts.spec.ts` (Alerts 7).
8. **An alert for a thread a colleague took shows a neutral notice** (#136). Agent 2 opens
   the link of their alert for a pool guest after agent 1 has claimed that thread: the Inbox
   says "A colleague is answering this guest" ("Một đồng nghiệp đang trả lời khách này") and
   shows nothing of the thread (no guest name, message or pipe on the page); the queue is usable
   beside it. Agent 2 opening agent 1's alert link, or an alert id that never existed, gets the
   same notice. Agent 1's own link opens the thread.
9. **The alerts panel asks, and only when asked to** (#135). Permission not yet asked
   (`addInitScript`): loading the Inbox shows no browser prompt, and the canvas shows "Get an
   alert when a guest writes." with one blue "Turn on alerts" pill and "Not now".
   - **Not now:** the panel goes and stays gone across reloads; with the page's clock moved 7
     days on, it is back. Another browser context still shows it.
   - **Blocked:** permission "denied": the panel says how to unblock notifications in the
     browser's settings and offers no pill.
   - **iPhone, not installed:** an iPhone's user agent, not opened from the Home Screen: the
     panel shows the Add to Home Screen steps instead of the pill.
   - **On:** permission "granted" and a device added for this session: no panel.
   - Nothing on it is red.
10. **Signing out removes the device** (#134). An agent signs in with a login of the test's
    own (signing out ends the session it uses), adds a device as above, and adds a second one
    from a second signed-in context. They sign out through the user menu in the first:
    `alertState.devices` lists only the second. `DELETE /api/alerts/devices` answers 401 signed
    out.
11. **Send test alert** (#135). With permission "granted" and a device added for this
    session, Settings → Notifications' "This device" row says alerts are on; "Send test alert"
    writes one `test` alert for that operator and says it was sent. The same through the API:
    `POST /api/alerts/devices/test` → 202; signed out, 401; with no device on this session,
    409 and the row offers to turn alerts on instead.
12. **While Nhịp is open, the tab and a toast say so** (#136). An agent on Settings: a new
    pool guest writes; within the poll the tab title reads "(n) Inbox", n the nav's Your-turn
    count, and one toast says "Minji is waiting"; the same guest writing again replaces it, not
    a second toast; four guests show at most three toasts; tapping one opens that thread. On the
    Inbox list: the tab title changes, no toast. A guest on a colleague's thread raises neither.

## Guest deletion (ADR 0020, spec #85)

A guest asks the agency to delete their data; a manager does it from the thread (Vietnam's
PDPL; not legal advice). Each scenario uses an office of the test's own with an invited agent
and an invited manager (the kit's `admin`), and guests on the test's own Zalo OA, so counts are
exact. The office's CRM, where there is one, is the mock CRM: `connectMockCrm` is setup;
`mockCrmLeads` is looking at the CRM; `addMockCrmLead` is the office adding a contact in its CRM
before the guest writes. `guestDeletionRecords` is the platform admin reading the office's
deletion receipts and lead tallies on request; nothing in the app shows them yet.

1. **A manager deletes a guest's data.** An office with no CRM. A guest writes three messages and
   the agent approves a reply to the first one. As the manager, the thread header's
   "Thread actions" menu has "Delete guest data". It opens a dialog:
   - Its title is "Delete <guest>'s data?".
   - It says Nhịp deletes the thread's "4 messages" (the guest's three and the reply) with their
     translations, the suggested reply and the extracted details.
   - It says the chat is "Kept elsewhere: the chat in your Zalo OA".
   - It says "This can't be undone."
   - It has no CRM checkbox, and its only red control is the "Delete guest data" button.

   Confirming does three things:
   - The thread leaves the manager's Inbox under every view and every owner filter, and a
     search for the guest finds nothing.
   - The agent's Inbox drops it too, and so does the nav count.
   - `GET /api/conversations/:id` answers 404 for both.

   The toast says "Guest data deleted".

2. **Home's numbers don't move when a guest is deleted.** Three guests write. The agent answers
   two of them, and one of those two writes back. Note Home's
   numbers:
   - Leads in, Engaged and In conversation;
   - the median, the 90th percentile and every response-time band;
   - each day of leads by day.

   The manager deletes the guest who wrote back. Home, reloaded, shows every one of those numbers
   unchanged, for the agent and the manager alike. Waiting now no longer lists a deleted guest.

3. **An agent can't delete.** On the agent's own thread and on a pool thread, the header offers
   no "Delete guest data". `POST /api/conversations/:id/deletion` as the agent answers 403, with
   `deleteInCrm` true or false. The thread and its messages are unchanged afterwards, for the
   agent and the manager.
4. **The platform admin can't delete.** As the platform admin, owner of the office, the same
   `POST` answers 403 and the thread is unchanged. Signed out, it answers 401. As a manager of
   another office it answers 404.
5. **The CRM box is ticked when Nhịp created the lead.** The office is on the mock CRM. A new
   guest writes, and the thread says "In CRM: <guest>"; the mock CRM holds the lead Nhịp made.
   - The manager's dialog has "Also delete <guest> in Mock CRM", ticked. Confirming leaves no
     lead for that guest in the mock CRM, and the toast says "Guest data deleted. Also deleted in
     Mock CRM."
   - For a second guest, the manager unticks the box before confirming. The thread is gone, the
     lead is still in the mock CRM, and the toast says "Guest data deleted. The lead stays in
     Mock CRM."
6. **The CRM box is unticked when Nhịp found the lead.** The office is on the mock CRM, and
   `addMockCrmLead` puts a lead with the guest's Zalo id in it first. The guest writes, and the
   thread says "In CRM: <that lead's name>".
   - The manager's dialog has the box unticked. Confirming keeps the lead in the mock CRM
     unchanged, while the thread is gone.
   - For a second such guest, ticking the box deletes the lead.
7. **No CRM, no checkbox.** In an office with no CRM, the dialog has no CRM checkbox (as in 1),
   and the deletion API, given `deleteInCrm: true`, deletes the thread and touches no CRM.
8. **Not while a reply is sending.** `holdReplySending` holds the agent's approved reply in
   "sending":
   - The manager's "Delete guest data" is disabled with "A reply is still sending".
   - `POST /api/conversations/:id/deletion` answers 409 with `reply_sending`.
   - The thread is unchanged.

   Once the helper's release step marks the reply sent, deleting works.

9. **A guest who writes again is a new guest.** After the manager deletes a guest on the mock
   CRM with the box ticked, the same Zalo user writes again (a new message id). The thread is
   fresh:
   - It is in the pool, shows only the new message, and is Your turn for both agents.
   - Home's Leads in counts it as one more lead.
   - The mock CRM holds one lead for that guest again: a new one.
10. **The record names no guest.** After deletions with the box ticked, unticked and with no CRM,
    `guestDeletionRecords` returns one receipt per deletion:
    - each with the manager's name, a time, the message and reply counts;
    - the CRM result: `deleted`, `unlinked`, or none.

    No value in any receipt or lead tally contains the guest's name, their Zalo user id, the
    thread's id or the CRM lead's id.
