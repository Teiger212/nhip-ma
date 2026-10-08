# E2E scenarios

What a person does in Nhịp is tested end to end, not with unit tests (AGENTS.md, "What
gets a test"). The E2E tools and architecture are still to be planned; until then each
user-driven flow is written here, so the plan starts from a list instead of a memory. When
a scenario gets its test, link the spec file next to it.

Seed: the E2E run seeds its own database with `E2E=1`, which writes only the walk logins and
the walk office's four demo threads (Minji, Yuki, Alexei, Thảo); specs build their own offices
for everything else. Logins: `walk@nhip.local` (agent), `admin@nhip.local` (platform admin),
password `walkthrough`. Without `E2E`, `pnpm seed -- --reset` writes the rich dev and demo
dataset instead (#69, AGENTS.md "Environment"): about sixty guests in every Inbox, CRM and
alert state, in the walk office (mock CRM) and a second office. A spec run against a dev
server (`E2E_BASE_URL`) on that dataset sees those extra threads.

## CRM (ADR 0003, spec #59)

The office's CRM holds each lead's outcome; Nhịp writes the lead and reads the outcome back. In
E2E the office's CRM is the **mock CRM**: connecting an office to it is setup
(`connectMockCrm`), and reading its leads (`mockCrmLeads`) is looking at the CRM, as a manager
would in HubSpot. No test writes Nhịp's own link to a lead. Each scenario names its ticket.

1. **A new guest becomes a lead in the CRM** (#61). An office on the mock CRM: a new guest
   writes on Zalo. The manager assigns the thread to the agent, who opens it, and its header
   says "In CRM" (read-only); the office's manager sees the same on that thread.
   The mock CRM holds one lead for that guest, with their Zalo user id, pipe and a link to the
   thread, and no message text. The guest writes again: still one lead. An office with no CRM:
   the header says nothing about a CRM, and no lead is made.
   Spec: `apps/saas/tests/crm.spec.ts` (CRM 1; offices of the test's own with an invited agent
   and an invited manager (the kit's `admin`), who assigns each guest the agent opens to them;
   a nameless Zalo guest's name is their Zalo id, as the Inbox lists them; "no second lead" and
   "no lead" are judged once a later guest's lead, on the mock CRM, has arrived).
2. **The admin sets an office's CRM** (#62). As the platform admin, the office's Connections
   card: choose Mock, and a new guest becomes a lead; choose None, and the thread's CRM status
   goes. A non-admin is refused.
   Spec: `apps/saas/tests/crm.spec.ts` (CRM 2; offices of the test's own, put on the mock CRM
   through the admin's setting, never `connectMockCrm`, whose invited manager assigns the guest to
   the agent; the choice is judged saved on a reloaded
   Connections card; "becomes a lead" is the agent's "In CRM" and one lead in the mock
   CRM; "refused" is the office's own agent and manager seeing no CRM setting and getting 403 from
   `GET`/`PUT /api/crm/connection`, 401 signed out, the office still on None afterwards, and the
   admin's same `PUT` taken).
3. **Won or lost leaves the queue, and comes back** (#63). The lead is marked lost in the mock
   CRM, which tells Nhịp: the thread is under Sent with a neutral "Lost" where the turn was, not
   in Your turn, and the nav count drops. The guest writes again: back in Your turn. A won lead
   shows "Won". A notice with a bad signature is refused.
   Spec: `apps/saas/tests/crm.spec.ts` (CRM 3; an office of the test's own with one invited agent
   and a second waiting guest, both assigned to the agent, so the counts are exact; "neutral" is the tone of the row's pipe
   badge; the CRM telling Nhịp again that the lead is lost, after the guest wrote, keeps them in
   Your turn (the outcome is timed from when Nhịp first saw it, ADR 0003), judged once another
   lead marked won after it has left Your turn; a notice signed with the wrong secret, or not
   signed, answers 401).
4. **A failed CRM write heals** (#64). With the mock CRM failing, a new guest's message still
   arrives and is in Your turn at once; the manager sees "Not in CRM yet". When the CRM
   recovers, the lead appears and the thread says "In CRM".

   4a. **A missing lead says so, and heals when the thread is opened** (#211, before go-live;
   healing with nobody opening the thread is CRM 4's, #64). An office on the mock CRM, the CRM
   down when a new guest first writes on Zalo: the message still arrives and the thread is in
   Your turn. The manager assigns it to the agent, who opens it: its header says "Not in CRM
   yet", neutral like the pipe badge beside it, never red; the manager sees the same on that
   thread. No lead is in the CRM. Once the CRM works again and Nhịp's wait before trying again
   has passed, opening the thread writes the lead: within a poll the header says "In CRM", and
   the CRM holds exactly one lead for the guest, with the guest's name. An office with no CRM shows
   no CRM status on a new guest's thread, neither "Not in CRM yet" nor "In CRM", to the agent
   or the manager.
   Spec: `apps/saas/tests/crm.spec.ts` (CRM 4a; offices of the test's own, as in CRM 1; the CRM
   is down from before the guest's first message (`takeMockCrmDown`) and back with
   `bringMockCrmBack`; the wait is made over with `passCrmRetryWait`, which retries nothing by
   itself; "Not in CRM yet" is seen before the CRM comes back, so the heal is the opening's;
   "neutral" is the tone of the thread header's pipe badge; "no lead" is judged once the header
   says "Not in CRM yet", "exactly one lead" once a later guest's lead has arrived; "no CRM
   status" once the guest's second message shows in the open thread. Not judged: that Nhịp
   waits before trying again (no sign settles that a retry did not happen), so a build that
   retries on every poll passes).

5. **The reconcile catches a missed outcome** (#67). A lead marked lost with no notice to Nhịp
   is resolved after the reconcile runs.
6. **Home counts deals from the CRM** (#68). Home shows Closings and Lost "as of" the last check,
   and loads at once with the CRM failing. Two threads on one won lead count one closing. An
   office with no CRM shows Closings and Lost hatched with "No CRM" and the line "Closings and
   lost come from your CRM. Nhịp connects the one your office uses.", and no call to connect
   one.
   Spec: `apps/saas/tests/home-crm.spec.ts` (CRM 6; offices of the test's own, each with an
   invited manager, who sees every thread and reads Home; all threads stay Unassigned. "Two
   threads on one lead" is one person on two pipes (spec #59 story 31): they write on WhatsApp
   first and become a lead with their phone; in the mock CRM itself the manager adds their Zalo
   user id to that lead (`addZaloIdInMockCrm`, the CRM's data only, never Nhịp's link), and they
   then write on Zalo with that id. Both threads, opened by their `?thread=` links, say "In CRM",
   and the CRM holds that one lead and no other. A second guest's lead is marked lost, then the person's won;
   Home is read once both of the person's threads say Won and the second guest's says Lost. The Closings and Lost cells are
   `data-test="home-closings"` / `"home-lost"`: the cell's only digit-only text is its figure (1
   and 1, so a closing counted per thread reads 2), with a line beginning "As of ", and no "No
   CRM". "CRM failing" is `takeMockCrmDown` after the won outcome was heard (the thread says
   Won), then Home: it answers under 400 with Closings 1, the "As of" line and no error words in
   either cell; the CRM is brought back afterwards. "No CRM" is each cell saying "No CRM" and the
   hint line, with no figure and no "As of"; "no call to connect" is no text, link or button
   matching "Connect your CRM" anywhere on Home. Not judged: that Home loads "at once" (the mock
   CRM fails fast, so a Home that asks it on view takes no longer), that the "As of" time is the
   last time Nhịp heard from the CRM rather than when Home loaded (telling them apart takes
   minutes), and the hatch).
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
10. **In CRM opens the lead in the CRM, where the CRM has a web app** (demo milestone). On an
    office on HubSpot whose account Nhịp knows, the thread header's "In CRM" is a link that
    opens the thread's deal in HubSpot in a new tab, on the account's own HubSpot address (an
    EU-hosted account's is `app-eu1.hubspot.com`), and Nhịp's page sends nothing with it
    (`rel="noopener noreferrer"`). It still looks like the neutral badge beside it, with a small
    external-link icon. Until Nhịp knows the account, "In CRM" is plain text. The mock CRM has no
    web app: on an office on the mock CRM, "In CRM" is plain text, no link and nothing to click
    through, and "Not in CRM yet" is plain text on every CRM.
    Spec: `apps/saas/tests/crm.spec.ts` (CRM 10; the mock half: offices of the test's own on the
    mock CRM, "In CRM" reached as in CRM 1 and "Not in CRM yet" as in CRM 4a (the CRM down when
    the guest first writes); "no link" is no link role and no `a` element or `href` in or around
    the `crm-status` badge, which still reads exactly "In CRM" or "Not in CRM yet". The HubSpot
    half needs a deal Nhịp linked, which only real HubSpot makes, and no test writes Nhịp's own
    link to a lead, so Vitest holds it: the address built from the recorded account details
    equals the `url` HubSpot itself returns for that deal in the recordings (`hubspot.test.ts`),
    and a HubSpot office's thread carries its lead's address once the account is known, none
    before, and none on the mock CRM (`crm/sync.db.test.ts`)).

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
6. **Deleting an office needs permission first.** A delete request from anyone not signed in,
   or not the office's owner, is refused before anything (subscriptions included) is touched (T2). Only the
   platform admin deletes an office (#185, ADR 0015): in an office of the test's own, a manager
   who holds the kit's `owner` role (invited as `owner` by the platform admin) asks the API to
   delete it (`POST /api/auth/organization/delete`) and gets 403; the office stays, with the
   manager and the platform admin still in it. The platform admin's delete of an office of the
   test's own still works: the office is gone. Spec: `apps/saas/tests/auth-join.spec.ts` (Auth 6; subscriptions untouched is not observable from outside).
7. **Only a manager replaces the logo.** A member asking for a logo upload URL gets 403 (T6). Spec: `apps/saas/tests/auth-join.spec.ts` (Auth 7).
8. **A signed-in page shows nothing to someone signed out, however it is asked for (#231).**
   Signed out, opening Home sends you to the login page, with nothing of Home or the office on
   the way. The same holds for the request the app itself makes when a signed-in person moves
   from one page to another (a React Server Components request: `RSC: 1` plus the router state
   of the page they came from, which tells the server the signed-in frame is already on screen,
   so only the page itself is rendered; Next's guide, "Layouts and auth checks"). Replayed
   without a session, that request is sent to the login page too: none of Home renders, not
   its heading and not the office's numbers. It holds for a browser with no session cookie, and
   for one still holding a session cookie that no longer opens a session (signed out, or made
   up). Signed in, the same request does show Home's numbers, so the refusal is the session's
   doing.
   Spec: `apps/saas/tests/page-session.spec.ts` (Auth 8; the request is the one the seeded
   agent's browser makes when they click Home in the nav from the Inbox, captured with its URL
   (`_rsc` included) and its `RSC` and `Next-*` headers, prefetches left out, and every such
   request is replayed from a request context with no cookie of its own, redirects not followed.
   "Sent to the login page" is an HTTP redirect whose `Location` is `/en/login`, or Next's
   redirect instruction to `/en/login` in the RSC answer (the form a signed-in move to `/en/walk`
   answers with); a redirect anywhere else fails. "None of Home" is none of Home's own words
   (subtitle, funnel labels, response time, the no-office cards) in the answer. "Signed out" is
   an agent of an office of the test's own whose session opened Home until they signed out; the
   positive control is the seeded agent's session cookie on the same replay. English only).

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

## Team (ADR 0015, #82)

A manager invites the office's agents from **Team**, the kit's members page refitted (decided
2026-10-05 on #82). It is reached from the user menu (no sidebar item: the sidebar stays Home
and Inbox) and lives at `/<locale>/<office slug>/settings/members` (the walk office's slug is
`walk`). Its words are Nhịp's: the roles read **Agent** and **Manager** (VI **Nhân viên**,
**Quản lý**), never member, admin or owner. A manager is the kit's `admin` or `owner`, an agent
its `member` (CONTEXT.md). The invite's language, resend and expiry, and the invitee's path
are not here (the onboarding grill).

1. **A manager invites an agent from Team.** As the walk office's manager, the user menu (the
   ⋯ beside their name in the sidebar) has a "Team" item; it opens `/en/walk/settings/members`,
   whose page title is "Team". The invite form's role offers exactly "Agent" and "Manager",
   with "Agent" chosen; there is no "Owner". The manager invites a new email as Agent: a toast
   says "Invitation sent", and under "Pending invitations" the email shows with role "Agent".
   Inviting another email as Manager shows it with role "Manager". In Vietnamese
   (`/vi/walk/settings/members`) the menu item is "Nhóm", the page title "Nhóm", and the role
   options "Nhân viên" and "Quản lý".
2. **An agent has no Team.** As an agent of the walk office, the user menu has no "Team", and
   opening `/en/walk/settings/members` shows the not-found page (404) with no member list and
   no invite form. The kit's API refuses the agent too: inviting into the office
   (`POST /api/auth/organization/invite-member`, any role) answers 403 and no invitation is
   made; changing a member's role (`POST /api/auth/organization/update-member-role`) answers
   403 and the role is unchanged; removing a colleague
   (`POST /api/auth/organization/remove-member`) is refused (4xx) and the colleague stays. The
   platform admin's user menu (in the admin area) has no "Team" either.
3. **No owner, no Leave, no platform admin on Team.** As the manager, Team's member list shows
   the office's managers and agents, each with role "Manager" or "Agent"; the platform admin
   (`admin@nhip.local`), whose kit `owner` membership is inert (ADR 0015), is not listed. The
   manager's own row has no "Leave" (leaving would delete the account, ADR 0013) and no menu,
   and their own role can't be changed there. An agent's row offers the roles "Agent" and
   "Manager" only. The API never makes an owner from Team: a manager (the kit's `admin`)
   inviting with role `owner`, or changing an agent's role to `owner`, answers 403, with no
   invitation made and the role unchanged; and so does a manager who holds the kit's `owner`
   role (invited as `owner` by the platform admin into an office of the test's own), who
   otherwise sees Team as any manager does.
4. **Removing someone asks first** (#174). As a manager, "Remove from office" on an agent's row
   opens a confirmation (the kit's alert dialog) before anything happens: "Remove {name} from
   the office?", "Removing {name} ends their account. Their guests return to Unassigned.", with
   "Cancel" and a red "Remove" ({name} is the person's name, or their email when they have
   none). Cancel closes it and the agent stays, on Team and in the office. Remove removes them
   in that one step: their row leaves Team, and the account is gone (ADR 0013). In Vietnamese
   the dialog reads "Xóa {name} khỏi văn phòng?", "Xóa {name} sẽ xóa tài khoản của họ. Khách
   của họ trở về Chưa giao.", "Hủy" and "Xóa" (to be reviewed in #78).
5. **The platform admin's membership is theirs alone** (#174). In an office of the test's own,
   created by the platform admin (so their inert kit `owner` membership is in it), a manager who
   holds the kit's `owner` role, and a manager who is the kit's `admin`, each ask the API to
   remove the platform admin's membership (`POST /api/auth/organization/remove-member`, by
   member id and by email) and to change its role
   (`POST /api/auth/organization/update-member-role`, to `admin` and to `member`). Every ask
   answers 403, and the platform admin is still in the office, as `owner`.
6. **The platform admin never reaches a manager's browser** (#174). As the walk office's
   manager, opening Team: neither the page itself nor any `/api/auth/` answer the browser gets
   contains `admin@nhip.local`. Asked directly, the office as the manager reads it
   (`GET /api/auth/organization/get-full-organization`, `GET /api/auth/organization/list-members`)
   lists no platform admin, and `list-members`' `total` counts only the members it lists. The
   platform admin's own view of the office still lists them: in the admin area (Admin →
   Organizations → the office), their own row reads "Platform admin" (VI "Quản trị viên nền
   tảng") rather than "Manager".
7. **No thread goes to the platform admin** (#174, ADR 0022). The manager asks the owner API
   (`POST /api/conversations/:id/owner`) to give a thread of the office to the platform admin
   (their user id, read from the platform admin's view of the office): it answers 400, and the
   thread's owner is unchanged.
8. **Office settings are a manager's** (#212). As an agent of the walk office, opening the
   office's settings by address (`/en/walk/settings/general`, and Billing,
   `/en/walk/settings/billing`) shows the not-found page (404), as Team does, with nothing of the
   office's settings on it. The walk office's manager opening General gets the page. Billing is
   hidden from everyone until billing is built (Hidden kit screens 1, #210).
   Spec: `apps/saas/tests/office-settings.spec.ts` (Team 8; the seeded agent and manager; "nothing
   of the settings" is no text field on the agent's page; "the page" is an answer under 400 with
   a heading and no not-found page, its wording left to #214's rework).

Spec: `apps/saas/tests/team.spec.ts` (Team 1–7; the agent's and the managers' API refusals run
in offices of the test's own with newcomer agents and managers, so a removal or owner grant that
was taken costs no seeded login; "no invitation made" and "role unchanged" are read through the
platform admin's view of the office).

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
   office, with its WhatsApp number, the guests assigned to the agent by the office's manager;
   "still sends" is an approve that lands the reply under
   Sent, a mock send in E2E).
4. **Disconnecting.** The platform admin disconnects the office's Zalo OA: Connections shows
   it "Not connected", and a new guest message to that OA no longer arrives in the office.
   Spec: `apps/saas/tests/pipes.spec.ts` (Pipes 4; a new office with an invited manager who
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

## Assigning leads (ADR 0022, spec #160)

Seed: the walk office has two agents (`walk@nhip.local`, `walk2@nhip.local`) and a manager
(`manager@nhip.local`, kit role `admin`), password `walkthrough`. Demo threads: Minji is agent
1's, Yuki is agent 2's, and Alexei and Thảo are Unassigned. "A second manager" is an invited
kit `admin` of an office of the test's own. Every new guest also gets the auto-reply (ADR
0021); nothing here depends on it.

1. **A new guest waits in Unassigned, for managers only.** A guest writes to the office for
   the first time.
   - The manager sees the thread in the Unassigned view, marked "Unassigned".
   - Neither agent sees it: it is not listed, counted or searched. Opening it by address or
     through the API is a 404.

   Spec: `apps/saas/tests/assign.spec.ts` (Assign 1; an office of the test's own with two
   invited agents and an invited manager, so the agents' counts are exact; the Unassigned view
   the manager's Inbox opens on, with the flag in the list and the thread header; "not
   counted" is the agents' views at 0 and no nav count; "by address" is the `?thread=` link
   showing `thread-not-found`).

2. **Assigning gives the thread to that agent only.** On the thread's row in Unassigned, the
   manager picks "Assign to…" → agent 1.
   - The thread leaves Unassigned. Agent 1's Inbox has it, Your turn, marked "Yours".
   - Agent 2 still finds nothing (404).
   - Agent 1 approves a reply: it is sent from agent 1, and the thread stays theirs.

   Spec: `apps/saas/tests/assign.spec.ts` (Assign 2; an office of the test's own with two
   invited agents and an invited manager; agent 1 takes a name of their own, so the row's menu
   item names them; "leaves Unassigned" is the row gone and the view at 0; agent 1 has no
   Unassigned view; "stays theirs" is the approved reply (200) putting the thread under agent 1's
   Sent, still "Yours", the manager's owner flag naming agent 1, and agent 2 still finding
   nothing. "Sent from agent 1" is not checked: the thread shows no sender beyond "Sent from
   Nhịp").

3. **Two managers assign at once: the last one wins.** In an office with a second manager,
   manager 1 assigns a new guest to agent 1, then manager 2 assigns it to agent 2 within the
   same second.
   - The thread is agent 2's: both managers see agent 2 as owner.
   - Agent 1 finds nothing (404).

   Spec: `apps/saas/tests/assign.spec.ts` (Assign 3; an office of the test's own with two
   invited managers, both through the owner API, one after the other within a second; agent 2
   takes a name of their own through the kit's user update, so the managers' owner flag names
   them).

4. **The guest's next message goes to the owner.** The guest writes again on a thread assigned
   to agent 1: it is Your turn for agent 1 only; agent 2 still does not see it.
   Spec: `apps/saas/tests/assign.spec.ts` (Assign 4; assigned by the walk office's manager
   through the owner API).
5. **The manager sees every thread and reassigns.** The manager sees the Unassigned threads and
   every agent's threads, each marked with its owner.
   - Reassigning agent 1's thread to agent 2 moves it: agent 2 now has it, agent 1 no longer
     does.
   - Returning it to Unassigned takes it from agent 2, and neither agent sees it.

   Spec: `apps/saas/tests/assign.spec.ts` (Assign 5; owners shown on the test's own threads
   and, read only, on the seed's Minji and Yuki; through the header's "Assign to…").

6. **A reply from the vendor's own app assigns nothing.** A reply the office sent from the
   WhatsApp or Zalo app itself shows in the thread, and the thread stays Unassigned: the
   manager sees it there, and neither agent sees it.
   Spec: `apps/saas/tests/assign.spec.ts` (Assign 6; Zalo only, an `oa_send_text` echo. The
   WhatsApp echo is not tested yet).
7. **The manager filters by owner.** The manager's Inbox filter (All, or an operator) shows
   exactly those threads. It offers no Unassigned: that is a view of its own (10).
   Spec: `apps/saas/tests/assign.spec.ts` (Assign 7; under the All view, each filter lists
   its own threads and not the others, and every listed thread carries that owner).
8. **A new agent's first day.** A newly joined agent sees no thread at all, even in an office
   with Unassigned guests. With nothing assigned, the Inbox says "Nothing assigned to you
   yet."
   Spec: `apps/saas/tests/assign.spec.ts` (Assign 8; one newcomer joins the walk office,
   which has Alexei and Thảo Unassigned, and a guest of the test's own).
9. **An agent cannot assign.** An agent's thread has no owner menu and no "Assign to…". The
   owner API refuses an agent (403) for handing a thread on, returning it to Unassigned, and
   taking an Unassigned thread, and nothing moves.
   Spec: `apps/saas/tests/assign.spec.ts` (Assign 9; the manager's "Assign to…" on the same
   thread is the positive control).
10. **Unassigned comes first, oldest first.** Three new guests write, one after another. The
    manager's Inbox opens on the Unassigned view, which lists them oldest first with its
    count. "Assign to…" on the oldest row gives it to agent 1, and that row leaves the view:
    its count drops and the next guest heads the list.
    Spec: `apps/saas/tests/assign.spec.ts` (Assign 10; an office of the test's own, each guest
    filed before the next writes; "opens on" is `/en/inbox` with no view, the "Unassigned 3"
    button pressed and first of the four views; "Assign to…" never selects its row: with the
    newest guest's row selected, opening and closing the oldest row's menu leaves the oldest
    unselected and its thread unopened; agent 1 then has the oldest guest, "Yours").
11. **Waiting now lists Unassigned leads first for a manager.** Agent 1's guest has waited
    longer than a new Unassigned guest. The manager's Waiting now lists the Unassigned guest
    first, then agent 1's; agent 1's Waiting now lists only their own.
    Spec: `apps/saas/tests/assign.spec.ts` (Assign 11; an office of the test's own, each guest
    filed before the next writes: an Unassigned guest, then agent 1's, then a newer Unassigned
    guest, so the manager's expected order (both Unassigned oldest first, then agent 1's) is
    neither oldest-first nor newest-first overall; nameless Zalo guests are listed by their id).
12. **A manager sees "Your turn" only on their own threads** (#212; ADR 0022, amended
    2026-10-06). Four guests wait (each wrote last, and no one has answered): one Unassigned,
    one on agent 1, one on a second manager, and one on the manager.
    - The manager sees "Your turn" on their own thread, and "Waiting" on the Unassigned thread,
      agent 1's and the second manager's: on the thread's row and on its header alike.
    - Agent 1 still sees "Your turn" on their thread: every thread an agent sees is their own.
      The second manager sees "Your turn" on theirs.
    - Only the turn changes: Sent, Won and Lost read as before.

    Spec: `apps/saas/tests/manager-chip.spec.ts` (Assign 12; an office of the test's own with one
    invited agent and two invited managers, nameless Zalo guests given out by the manager through
    the owner API; each row is found under All by searching the guest's id, and its header is the
    thread opened from that row. The chip is `data-test="thread-status"`: "Your turn" with
    `data-status="yourTurn"`, "Waiting" with `data-status="waiting"`, matched exactly, in English
    only (the Vietnamese "Đang chờ" waits on #78). Sent, Won and Lost are not checked here).

## Inbox view tabs (#210; DESIGN.md "View Tabs", ADR 0022)

The Inbox's views are a row of tabs above the thread list, each a label and its count: an agent's
Your turn, Sent and All; a manager's Unassigned, Waiting, Sent and All. The list is the 22rem
panel from `md` (DESIGN.md "Inbox.") and the whole width below it. The panel clips what spills
out of it, so a tab cut off at its edge is as wrong as a row that wraps.

1. **The view tabs fit on one line.** Whatever the counts (two or three digits) and the language
   (English or Vietnamese), the tabs sit on one line:
   - every tab at the same height, each label and count on one line;
   - each tab as wide as its label and count, nothing cut inside it;
   - the whole row inside the list panel, with no sideways scroll;
   - each count in full ("123", never "99+").

   This holds for an agent's three tabs and a manager's four. It holds on a desktop (1280 wide), at
   the 22rem panel (768 wide) and on a phone (390 wide). The worst case is a manager in Vietnamese
   at the 22rem panel.
   Spec: `apps/saas/tests/inbox-tabs.spec.ts` (Inbox view tabs 1; an office of the test's own with one
   invited agent and one invited manager. The guests are setup, written in bulk through the inbox
   store (#222): each wrote once to the office's Zalo OA, some were given to the agent, and the
   agent answered some (a mock send). Two-digit counts: manager 12, 25, 14, 39; agent 13, 14, 27.
   Three-digit counts, on every tab: manager 101, 203, 103, 306; agent 102, 103, 205.
   "On one line" is every tab at the same top and height, with no text in a tab on two lines.
   "Nothing cut" is no tab, nor anything in it, holding more than it shows. "Inside the panel"
   is every word of every tab, and the first and last tab, between the panel's inner edges.
   "No sideways scroll" is nothing between the tabs and the panel being wider inside than it
   shows. The manager's Waiting tab is judged here by its count only: its label is 2's).

2. **A manager's "Your turn" reads "Waiting"** (ADR 0022 amendment, Q15, docs PR #213). A manager's view of
   every guest the office owes a reply is labelled "Waiting N" (VI "Đang chờ N", pending the #78
   review). It is never "Your turn". It holds the same threads: the Unassigned guests and the
   agents' guests still waiting, not the answered ones. Its count is the same office-wide number
   as the nav badge, the tab title ("(N) Inbox", VI "(N) Hộp thư") and the list's count line. An
   agent in the same office still sees "Your turn N" (VI "Đến lượt bạn N"), and no "Waiting".
   Spec: `apps/saas/tests/inbox-tabs.spec.ts` (Inbox view tabs 2, in EN and VI; an office of the test's
   own with two Unassigned guests, one waiting on the invited agent and one the agent answered.
   The manager's tabs read Unassigned 2, Waiting 3, Sent 1, All 4. The nav reads 3, and so do the
   title, and the count line is #208's manager line on Unassigned, "2 unassigned · 3 waiting in the
   office" (VI "2 khách chưa giao · 3 khách đang chờ văn phòng"). Waiting lists exactly the three guests owed a reply. The agent's tabs read Your turn 1, Sent 1, All 2,
   their nav reads 1, and Your turn lists only their guest).

## Hidden kit screens (#210)

A kit screen Nhịp doesn't use yet is hidden (`kit-screens.ts`), not deleted: opening its address
gives the not-found page. The account's Billing page is hidden already.

1. **The office's Billing page is hidden** (ADR 0022 amendment, Q16, docs PR #213; until #198
   builds ADR 0014's billing). The walk office's manager opening `/<locale>/walk/settings/billing` gets what
   the account's hidden Billing page (`/<locale>/settings/billing`) gives: the same status (404)
   and the same not-found page ("404", "Page not found", "Go to dashboard"; VI "Không tìm thấy
   trang", "Về bảng điều khiển"). No plan or Billing heading shows. An agent of the office gets
   the same.
   Spec: `apps/saas/tests/office-billing-hidden.spec.ts` (Hidden kit screens 1; the manager in EN
   and VI, the agent in EN. The account's page is read first, as the reference, and must itself
   be the 404 not-found page. The comparison is of the not-found content, not the page's
   surroundings: the account's settings carry their own menu).

## Inbox polish (#208)

What the UI walk found in a manager's Inbox, as decided by Eyal on #208. A guest with a long name
is a WhatsApp guest whose profile name is 40 characters.

1. **The view tabs stay put.** A manager at a desk switches Unassigned → Waiting → Sent → All
   → back to Unassigned. The view tabs and the search field stay where they were: neither moves
   up or down. (Before #208, the "Showing" filter appeared above the search field in every view
   but Unassigned, and the tabs jumped 44px.)
   Spec: `apps/saas/tests/inbox-polish.spec.ts` (Inbox polish 1; an office of the test's own with
   an invited manager and three Unassigned guests, so no banner another spec raises in an office
   moves the list while it is measured; at 1280×720; "where they were" is the top edge of the
   Waiting tab and of the search field, the same to the pixel in every view as on Unassigned).
2. **A manager's "Assign to…" shows when it's wanted.** On a manager's Unassigned rows, from
   `md` (768px) up:
   - A row that is not selected, not hovered and has no keyboard focus hides its "Assign to…".
   - Pointing at the row shows it; the pointer gone, it hides again.
   - Tabbing onto the row shows it, and the next Tab lands on "Assign to…" itself.
   - The selected row shows it without any pointer or focus.
   - While its menu is open, it stays shown.
   - When it shows, it never covers the guest's name, however long.

   On a phone it shows on every Unassigned row with no pointer, as a 44px target, and doesn't
   cover the name either.
   Spec: `apps/saas/tests/inbox-polish.spec.ts` (Inbox polish 2; an office of the test's own with
   an invited manager and three Unassigned guests with long names, written one, two and three
   minutes ago, so they are listed oldest first. "Not selected" rows are those above a thread
   opened by its `?thread=` link, with the pointer at the window's corner and nothing focused.
   Hover, selection and the name are checked at 1280 and at 768px; keyboard and the open menu
   at 1280. "Focus" is Tab from the search field to the first row; after Assign to…, the next Tab
   reaches the next row, which shows its own while the first hides it. "Selected" is by link and
   by a click on the row, after which the pointer and focus move to the search field. "Never
   covers" is the pill's box and the name's box not overlapping, on the hovered and the selected
   row. The phone is 390×844, its pills at least 44px tall. Before #208 the phone already
   passed: a guard).

3. **The count line under the tabs says what each view holds.** For a manager, per view:
   - Unassigned: "{u} unassigned · {w} waiting in the office"
   - Waiting: "{w} waiting in the office"
   - Sent: "{s} sent · {w} waiting in the office"
   - All: "{a} threads · {w} waiting in the office" ("1 thread" for one)

   u is the Unassigned threads, w the office's Waiting threads, s the Sent threads and a all
   threads. That w counts the Unassigned guests waiting too, as the manager's Waiting tab does,
   is the test author's reading of #208, pending Eyal's confirmation: if w means only the guests
   waiting on agents, every manager line in the spec changes. With
   the "Showing" filter on an operator, the counts are that operator's threads and "waiting in the
   office" becomes "waiting on <their name>". An agent's line is unchanged: "N guests are waiting
   on you" ("1 guest is waiting on you"), the same in every view.
   Spec: `apps/saas/tests/inbox-polish.spec.ts` (Inbox polish 3; an office of the test's own with
   an invited manager and two invited agents, each with a name of their own. Two guests wait
   Unassigned; agent A holds three guests and has answered one through the Inbox; agent B holds
   one, waiting. The office reads u 2, w 5, s 1, a 6, checked first on the view tabs; agent A
   reads 2 waiting, 1 sent, 3 threads, judged on Waiting, Sent and All; agent B is "1 thread · 1
   waiting on <B>". The agents' lines are "2 guests are waiting on you" and "1 guest is waiting on
   you" in each of their views. The wording is #208's, written out in `tests/support/copy.ts`,
   not read from the app's strings).

## Thread layout (#248)

Decided by Eyal on 2026-10-08 (variant D of the thread-layout prototype): an open thread is the
conversation, with the reply box docked under it, and the guest's details beside it. Whether the
details fit beside it depends on the thread's own pane, not the window: the pane is "wide" from
896px (56rem), so the sidebar counts. At 1563 wide with the sidebar open, and at 1366 wide with it
collapsed, the pane is wide; at 1366 with the sidebar open, and on a phone, it is narrow.

**How these run.** The open thread is the page's `article`, its header the `header` inside it.
The guest's details are `data-test="thread-details"`, exactly one wherever they sit; each message
is `data-test="message"`. The CRM status is `crm-status` ("In CRM"); a manager's owner control is
`thread-owner-select`, a combobox named "Assign to…". The reply box is the textbox named "Reply",
and the send button `approve-and-send`. The sidebar is collapsed and expanded with its button
(`sidebar-toggle`, Sidebar 1).

1. **On a wide pane the details sit beside the conversation.** A manager of an office on the mock
   CRM opens a guest's thread at 1563×784 with the sidebar open, and again at 1366×768 with the
   sidebar collapsed. The details are to the right of the conversation: their left edge is at or
   right of every message's right edge, and of the reply box's, and they start below the header.
   "In CRM" and Assign to… are in the details, not in the header.
   Spec: `apps/saas/tests/thread-layout.spec.ts` (Thread layout 1; an office of the test's own on
   the mock CRM with an invited manager and a Zalo guest who wrote once, opened from Unassigned
   once the lead is in the mock CRM and the thread says "In CRM"; "the conversation" is every
   `message`, the auto-reply included; "the header" is the first `header` in the `article`, and
   the details are looked for on the whole page, not only inside the `article`; "in / not in" is
   what a person sees: a copy hidden by CSS counts as absent; the sidebar's state is told by the
   Home link's width, as in Sidebar 1, and collapsed with `sidebar-toggle` before the thread opens).
2. **On a narrow pane the details fold into a strip under the header, and the CRM status and the
   owner move into the header.** The same thread at 1366×768 with the sidebar open: the details
   are under the header and above the first message, at least as wide as the messages' column
   (left edge at or left of each message's, right edge at or right of each's). "In CRM" and Assign
   to… are inside the header, not in the details. Collapsing the sidebar in the same window
   brings the details back beside the conversation, with "In CRM" and Assign to… in them;
   expanding it folds them into the strip again.
   Spec: `apps/saas/tests/thread-layout.spec.ts` (Thread layout 2; set up as in 1; each layout
   after a sidebar change is polled until it holds, the sidebar's width animating).
3. **The reply box is in view without scrolling, on a thread of ten messages.** A guest has
   written ten messages. At 1366×768 with the sidebar open (narrow) and at 1563×784 (wide), the
   thread opens with the reply box and Approve and send wholly inside the window, the page not
   scrolled, and the guest's latest message in view.
   Spec: `apps/saas/tests/thread-layout.spec.ts` (Thread layout 3; the office as in 1, the guest's
   ten Zalo messages written one after the other, the thread opened from Unassigned and nothing
   inside it touched before it is measured. "Wholly inside the window" is the element's box
   within the window, `window.scrollY` 0, and the point at its centre showing the element itself,
   so a pane's scrolling or something docked over it hides it; "the latest message" is found by
   its text, and "in view" adds that it is wholly visible through its scrolling pane (an
   IntersectionObserver ratio of 0.98, a pixel's give) and ends above the reply box. Approve and send already sat in
   the window before #248: the reply box is what was pushed out).
4. **On a phone the details are a strip too.** At 390×844 the thread, opened from the list, has
   its details under the header and above the conversation (the first message, scrolled into
   view, is below them), and the reply box and Approve and
   send wholly inside the window, with the latest message in view.
   Spec: `apps/saas/tests/thread-layout.spec.ts` (Thread layout 4; the office as in 1, opened
   from the list at 390×844. "A strip too" is 2's strip: under the header and spanning the
   messages' column, with the first message, once scrolled into view in its own pane, below it:
   the thread opens at its latest message (3), so on a phone even a guest who wrote once has their
   first message scrolled up under the strip next to the office's auto-reply. Judged on a guest
   who wrote once; the reply box, Approve and send and the latest message are judged as in 3, on
   a second guest who wrote ten messages. The "scrolled into view" step was added by the
   implementer after the first green run, when the phone check found the first message scrolled
   up under the strip; the test author's reading had been "above the first message" as it lies).

5. **A new guest message doesn't pull an operator who is reading older ones** (decided by Eyal on
   2026-10-08, on PR #258). A manager has a guest's thread of ten messages open, at 1366×768 with
   the sidebar open, and scrolls the conversation up to the guest's first message. The guest
   writes again: the conversation stays where it was (the first message has not moved), and a
   "New message" pill (`data-test="new-message-pill"`, a button named "New message"; "Tin nhắn
   mới" in Vietnamese) shows above the reply box. Pressing it brings the new message into view,
   and the pill goes. Scrolled up again, another message from the guest shows the pill again;
   the operator scrolls back down to the latest message themselves, and the pill goes. At the
   latest message, a new message from the guest comes into view on its own, with no pill.
   Spec: `apps/saas/tests/thread-layout.spec.ts` (Thread layout 5; the office as in 1, the guest's
   ten Zalo messages written one after the other, the thread opened from Unassigned and judged at
   its latest message as in 3 before anything is scrolled. Every scroll is the mouse wheel, the
   pointer over a message the person sees, repeated until the target message is in view; scrolled
   up, the latest message must be out of view first, so there is something to pull. "Stays where it
   was" is the first message's top edge, read once it has stopped moving (six readings 50ms apart
   agreeing), within 2px of where it was before the guest wrote, judged after the new message is in
   the thread, and the new message not in view. The pill is looked for on the whole page: visible,
   wholly in the window, a button named "New message", its bottom at or above the reply box's top.
   Pressed, the new message is wholly in view (ratio 0.98) and ends above the reply box, and the
   pill is hidden. "Scrolls back down themselves" is wheeling down until the latest message is in
   view, then the pill hidden. "No pill" at the latest message is judged once the new message has
   come into view. The Vietnamese name "Tin nhắn mới" is not tested.)

## Home (ADR 0002, ADR 0004, ADR 0015)

1. **Waiting now opens the thread.** As the agent, Home lists the guests whose turn it is,
   oldest waiting first and quiet ones last, the same order as the inbox's Your turn. Choosing
   one opens the inbox with that thread selected (on a phone, the thread itself).
   Spec: `apps/saas/tests/home.spec.ts` (Home 1; an office of the test's own, holding a WhatsApp
   number of its own, with one invited agent; five WhatsApp guests, assigned to the agent by an
   invited manager, with explicit write times (30, 20 and 10 minutes ago; 5 and 3 days ago,
   Quiet), sent in another order; Waiting now's order is
   the rule's and the inbox's Your turn order with Quiet opened; "selected" is that guest's thread
   open beside the list, not the first guest's; on a phone, a Quiet guest's thread with no list).
2. **Waiting now lists only what the operator can open.** A thread another agent owns is not
   in agent 1's Waiting now; the manager's lists it.
3. **Nobody waiting.** With every guest answered, Waiting now says "No guest is waiting."
   Spec: `apps/saas/tests/home.spec.ts` (Home 3; an office of the test's own with one invited
   agent and two guests, assigned to the agent by an invited manager and answered one by one
   through the Inbox: Waiting now lists both, then the one left and no empty text, then says "No guest is waiting." and lists no guest).
4. **The nav counts Your turn on every page.** The amber number beside Inbox in the sidebar
   equals the inbox's Your turn count, on Home, the Inbox and Settings alike. Approving a
   reply lowers it; a guest writing in raises it within the inbox's poll. The platform admin
   sees no number. Spec: `apps/saas/tests/nav-count.spec.ts` (Home 4; an office of the test's
   own with one invited agent, so the counts are exact: three guests, each assigned to the agent
   by the office's manager, one approved, so Your
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
   the mock CRM, holding a WhatsApp number of its own, with one invited agent and two guests
   assigned to them, the
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
`SEND_MODE=mock` and a VAPID pair made fresh for each run (`playwright.config.ts`, CI; never committed, #135): Nhịp decides every alert exactly as
it would live, writes one `inbox_alert` row per operator per alert (who, which thread, kind
`guest`, `returned`, `assigned` or `test`, whether it sounded, and its link
`/<locale>/inbox?alert=<the row's own id>`), and sends no push. Reading that log
(`alertState.alerts(officeId)`, through `tests/support/alert-state.ts` in the worker's state
process, like `crm-state.ts`) is looking at the operators' phones; `alertState.devices(userId)` lists an
operator's devices. No test writes the log or a device row.

- **Recipients are exact:** guests write through signed Zalo webhooks to an office of the
  test's own (as in Assigning leads), with two invited agents, an invited manager, a second
  invited manager where a scenario says so, and the platform admin who created it (its kit
  `owner`). A thread is given to an agent through the owner API, as the manager.
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

1. **A new guest alerts the managers only** (#132; ADR 0022). A new guest writes: the log
   holds one sounding `guest` alert for each manager, and none for either agent or anyone
   else. Each alert's link starts with its manager's locale and carries no thread id: `/en/`
   for a manager set to English, `/vi/` for one with no locale set.
   Spec: `apps/saas/tests/alerts.spec.ts` (Alerts 1, rewritten; two managers, the first set to
   English through the kit's user update).
2. **An owned thread's guest alerts only its owner** (#132). The manager assigns a new guest to
   agent 1, and the guest writes again: one new `guest` alert, for agent 1. Agent 2 and the
   managers get none for that message.
   Spec: `apps/saas/tests/alerts.spec.ts` (Alerts 2, rewritten).
3. **An assignment alerts the chosen agent, with a bell row** (#133).
   - The manager assigns an Unassigned guest to agent 1 through "Assign to…". The log holds
     one `assigned` alert, for agent 1 only. Agent 1's bell shows "A manager gave you a
     thread", with no guest's name, and it opens the thread.
   - Reassigning the thread to agent 2 makes one `assigned` alert, for agent 2. Agent 1, who
     lost it, gets no alert but a bell row naming the guest: "Minji was moved to another
     agent". It doesn't say to whom (ADR 0022, P4).
   - A manager who gives a thread to themselves gets no alert and no bell row.
   - No email: Vitest on the kit producer, since E2E can't read mail.

   Spec: `apps/saas/tests/alerts-in-app.spec.ts` (Alerts 3; the guest is a WhatsApp guest named
   "Minji"; both agents set to English through the kit's user update and given names of their
   own, so the row's "Assign to…" menu names agent 1 and agent 2's name can be looked for in
   agent 1's bell. The first assignment is the manager's row "Assign to…" in Unassigned; the
   reassignment and the manager taking a thread (Yuki) go through the owner API. The log is
   judged per thread as an exact count of each person's alerts of each kind (the manager's
   `guest` alert from before included), once a later guest's alerts have reached the managers;
   the manager's own assignment is judged once a later assignment's alert has reached agent 1.
   The bell is read on Settings loaded afresh, where no guest's thread is listed, so "no guest's
   name" is no "Minji" on the page with the bell open; "opens the thread" is the row taking
   agent 1 to the Inbox with Minji's message in the open thread; "not to whom" is agent 2's name
   nowhere on agent 1's page).

4. **A thread returned to Unassigned alerts the other managers** (#133). Manager 1 returns
   agent 1's thread to Unassigned. The log holds one `returned` alert, for manager 2. There is
   none for manager 1, who returned it (whoever acts is never alerted for it), none for either
   agent, and none for the platform admin. Agent 1, who lost the thread, gets only the bell
   row naming the guest, with no push. This follows from recipients equalling visibility
   (ADR 0022, S2).
   Spec: `apps/saas/tests/alerts-in-app.spec.ts` (Alerts 4; two managers; the guest is a
   WhatsApp guest named "Minji", given to agent 1 and returned by manager 1 through the owner
   API; the thread's alerts are exactly each manager's `guest` alert from before, agent 1's
   `assigned` alert and manager 2's `returned` alert, judged once a later guest's alerts have
   reached the managers, and the platform admin has none in the office; agent 1, with no
   language set, reads the bell in Vietnamese: "Minji đã được chuyển cho nhân viên khác").
5. **A vendor retry alerts no one** (#132). The same signed Zalo message is delivered
   twice: the thread holds that message once, and the log holds one alert per recipient, not two.
   Spec: `apps/saas/tests/alerts.spec.ts` (Alerts 5; one signed body, same `msg_id`, posted twice).
6. **A burst makes one sounding alert** (#132). A new guest writes five messages within 20
   seconds, two of them at the same moment: each manager has exactly one sounding alert on
   that thread; the rest are silent replacements. (The 2-minute window itself is a Vitest rule
   with an explicit clock.)
   Spec: `apps/saas/tests/alerts.spec.ts` (Alerts 6).
7. **The platform admin is never alerted** (#132). In an office of its own, a new guest writes.
   The manager assigns the thread to an agent, and the guest writes again. The manager and the
   agent have their rows; the platform admin, the office's kit `owner`, has none.
   Spec: `apps/saas/tests/alerts.spec.ts` (Alerts 7).
8. **An alert for a thread now someone else's shows a neutral notice** (#136).
   - Agent 1 holds a thread, and its guest writes, so agent 1 has a `guest` alert. The manager
     then reassigns the thread to agent 2.
   - Agent 1 opens that alert's link. The Inbox says "A colleague is answering this guest"
     ("Một đồng nghiệp đang trả lời khách này") and shows nothing of the thread: no guest
     name, message or pipe on the page. The queue is usable beside it.
   - Agent 2 opening agent 1's alert link, or anyone opening an alert id that never existed,
     gets the same notice.
   - A manager's own link to that guest still opens the thread.

   Spec: `apps/saas/tests/alerts-in-app.spec.ts` (Alerts 8; the guest is a WhatsApp guest named
   "Minji", so a name can be missing; agent 1 also holds an older Zalo guest who heads their
   queue, so an Inbox that opens the first guest can't pass the positive control; each link is
   the one in the log, followed as logged (Vietnamese: invited operators chose no language), and
   the made-up id is followed at `/en/`. "Nothing of the thread" for agent 1 is no visible guest
   name, message text or "WhatsApp" anywhere on the page; for agent 2, who now holds the thread
   and lists it, it is the notice with the thread not opened and nothing to send. "Usable" is
   the older guest's row opening their thread beside the notice. Agent 1's own link opened while
   they hold the thread, and the manager's own link after the reassignment, open it; no
   address, after any link, carries the thread id).

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

   Spec: `apps/saas/tests/alerts-device.spec.ts` (Alerts 9; each test is one invited agent of an
   office of the test's own, on `/en/inbox`. The panel is `data-test="alerts-panel"`, whatever it
   says. The permission stub sets `Notification.permission`, `requestPermission`, the Permissions
   API's and the push manager's permission state alike, and counts every `requestPermission` (and
   a `pushManager.subscribe` while not granted) as a prompt: zero on load and on reload, and at
   least one once "Turn on alerts" is tapped, which proves the count. The pill is one button,
   Dispatch Blue #2563eb, fully rounded. "Nothing red" is no painted colour (text, background,
   visible border, outline, SVG fill and stroke, each read back through a canvas so `oklch` counts)
   within reach of #dc2626, #f87171 or the theme's `--destructive`, judged on the asking, alerts
   stopped, blocked and iPhone panels. Not now: gone, gone after a reload, still gone with the
   page's clock 6 days on, back 7 days and a minute on (`page.clock`); "another browser" is the
   same agent signed in through the login page in a new context. iPhone: the iPhone 15 Safari user
   agent on Chromium at a desktop size, once with no Notification API (as Safari has it outside
   the Home Screen) and once with permission "default". On: with "granted" and no device the panel
   says "Alerts stopped on this device." with the pill and Not now; after the device is added and
   the page reloaded, no panel, none of its titles and no pill. An absence after a load is judged
   once the Inbox's empty list has shown).

10. **Signing out removes the device** (#134). An agent signs in with a login of the test's
    own (signing out ends the session it uses), adds a device as above, and adds a second one
    from a second signed-in context. They sign out through the user menu in the first:
    `alertState.devices` lists only the second. `DELETE /api/alerts/devices` answers 401 signed
    out.
    Spec: `apps/saas/tests/alerts.spec.ts` (Alerts 10; an office of the test's own with one
    invited agent, who accepted the invitation in the first browser and signed in
    through the login page in the second; "only the second" is the second device's id alone,
    so removing nothing and removing every device both fail; the signed-in second browser's
    same `DELETE` answering 204 is the positive control).
11. **Send test alert** (#135). With permission "granted" and a device added for this
    session, Settings → Notifications' "This device" row says alerts are on; "Send test alert"
    writes one `test` alert for that operator and says it was sent. The same through the API:
    `POST /api/alerts/devices/test` → 202; signed out, 401; with no device on this session,
    409 and the row offers to turn alerts on instead.
    Spec: `apps/saas/tests/alerts-device.spec.ts` (Alerts 11; one invited agent of an office of the
    test's own, on `/en/settings/notifications`, permission "granted" by the same stub as Alerts 9.
    "One `test` alert" is counted in the office's log for that agent: the anonymous 401, then the
    signed-in 202, after which there is one, then the button, after which there are two. "No device on
    this session" is the same agent signed in again in a second browser while their first browser
    has a device: that session's request answers 409, its row says "Alerts are off for this
    device." with "Turn on alerts" and no "Send test alert", the log still has no test alert, and
    the first browser's 202 then makes exactly one).
12. **While Nhịp is open, the tab and a toast say so** (#136). An agent is on Settings, and a
    guest on a thread assigned to them writes.
    - Within the poll, the tab title reads "(n) <Page> – Nhịp": the count in front of the page's
      own title, on every page ("(2) Home – Nhịp", "(2) Inbox – Nhịp"; ADR 0019, amended
      2026-10-06, #212), where n is the nav's Your-turn count, and one toast says "Minji is
      waiting".
    - The same guest writing again replaces the toast; it doesn't add a second one.
    - Four of their guests show at most three toasts. Tapping one opens that thread.
    - On the Inbox list, the tab title changes and no toast shows.
    - A guest on a colleague's thread raises neither, and neither does a new Unassigned guest.
    - As the manager on Settings, a new guest raises the toast.
    - **An assignment raises a toast for the new owner** (Eyal, 2026-10-05). Agent 1 is on
      Settings and a manager gives them a waiting guest: one toast says "Minji was assigned to
      you" (VI "Minji đã được giao cho bạn"; a nameless guest "A guest was assigned to you", VI
      "Một khách đã được giao cho bạn"), with the same rules: one per guest, at most three, a tap opens the
      thread. The manager then reassigns Minji to agent 2, also on Settings: agent 2 gets the
      toast, and agent 1 gets none and loses theirs. The manager who assigns is not toasted, and
      a thread returned to Unassigned toasts no one.

    Spec: `apps/saas/tests/alerts-in-app.spec.ts` (Alerts 12; named guests write on WhatsApp,
    since a Zalo guest has no name, and one nameless Zalo guest gives "A guest is waiting" with
    "Zalo" under it. In the "is waiting" tests every guest is assigned before the operator's page
    loads, so the guests already waiting raise nothing. The assignment test gives Minji, who wrote
    35 seconds earlier, to agent 1 on Settings ("Minji was assigned to you", one toast, "WhatsApp"
    under it), then to agent 2 on Settings (agent 2's toast; agent 1's goes, judged after agent
    2's has shown), and taps agent 2's; the manager, on Settings throughout, never shows an
    assignment toast; returning Minji to Unassigned is judged by agent 2 having no toast and agent
    1 exactly one, once agent 1, given a nameless Zalo guest after the return, shows "A guest was
    assigned to you".
    The title is "(n) " in front of the page's own title beside the nav's number on the Inbox,
    Home and Settings, in English and Vietnamese, and after Settings → Inbox through the nav; each
    page's own title, read before any guest, is "<Page> – Nhịp" (an en dash), and with nobody
    waiting the title is that again. A toast is `data-test="guest-toast"`, a link named
    "<guest> is waiting", in the window's top-right quarter. Each absence is judged once a later
    toast has shown: one Minji toast after she wrote twice, none for agent 2's guest or a new
    Unassigned guest, and at most three, the fourth replacing the first. Toasts that outlive
    several polls show they don't auto-dismiss. Tapping one opens that thread with no thread id
    in the address, and leaves no toast. On the Inbox list, a guest answered and writing again
    raises the title and no toast. The manager is on Home, with a guest of agent 1's (no toast),
    a new Unassigned guest and a guest they hold (a toast each); their title follows their nav
    number. Closing a toast and a guest's answer clearing it are not tested).

13. **Settings → Notifications says what it is for** (#212). An operator opens Settings →
    Notifications. Under the "Notifications" heading, the page's one intro line reads "Choose
    what reaches you in Nhịp." (VI, under "Thông báo": "Chọn những gì đến với bạn trong Nhịp.",
    to be reviewed in #78). The kit's "Choose how you receive notifications. Disabled options are
    stored; everything is enabled by default." (VI "Chọn cách bạn nhận thông báo. …") is nowhere
    on the page.
    Spec: `apps/saas/tests/notifications-intro.spec.ts` (Alerts 13; the seeded agent on
    `/en/settings/notifications` and `/vi/settings/notifications`; "under the heading" is the
    line being the paragraph that follows the heading in the page's main area; "one intro line"
    is judged only as the kit's sentence being gone).

## First greeting (ADR 0021, spec #159)

**How these run.**

- E2E runs with `SEND_MODE=mock` and no `DRAFT_*` key, so every auto-reply is the fixed
  template, sent as a mock send. Reading the thread as the manager is looking at the guest's
  phone.
- E2E runs the model layer (ADR 0024) against a deterministic stub model, not a real one
  (`MODEL_STUB` in `.env.e2e`; production refuses it). The stub answers through the same
  layer, so the office's daily caps and the log line apply.
  - **Translation is on** (`MODEL_STUB=translate`). A guest message's translation line reads
    "Stub translation, ‹guest language› to ‹operator language›.", for example "Stub
    translation, Korean to Vietnamese.", and never repeats the guest's words.
  - **Drafting is built but off** until the trigger ticket (#252) moves the model's draft to
    after the office's first human reply (`MODEL_STUB=draft,translate` then). Until then every
    suggested reply in E2E is a template. Once on, the stub's suggested reply reads "Thanks
    for your message. I'll look into it and come back to you here." ("Suggested reply · AI");
    a guest whose last message asks about the pink book (or sổ hồng) gets one the post-check
    blocks, so the template stands ("Suggested reply · template").
- The model's path is proven in Vitest (the post-check, the caps, the timeout and retry, the
  log line, the request's zero-retention routing and each task's model), by the greeting test
  set run by hand, and on staging (`docs/setup-checklist.md`).
- Guests write through signed Zalo webhooks to an office of the test's own, named "Saigon
  Prime Test", with a manager and an invited agent. The auto-reply is on, because that is the
  default.

1. **A new guest is greeted at once, and it's still their turn.** A guest writes in English,
   "Hi, we're looking to rent an apartment in Tay Ho". Within seconds the thread holds a
   second message, from the office.
   - **What it says.** It thanks the guest and acknowledges renting in Tây Hồ. It asks about
     budget and move-in time (R3's order, two at most) and contains no digit. Its last line
     reads "Auto-reply from Saigon Prime Test: a colleague will continue with you right
     here."
   - **Its meta line** carries "Auto-reply", "Template" and the mock badge.
   - **The queue doesn't move.** The thread is still Your turn and has no owner. The nav count
     includes it, and Sent is 0.
2. **Only the first message is greeted.**
   - The guest writes again: no second auto-reply, so the thread holds exactly one.
   - A new guest's first two messages, delivered at the same moment, get one auto-reply.
   - A thread whose first message came from the office's own app (an `oa_send_text` echo)
     gets no auto-reply when the guest then writes.
3. **The greeting counts nowhere in the funnel.**
   - After the auto-reply, Home reads Leads in 1, Engaged 0, In conversation 0, and no
     answered leads under response time.
   - The guest writes back before any human reply: still In conversation 0.
   - The manager approves a reply: Engaged 1, and the response time runs from the guest's
     first message to that reply.
   - The guest writes again: In conversation 1.

   Spec: `apps/saas/tests/first-greeting.spec.ts` (First greeting 3; the guest writes on a
   WhatsApp number of the office's own, since only WhatsApp takes a backdated message: their
   first message is written 20 minutes before the manager's reply, approved through the API, so
   "runs from the first message" is that answered lead in Home's 15–60 min band with none under
   5 min, which a clock started at the guest's later message would not give; "no answered leads"
   is Response time's "No lead was answered in this window yet."; the guest's last message is
   written once the reply's second is over, WhatsApp timing messages in whole seconds).

4. **The guest's language picks the greeting.** Guests write in Vietnamese, Japanese, Korean
   and Russian. Each auto-reply, label included, is in the guest's language: a letter only
   Vietnamese uses, kana, Hangul or Cyrillic. A guest writing "Bonjour, je cherche un
   appartement à louer" is greeted in English, and so is one writing in Spanish ("Hola, busco
   un apartamento, está disponible?").
5. **A manager turns the auto-reply off.**
   - In the office's settings, the manager switches the auto-reply off. A new guest then gets
     no auto-reply, and the reply box holds today's first-reply template.
   - Switched back on, the next new guest is greeted. A guest whose thread began while it was
     off writes again and is not greeted (S1).
   - An agent sees no switch, and its API refuses an agent (403) and a signed-out caller
     (401).
6. **No greeting on a disconnected pipe.** With the office's Zalo OA disconnected, a new
   guest's first message arrives and is Your turn, with no auto-reply.
7. **The greeting's echo is not a reply.** Zalo delivers the `oa_send_text` echo of the
   auto-reply, with the auto-reply's message id. The thread still holds one auto-reply and
   no app reply, stays Your turn, and Home's Engaged stays 0.
   - In a mock deployment the auto-reply's message id is deterministic,
     `mock-auto-reply-<thread id>`. The test reads the thread id as the manager, through
     `/api/conversations`.
8. **After the greeting, the reply box doesn't greet again.** The manager opens a guest's
   thread after its auto-reply. The reply box holds the follow-up template (E2E has no
   model), never the first-reply template's "Thanks for writing". The guest writes again,
   and the box still holds the follow-up template.
   - With a model configured, it would hold the model's follow-up draft. That case is
     covered by Vitest.

   Spec: `apps/saas/tests/first-greeting.spec.ts` (First greeting 8; "the follow-up template" is
   what the reply box holds, as the manager opens it, on another guest's thread who wrote the
   same, was greeted, got a human reply and wrote the same again; the greeted guest's box must
   hold exactly that, never text matching "Thanks for writing", on opening the thread and again,
   reopened, after the guest's second message).

## Guest language (ADR 0021 R4 as amended by #245, ADR 0025)

A guest who writes in a language Nhịp doesn't support is named in that language, with a note
that it isn't supported, instead of reading as English. What the guest gets is unchanged: the
English greeting and an English suggested reply. Their messages aren't translated.

**How these run.** As First greeting: guests write through signed Zalo webhooks to an office of
the test's own, with a manager and an invited agent, the auto-reply on and `SEND_MODE=mock`.
Translation runs against First greeting's stub model, so a supported language's message shows a
stub translation line and an unsupported one must show none; drafting is off, so the reply box
holds a template. Each test's office is left at the default office language, English (ADR 0025,
Office language). The VI copy is pending a native read (#78).

1. **A guest writes in French: the thread names French and says it isn't supported.** A guest
   writes "Bonjour, je suis française. Je cherche un 3 bedroom to rent à Ba Dinh, budget
   $3000/month." The manager opens the thread.
   - **The details' Language row** reads "French · not supported, replies in English". In VI:
     "tiếng Pháp · chưa hỗ trợ, trả lời bằng tiếng Anh". It never reads "English" alone.
   - **The message** shows "French isn't supported: no translation" where a translation would
     sit, under the guest's text. In VI: "Chưa hỗ trợ tiếng Pháp: không dịch".
   - **The operator note**, one line beside the reply box (#248), says the reply is in English
     and names French: "in English · French isn't supported · don't interview". In VI: "bằng
     tiếng Anh · chưa hỗ trợ tiếng Pháp · đừng hỏi thêm kiểu phỏng vấn".
   - **What the guest gets is English.** The auto-reply is the English template, label
     included ("Auto-reply from …: a colleague will continue with you right here."). The reply
     box holds the English follow-up template ("Thanks for your message. A colleague will get
     back to you here shortly.").
   - **A mixed second message** ("Oui, merci ! Photos please, and is a viewing possible this
     Saturday?") also shows the no-translation note: the thread's language decides, not each
     message.
   - **Home's Waiting now** names the guest's language as "French" (VI: "tiếng Pháp"), not
     "English".

   Spec: `apps/saas/tests/guest-language.spec.ts` (Guest language 1; once in `/en/` and once in
   `/vi/`, each with an office of its own and a manager, no agent: nothing here is an agent's.
   The manager opens the thread by its `?thread=` link. The Language row is the term "Language"
   and the value beside it in the guest's details (`data-test="thread-details"`), matched exactly
   on a wide pane (1563×784, the rail) and on a narrow one (1366×768, the strip). "Under the
   guest's text" is the guest's bubble (`data-test="message"`) reading their text, then the note;
   the note is in exactly two bubbles, the first message's and the mixed one's, never the
   auto-reply's, and neither guest bubble holds a translation (its "Translation" label). The
   operator note is the open thread's one paragraph labelled "Operator note" (VI "Ghi chú nội
   bộ"), reading exactly the scenario's line after that label. What the guest gets is checked
   first and stops the test: the auto-reply (read as the manager, through the API) starts "Thanks
   for writing" and ends with the English label, marked Template, and the reply box holds the
   English follow-up exactly. Home's entry is judged by its link's name: it holds "French" (VI
   "tiếng Pháp") and not "English" (VI "tiếng Anh")).

2. **A guest writes in Korean: the thread reads as before.** A guest writes "안녕하세요, 서호에서
   방 두 개짜리 아파트를 월세로 찾고 있어요." The Language row reads "Korean" with no note, no
   message shows a "isn't supported" note, the operator note reads "in Korean · don't interview",
   and the auto-reply is in Hangul. Home's Waiting now names "Korean".
   Spec: `apps/saas/tests/guest-language.spec.ts` (Guest language 2; in `/en/` only. The Language
   row in the guest's details reads exactly "Korean"; the operator note, read as in Guest
   language 1, reads exactly "in Korean · don't interview"; "no note" is nothing in the open
   thread reading "isn't supported", "not supported" or "chưa hỗ trợ", judged once the row and
   the operator note have shown; the auto-reply and its label hold Hangul and the label isn't the
   English one; Home's entry names Korean and not English. The stub translation is not checked.
   It passed before Guest language 1 was built: a guard against the change reaching supported
   languages).

## Office language (ADR 0025, #256)

An office works in one language, English or Vietnamese, which its manager sets. Guest messages
are translated once, into it. An office whose manager hasn't set one is in English (decided by
Eyal on 2026-10-08).

**How these run.** As First greeting: offices of the test's own, never the walk office (a
changed language would reach every other spec), each with a manager and an invited agent, guests
writing through signed Zalo webhooks, and translation against the stub model ("Stub translation,
Korean to Vietnamese."). The setting's VI copy is pending a native read (#78).

1. **The manager sets the office language.** The manager opens the office's settings, General
   tab. An "Office language" setting (VI "Ngôn ngữ văn phòng") reads "English": no manager has
   set one yet. The manager chooses "Tiếng Việt". A toast says "Office language saved", and after
   a reload the setting still reads "Tiếng Việt".
   Spec: `apps/saas/tests/office-language.spec.ts` (Office language 1; the setting is the
   General tab's combobox named "Office language", its value read within the trigger's text (the
   trigger also holds its arrow) as "English" and not "Tiếng Việt", then the reverse; both options
   are offered; the toast is the exact text "Office language saved"; after the reload, the `/vi/`
   page's combobox named "Ngôn ngữ văn phòng" reads "Tiếng Việt" too. The VI toast is not
   checked, nor that there is no Save button: the toast and the reload prove it saved on choice).
2. **An agent can't set it.** The agent's General tab doesn't exist for them (Team 8's
   not-found page). The office language API refuses the agent's change
   (`PUT /api/office/language` with `{ "language": "vi" }`, 403) and a signed-out caller's
   (401), and the language is unchanged. The agent can read it
   (`GET /api/office/language` answers `{ "language": "en" }`): their open thread shows its
   translations in it.
   Spec: `apps/saas/tests/office-language.spec.ts` (Office language 2; the not-found page is
   Team 8's: 404, "Page not found", no "Office language" on it; the PUTs carry the app's Origin
   and follow no redirect; "unchanged" is the manager's and the agent's `GET` both answering
   `{ "language": "en" }` after the refusals; "their open thread" is a Korean guest the manager
   gave the agent, opened by its link in `/vi/`, so the line into English, and none into
   Vietnamese, shows the office deciding rather than the agent's interface. The agent's
   not-found half held before #256: a guard).
3. **The platform admin's page for an office doesn't show it.** As the platform admin, Admin →
   Organizations → the office shows no "Office language" (VI "Ngôn ngữ văn phòng") anywhere on
   the page, and the office language API refuses the platform admin (403), as the inbox does.
   Spec: `apps/saas/tests/office-language.spec.ts` (Office language 3; `/en/admin/organizations/<id>`
   with no "Office language" and `/vi/…` with no "Ngôn ngữ văn phòng", nor a combobox so named,
   judged once the office's Connections card has shown. The API's `GET` and `PUT` both answer 403;
   the `PUT` sends `{ "language": "en" }` only: the platform admin's session may name the walk
   office, and a build that wrongly took it must not move the walk office for every other spec.
   The page half held before #256: a guard).
4. **One translation, in the office language.** The manager sets the office to Vietnamese.
   - A guest writes in Korean: the open thread shows the translation line "Stub translation,
     Korean to Vietnamese.", and no line into English. It reads so in `/en/` too: the
     translation follows the office, not the reader's interface.
   - A guest writes in Vietnamese: their message shows no translation line.
   - In an office left at the default, a Korean message shows "Stub translation, Korean to
     English.", in `/vi/` too.

   Spec: `apps/saas/tests/office-language.spec.ts` (Office language 4, two tests, each with an
   office of its own; the manager sets Vietnamese through `PUT /api/office/language` (setup: 1
   proves the setting). The line is looked for in the guest's bubble (`data-test="message"`),
   within a poll; "no line into English" is no "Stub translation, … to English." anywhere in the
   open thread, the auto-reply's bubble included; the thread is opened by its `?thread=` link in
   `/vi/`, then in `/en/`. The Vietnamese guest writes first and their thread is opened once
   before the Korean line is awaited; "no translation line" is judged on reopening it in `/en/`
   after the Korean line has shown: neither the "Translation" label nor any "Stub translation" in
   their bubble. The default office's Korean thread is read in `/vi/`: the English line, and no
   line into Vietnamese).

5. **After a change, an older thread is translated when it's opened.** In an English office, a
   guest writes in Korean, and the thread shows "Stub translation, Korean to English.". The
   manager switches the office to Vietnamese. Opening that thread again shows "Stub translation,
   Korean to Vietnamese." (a model call then, counted against the office's daily translation
   cap); the English line doesn't show.
   Spec: `apps/saas/tests/office-language.spec.ts` (Office language 5; read in `/en/` both times,
   so an interface-led line can't pass the second read; the switch is the manager's `PUT`, as in
   4; "opening again" is leaving for Home and opening the thread by its link; the new line within
   a poll, and no "… to English." line anywhere in the thread. Not judged: the daily cap's count,
   which nothing a person sees shows).

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
   - It asks for a **Reason** (required): "The guest asked to be deleted", "Duplicate or spam",
     "Test data" or "Other". "Delete guest data" is disabled until one is chosen.
   - It has a "Note (optional)" box, up to 500 characters, with the hint "Don't include the
     guest's name or contact details." With "Other" the box is "Note" and required: "Delete
     guest data" stays disabled, saying "Add a note for "Other".", until the note has text.
   - The deletion's receipt keeps the reason and the note (see 10).

   Confirming does three things:
   - The thread leaves the manager's Inbox under every view and every owner filter, and a
     search for the guest finds nothing.
   - The agent's Inbox drops it too, and so does the nav count.
   - `GET /api/conversations/:id` answers 404 for both.

   The toast says "Guest data deleted".

   Spec: `apps/saas/tests/guest-deletion.spec.ts` (Guest deletion 1; the manager assigns both
   guests to the agent; the reply goes to the first message before the guest's other two, and the
   second guest waits on the agent so every absence is judged on a loaded Inbox; "red" is what the browser paints red (fill, text, border or icon):
   the confirm button is, nothing else in the dialog is, and neither is the menu item (ADR 0020,
   Q5); the agent's open Inbox and nav count drop within the poll; "every owner filter" is each
   option of the manager's Showing filter. The manager confirms with Other and a note: the
   confirm is disabled with no reason, and with Other while the note is empty or only spaces
   (the spaces being this spec's reading of "has text"); the four reasons are offered; the red
   check runs with the reason and note given; the receipt keeps `other` and the note as typed,
   which holds no contact details).

2. **Home's numbers don't move when a guest is deleted.** Three guests write. The agent answers
   two of them, and one of those two writes back. Note Home's
   numbers:
   - Leads in, Engaged and In conversation;
   - the median, the 90th percentile and every response-time band;
   - each day of leads by day.

   The manager deletes the guest who wrote back. Home, reloaded, shows every one of those numbers
   unchanged, for the agent and the manager alike. Waiting now no longer lists a deleted guest.

   Spec: `apps/saas/tests/guest-deletion.spec.ts` (Guest deletion 2; the numbers are first
   checked to be 3 leads in, 2 engaged, 1 in conversation, 2 answered under 5 minutes, so a
   deletion that shrank them would show; each day of leads by day is read from the chart's
   tooltip, stepping through it from the keyboard, one reading per day of the window, adding up
   to Leads in; Waiting now still lists the guest nobody answered. Not provable here: every reply
   is sent within a minute of the guest's message, since Zalo's signature refuses a backdated
   timestamp, so the median and 90th percentile read "0 min" with or without the deleted guest,
   and every lead falls on today.)

3. **An agent can't delete.** On the agent's own thread, the header offers
   no "Delete guest data". `POST /api/conversations/:id/deletion` as the agent answers 403, with
   `deleteInCrm` true or false. The thread and its messages are unchanged afterwards, for the
   agent and the manager.
   Spec: `apps/saas/tests/guest-deletion.spec.ts` (Guest deletion 3; 403 `{ error: "forbidden" }`
   with a full body (a reason given), and also with no reason or no body, since the agent is
   refused before the body is read; the manager's header
   on the agent's thread has Thread actions, the positive control; "unchanged" is the thread
   still opening for both, with the guest's message and the agent's reply. An Unassigned thread
   is not checked: agents can't open one, ADR 0022).
4. **The platform admin can't delete.** As the platform admin, owner of the office, the same
   `POST` answers 403 and the thread is unchanged. Signed out, it answers 401. As a manager of
   another office it answers 404, even with no reason (404 before the body's 400).
   Spec: `apps/saas/tests/guest-deletion.spec.ts` (Guest deletion 4; "a manager of another
   office" is the walk office's manager; every request carries a reason, and the office's own
   manager's same request then deletes the thread, so the refusals were about who asked).
5. **The CRM box is ticked when Nhịp created the lead.** The office is on the mock CRM. A new
   guest writes, and the thread says "In CRM"; the mock CRM holds the lead Nhịp made.
   - The manager's dialog has "Also delete <guest> in Mock CRM", ticked. Confirming leaves no
     lead for that guest in the mock CRM, and the toast says "Guest data deleted. Also deleted in
     Mock CRM."
   - For a second guest, the manager unticks the box before confirming. The thread is gone, the
     lead is still in the mock CRM, and the toast says "Guest data deleted. The lead stays in
     Mock CRM."
6. **The CRM box is unticked when Nhịp found the lead.** The office is on the mock CRM, and
   `addMockCrmLead` puts a lead with the guest's Zalo id in it first. The guest writes, and the
   thread says "In CRM", and the mock CRM still holds only that lead for the Zalo id (Nhịp
   found it and made none).
   - The manager's dialog has the box unticked. Confirming keeps the lead in the mock CRM
     unchanged, while the thread is gone.
   - For a second such guest, ticking the box deletes the lead.
7. **No CRM, no checkbox.** In an office with no CRM, the dialog has no CRM checkbox (as in 1),
   and the deletion API, given `deleteInCrm: true`, deletes the thread and touches no CRM.
   Spec: `apps/saas/tests/guest-deletion.spec.ts` (Guest deletion 7; the dialog says nothing
   about a CRM, and Cancel deletes nothing; "touches no CRM" is the answer's `{ crm: null }`, no
   lead in the mock CRM for the office, and a receipt with no CRM and no CRM result; the API's
   reason, `test_data`, is on the receipt, with `note: null`).
8. **Not while a reply is sending.** `holdReplySending` holds the agent's approved reply in
   "sending":
   - The manager's "Delete guest data" is disabled with "A reply is still sending".
   - `POST /api/conversations/:id/deletion` answers 409 with `reply_sending`.
   - The thread is unchanged.

   Once the helper's release step marks the reply sent, deleting works.
   Spec: `apps/saas/tests/guest-deletion.spec.ts` (Guest deletion 8; the reason is judged shown
   while the menu is open; "deleting works" is the manager's dialog after the release, the thread
   then 404 and gone from every view and owner filter).

9. **A guest who writes again is a new guest.** After the manager deletes a guest on the mock
   CRM with the box ticked, the same Zalo user writes again (a new message id). The thread is
   fresh:
   - It is Unassigned, shows the new message and its auto-reply, and is waiting (the manager's
     chip reads "Waiting", ADR 0022); neither agent sees it.
   - Home's Leads in counts it as one more lead.
   - The mock CRM holds one lead for that guest again: a new one.

   Spec: `apps/saas/tests/guest-deletion.spec.ts` (Guest deletion 9, with no CRM only: the
   ticked box and the new lead come with the CRM box, #139. The guest was the agent's and
   answered before the deletion, so the fresh thread is told from the old one: it shows the new
   message, not the old one or the agent's reply. The auto-reply is not checked; the office has
   one agent, who neither lists nor opens (404) the fresh thread; Leads in is read from the
   manager's Home before and after).

10. **The record names no guest.** After deletions with the box ticked, unticked and with no CRM,
    `guestDeletionRecords` returns one receipt per deletion:
    - each with the manager's name, a time, the message and reply counts;
    - the reason the manager gave (`guest_request`, `duplicate_or_spam`, `test_data` or
      `other`);
    - the note, with every phone number and email masked on the server before saving
      (`[phone]`, `[email]`), or none when no note was given;
    - the CRM result: `deleted`, `unlinked`, or none.

    No value in any receipt or lead tally contains the guest's name, their Zalo user id, the
    thread's id or the CRM lead's id, nor a phone number or email typed into the note.

    `POST /api/conversations/:id/deletion` (`{ deleteInCrm, reason, note? }`) answers 400 with no
    reason, an unknown reason, or `other` with no note (empty or only spaces counting as none),
    and deletes and records nothing.
    Spec: `apps/saas/tests/guest-deletion.spec.ts` (Guest deletion 10, the deletions with no CRM
    only; the ticked and unticked ones come with the CRM box, #139. Two deletions, one through the
    API (`duplicate_or_spam`, no note, after its five 400s: the thread still opens and there is no
    receipt) and one through the dialog (`guest_request`, a note with "0912 345 678" and an email
    and no other digit): each receipt has the manager's id and name, a time within the test, its
    messages (the reply included) and replies, its reason, and no CRM; the API's note is null, the
    dialog's holds `[phone]` and `[email]` and no run of three digits, no `@` and no part of the
    email; one lead tally per deleted guest (ADR 0020), so the identifier check has something to
    read; no message text either, ADR 0020 keeping no free text.)

## Sidebar (#234)

From `lg` (1024px) up, the sidebar is a column that collapses to a 48px icon strip and expands
back. It already could, by ⌘B (Ctrl+B off a Mac) and by the thin rail on its edge, and it
remembers the choice in a cookie. #234 (decided by Eyal 2026-10-07) adds a visible button and
makes the strip readable. Below `lg` the sidebar is a sheet behind a 56px top bar, unchanged.

**How these run.** "Collapsed" and "open" are told by size, not by labels: on the strip the
Home link is at most 48px wide, open it is at least 150px. The width animates, so it is polled.
The shortcut a tooltip names follows the person's computer, so each test that reads it runs as a
Mac and as Linux (CI's), every signal a page can read (user agent, `navigator.platform`,
`navigator.userAgentData.platform`) pinned to that computer: Playwright's desktop Chrome sends a
Windows user agent while `navigator.platform` reports the host. A tooltip is read with the real
pointer, after resting on the page's heading until no tooltip is open.

1. **A button collapses the sidebar and expands it, and says how.** Open, a button sits in the
   sidebar's header on the bell's row, named "Collapse sidebar"; pointing at it shows "Collapse
   sidebar (⌘B)" on a Mac, "Collapse sidebar (Ctrl+B)" elsewhere. Pressing it collapses the
   sidebar to the strip. The button stays, at the top of the strip, above Home, now "Expand
   sidebar", its tooltip "Expand sidebar (⌘B)" / "(Ctrl+B)". Pressing it again opens the sidebar.
   Spec: `apps/saas/tests/sidebar.spec.ts` (Sidebar 1; the seeded agent on Home, as a Mac at 1280
   wide and as Linux at exactly 1024, `lg` itself; the button is `data-test="sidebar-toggle"`,
   since the rail is a button with the same names; "on the bell's row" is the two vertical centres
   within 8px; "on the strip" is its right edge within 56px of the window's left).
2. **⌘B / Ctrl+B still collapses and expands, and the button follows.** The shortcut collapses
   the sidebar to the strip, and the button now offers "Expand sidebar"; again, and it is open,
   the button offering "Collapse sidebar".
   Spec: `apps/saas/tests/sidebar.spec.ts` (Sidebar 2; `ControlOrMeta+b`, the seeded agent at 1280. The shortcut itself already worked before #234: only the button's part is new).
3. **The sidebar stays as it was left, across a reload.** Collapsed, then reloaded: still the
   strip, with the button offering "Expand sidebar". Expanded again with the button, then
   reloaded: open, the button offering "Collapse sidebar".
   Spec: `apps/saas/tests/sidebar.spec.ts` (Sidebar 3; collapsed by the shortcut and expanded by
   the button, never by setting the cookie; "after the reload" is judged once the button's
   tooltip has opened, which needs the live page, so a server paint the page then undoes does not
   pass. Before #234 a collapsed sidebar already reloaded collapsed).
4. **The strip keeps the Inbox's count.** With the sidebar collapsed, the agent's Your-turn
   number is still on the Inbox icon, as a small badge they can read.
   Spec: `apps/saas/tests/sidebar.spec.ts` (Sidebar 4; an office of the test's own with one
   invited agent and two Zalo guests the invited manager gave them, so the number is exactly 2;
   collapsed by the shortcut; one `nav-your-turn-count` in the Inbox link, reading "2", at least
   12×12px, overlapping the Inbox link's box and inside the strip (right edge within 56px).
   Before #234 the number was there only for screen readers, a 1×1px box).
5. **The strip names its items on hover.** Collapsed, pointing at Home shows "Home", at Inbox
   "Inbox", at Paperwork "Paperwork" with "Coming soon", and at CRM (the built-in CRM, #126)
   "CRM" with "Coming soon". Paperwork and CRM stay disabled: neither is a link, and clicking
   either goes nowhere.
   Spec: `apps/saas/tests/sidebar.spec.ts` (Sidebar 5; the seeded agent, collapsed by the
   shortcut; tooltips are `role="tooltip"`; Paperwork is `data-test="nav-paperwork"` and CRM
   `data-test="nav-crm"`, each pointed at with the mouse since it takes no pointer events; "no
   link" for CRM is no link whose name starts with "CRM", so other wording that mentions a CRM
   is not taken for the item; "goes nowhere" is still on `/en/home` once Home's tooltip has shown after the click).
6. **The button speaks Vietnamese.** On `/vi`, its tooltip reads "Thu gọn thanh bên (⌘B)" open
   and "Mở rộng thanh bên (⌘B)" collapsed; Ctrl+B off a Mac.
   Spec: `apps/saas/tests/sidebar.spec.ts` (Sidebar 6; as a Mac and as Linux, as in 1).
7. **A phone keeps its menu sheet.** Below `lg`, the top bar's menu opens the sheet with Home and
   Inbox, and #234's collapse button is in neither the sheet nor the top bar.
   Spec: `apps/saas/tests/sidebar.spec.ts` (Sidebar 7; 390×844; no visible `sidebar-toggle`. A
   guard: it held before #234. The kit's rail, a button named "Collapse sidebar", is inside the
   sheet already and is left as it is, the rail being unchanged by #234).
