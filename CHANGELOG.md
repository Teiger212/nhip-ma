# Changelog

## 2026-10-08 (the template suggested reply in the agent's own voice)

### Changed

- **The template suggested reply speaks as the agent** (#253, ADR 0024). One template in EN, VI,
  JA, KO and RU replaces the first-reply and follow-up templates, which thanked the guest a
  second time after the auto-reply and promised "a colleague". Until the office's first human
  reply it introduces the thread's owner by first name and the office ("Hi, I'm Lan from Saigon
  Prime."), or the office alone while the thread is Unassigned, says what the agent will do, and
  asks at most one missing detail that changes what the agent would send, never one the
  auto-reply or the office already asked. It thanks the guest only when the office has sent
  nothing at all. On a later turn it introduces no one and asks nothing. Assigning a thread
  writes its untouched template again in the new owner's name; typed text is never overwritten.
  The VI wording is pending a native read (#78); JA, KO and RU have none planned yet.
- **The reply box says who wrote the suggestion**: "Suggested reply · AI" or "Suggested reply ·
  template" (VI "Gợi ý trả lời · AI" / "Gợi ý trả lời · mẫu", pending #78).

## 2026-10-08 (an unsupported guest language is named)

### Changed

- **A guest who writes in a language Nhịp doesn't support is named, not read as English** (#245,
  ADR 0021 R4 as amended). The language is detected locally, with no model call: the five
  supported languages keep their script and letter rules, Chinese and Thai are read from their
  scripts, and other Latin-script text from a small language-ID library (eld). The details'
  Language row reads "French · not supported, replies in English"; the operator note, Home's
  Waiting now and the alerts name French too. The guest still gets the English greeting and an
  English suggested reply. Their messages aren't translated: each shows "French isn't supported:
  no translation" where the translation would be. The VI copy is pending a native read (#78).
  A new guest's CRM lead records the named language too ("fr"), not English. The walk office's
  French and Chinese guests show it after `pnpm seed -- --reset`.

## 2026-10-08 (The open thread: conversation, docked reply box, guest details beside it)

### Changed

- **The open thread is a workbench** (#248). Messages are chat bubbles, the guest's on the left with the translation as a muted second line inside the bubble, the office's on the right, with the source and time under each. The reply box is docked under the conversation and always in view, with Approve and send in it, and the conversation opens on the latest message. The guest's details sit in a rail beside the conversation (details and what is missing, the CRM status, the owner); when the thread's own pane is narrower than 56rem (1366px with the sidebar open, a phone) the rail folds into a strip under the header, and the CRM status and Assign to move into the header.
- **A new guest message no longer pulls an operator reading older ones** (#248, PR #258). The conversation follows new messages only while the operator is at the latest; scrolled up, it stays put and a "New message" pill above the reply box takes them down to it. Opening a thread and the operator's own send still go to the latest.
- **The operator note is one line beside "Reply"** (#248): the reply's language and "don't interview" ("in Korean · don't interview"). The guest's facts and the paperwork flag it used to repeat are in the details.
- **Assign to and the manager's Showing filter are the kit's Select** (#248), showing the current choice, with the office's operators in the same order as a row's Assign to… menu. A new lint rule, `nhip/no-native-select`, refuses a native `<select>` outside `packages/ui`.

## 2026-10-08 (the model layer: a model per task, zero-retention, daily caps)

### Added

- **A model per task, defaulted in code** (#250, ADR 0024). Every model call is a task,
  `draft` or `translate`, with its own model: `DRAFT_MODEL` and `TRANSLATE_MODEL`, both
  `anthropic/claude-haiku-5.5` unless set. A key alone is enough to start; the startup error for
  a key without `DRAFT_MODEL` is gone. Switching a model is an env change and a redeploy.
- **Daily caps per office** (#250, ADR 0024). Drafts 50 a day (Regenerate counts), translations
  1,000 a day, from `DRAFT_DAILY_CAP` and `TRANSLATE_DAILY_CAP`, counted per model call (a retry
  counts) in the new `inbox_model_usage` table. The day runs midnight to midnight in
  Asia/Ho_Chi_Minh. Past a cap the task falls back without calling the model: the template, or
  no translation line. A capped translation isn't a failed one: it spends none of the message's
  attempts and waits out no backoff, and the thread's first open after the office's day turns
  translates it.
- **One log line per model call** (#250, ADR 0024): task, model, officeId, input and output
  tokens, latency and outcome (ok, timeout, error, capped, filtered, empty). Never message text,
  a thread id or a guest id.
- **A deterministic stub model for E2E** (#250, ADR 0024). `MODEL_STUB` names the tasks it
  answers with fixed text; production refuses it. E2E now translates guest messages with it
  ("Stub translation, Korean to Vietnamese."); its drafts are built and turn on with #252.

### Changed

- **OpenRouter only, with zero-retention routing on every request** (#250, ADR 0024). Every
  request sends `provider: { zdr: true, data_collection: "deny" }`, so guests' text is neither
  kept nor trained on. A production deployment refuses a `DRAFT_BASE_URL` other than OpenRouter.
- **A model call gives up after 20 s and is tried once more** (#250, ADR 0024), then the
  fallback stands, with no error banner. It was 30 s and no retry.

## 2026-10-08 (the built-in CRM in the sidebar, Coming soon)

### Added

- **The sidebar shows CRM, Coming soon, after Paperwork** (#126). The built-in CRM gets a
  disabled item with a contact-card icon: no link, never active, the "Coming soon" badge, and
  in the collapsed sidebar a tooltip naming it with the same badge. The platform admin does not
  see it. Until now only the admin's CRM selector named the built-in CRM.

## 2026-10-08 (In CRM opens the HubSpot deal)

### Added

- **In CRM opens the thread's deal in HubSpot** (#240, ADR 0003). On an office on HubSpot, the
  thread header's "In CRM" badge is a link, with a small external-link icon, that opens the deal
  in a new tab on the portal's own web domain (an EU-hosted portal's is `app-eu1.hubspot.com`).
  Nhịp learns the domain from HubSpot's account details along with the portal id, and keeps it
  on the CRM connection. Until it knows them, and on the mock CRM, the badge stays plain text.

## 2026-10-08 (demo-walk tweaks: kit docs link hidden, Paperwork, In CRM)

### Changed

- **The user menu no longer links to the kit's documentation** (#239). `KIT_SCREENS.docs` is off;
  the kit's docs code stays for when Nhịp's own operator wiki (#238) replaces it.
- **The sidebar's Coming soon item is Paperwork** (#239, formerly International): foreigners'
  documents in Vietnam, "Giấy tờ" in Vietnamese, with a document icon.
- **The thread header says "In CRM" without the lead's name** (#239). Which lead a thread is on
  stays in the CRM.

## 2026-10-07 (a visible sidebar collapse button, smoother motion, a readable icon strip)

### Added

- **A button collapses and expands the sidebar on a desktop** (#234). It sits beside the bell, and heads the icon strip when the sidebar is collapsed. Its tooltip says what it does and gives the shortcut as the computer writes it: "Collapse sidebar (⌘B)" on a Mac, "(Ctrl+B)" elsewhere, in English and Vietnamese. ⌘B / Ctrl+B and the rail on the sidebar's edge still work as before.

### Changed

- **The sidebar moves smoothly** (#234). Its width eases out over 220ms instead of moving linearly, and the labels fade with it instead of vanishing at once. Both stop when the system asks for reduced motion.
- **The collapsed icon strip reads on its own** (#234). Every item has a tooltip naming it, International included: it still says "Coming soon" and links nowhere. The Inbox's Your-turn count stays on the Inbox icon as a small badge. The user menu fits the strip instead of overhanging its edge.

### Fixed

- **A collapsed sidebar reloads collapsed from the first frame** (#234). The server reads the sidebar's cookie, so the page no longer paints the open sidebar and then snaps it shut.

## 2026-10-07 (Home's Closings and Lost from the CRM)

### Added

- **Home counts Closings and Lost from the office's CRM** (#68, ADR 0003). For the last 30 days'
  leads, Home shows the distinct won and lost leads from the outcomes Nhịp cached from the CRM,
  with "As of <time>", the last time Nhịp heard from it. A deal reached on two threads counts once.
  Home never asks the CRM, so it loads at once with the CRM down.

### Changed

- **An office with no CRM sees "No CRM"** (#68). Closings and Lost stay hatched with a neutral
  "No CRM" chip and "Closings and lost come from your CRM. Nhịp connects the one your office
  uses.", in place of "Connect your CRM", which managers can't do.

## 2026-10-07 (a rich dev and demo seed: every state, two offices)

### Added

- **`pnpm seed` writes a dev and demo dataset with every state in it** (#69). About sixty
  invented guests over the last 30 days, so Home's funnel, response time and leads by day have
  shape and the Inbox tabs show two-digit counts. The walk office holds every Inbox state
  (Unassigned, each agent's and the manager's, Your turn, Quiet, Sent, written back), greeted
  guests, bell rows and the alert log, a deleted guest's receipt and lead tally, and every CRM
  state on the mock CRM: in CRM, Not in CRM yet, Won, Lost, lost and written back, two leads
  sharing a phone, an unmatched lead. A second office has its own manager and agents, its
  auto-reply off and no CRM, and shares nothing with the first. Guests write on WhatsApp and
  Zalo in seven languages, with translations and qualifiers filled. Every row is written by the
  app's own calls, each at its story's time, with no model call and nothing sent or pushed. A
  re-run adds nothing, and `pnpm seed -- --reset` rewrites the seed's own rows as of now.
- **The seed refuses production** (#69). It refuses `VERCEL_ENV=production`, and any database
  that isn't on this machine unless `SEED_REMOTE_DATABASE_HOST` names its host (the Neon `dev`
  branch). This includes the E2E run's seed, whose database is local. What the E2E run's seed
  writes is unchanged: the walk logins and the four demo threads.

## 2026-10-07 (every signed-in page checks the session itself)

### Security

- **A signed-in page checks the session itself, not only through its layout** (#231). The
  signed-in layout's check doesn't run again when you move between its pages, and a crafted
  RSC request (an `RSC: 1` header and a router state that says the layout is already on
  screen) renders a page without it. Every page under `(authenticated)` that reads data on the
  server now checks first. The office's settings already called `requireOfficeManager()`
  (#212). The others now call `requireSession()`, which sends a visitor with no session to
  login in their language, as the layout does. The audit in the PR lists each page. No data was exposed
  before: where a page read data, the read itself already needed the session. But Home's frame
  rendered for a signed-out RSC request, and now it doesn't.
- **A request for a signed-in page with no session cookie goes straight to login** (#231).
  `proxy.ts` checks only that the cookie is there (Better Auth's `getSessionCookie`) and never
  reads the database. It is a quick pre-filter, not the gate, so a stale or made-up cookie
  still reaches the page's own check. It only redirects a locale's page requests (`GET`/`HEAD`
  under `/en/…`, `/vi/…`). It never redirects the sign-in pages (login, sign-up, forgot and
  reset password, verify), the invitation page, `/api`, `/webhooks`, `/dev` or files,
  whatever the matcher lets in.

## 2026-10-07 (error reports drop the inbox's thread and message ids)

### Security

- **Server error reports drop every record id** (#220 follow-up). The PostHog scrubber removed only ids starting with "c", Prisma's cuid. The inbox's thread and message ids (cuid2, #141) start with any letter, so an error message that named one sent it to PostHog. They're removed now too.

## 2026-10-07 (server logs carry no thread or guest ids)

### Security

- **A failed background job logs its kind, never an id or guest data** (#220, PDPL). Vercel's
  logs are telemetry. A job's label is now the job's kind only ("translate", "translations",
  "follow-up draft", "crm account"), never a thread's or message's id. Thread ids are opaque since
  #141, but a few older ones on staging keep the `office:pipe:guest` form, which holds the
  guest's Zalo or WhatsApp id. The failure line
  names the error's class and code, for example `TypeError ECONNREFUSED`, never its message,
  which can quote what the guest wrote. A lint rule, `nhip/background-label-is-literal`, refuses
  any label that isn't a plain string literal.
- **The rest of the server's logging keeps no guest data either** (#220). A failed approve logs
  the office and the vendor's error codes, without the thread id or the vendor's message. A failed draft or
  translation request logs the error's kind, not the parser's message, which quotes the model's
  answer. Failures of the webhook log, the Zalo connect and token refresh, the disconnect alert,
  error reporting and the CRM account lookup log the error's kind instead of the whole error.
  The office's own ids stay: its Zalo OA or WhatsApp number id, and its office id. They are the
  office's, not a guest's, and they say which connection to fix.

## 2026-10-06 (the manager's Waiting chip, tab titles that name the page, managers-only office settings, the Notifications intro)

### Changed

- **A manager's turn chip reads "Waiting" on threads that aren't theirs** (#212, ADR 0022). A
  manager sees "Your turn" only on the waiting threads they own. On a colleague's waiting thread
  and on an Unassigned one the chip reads "Waiting" (VI "Đang chờ"), on the row and the thread
  header, in the same amber. Agents are unchanged. The views, counts and nav number are
  unchanged.
- **The tab title names the page** (#212, ADR 0019). While guests wait, every page's tab reads
  "(n) <Page> – Nhịp", for example "(6) Home – Nhịp" or "(6) Inbox – Nhịp", instead of #136's
  "(n) Inbox" everywhere. With nobody waiting it is the page's own title, as before.
- **Settings → Notifications says what it is for** (#212). Its subtitle reads "Choose what
  reaches you in Nhịp." (VI "Chọn những gì đến với bạn trong Nhịp."), replacing the kit's
  "Choose how you receive notifications. Disabled options are stored; everything is enabled by
  default."

### Security

- **Office settings are managers only, on the server** (#212). General, Team and Billing under
  `/<office>/settings/` each call `requireOfficeManager` first, which shows anyone without
  `organization.manage` the not-found page (404) before the page reads anything. Before, an
  agent who typed the General or Billing address got the page. Team already did this and now
  shares the helper.

## 2026-10-06 (the view tabs fit their counts, the manager's Waiting view, office Billing hidden)

### Changed

- **A manager's "Your turn" view reads "Waiting"** (#210, ADR 0022). A manager's view of every
  guest the office owes a reply is labelled "Waiting N" (VI "Đang chờ N"), not "Your turn N". It
  holds the same threads, and N is the same office-wide count as the nav badge, the tab title and
  the count line. Agents keep "Your turn".
- **The office Billing page is hidden** (#210, ADR 0022). `/<office>/settings/billing` joins the
  account Billing page in `kit-screens.ts`: it answers with the not-found page, as the other
  hidden kit screens do, until the office's per-seat billing is built (ADR 0014). It is hidden,
  not deleted.

### Fixed

- **The Inbox's view tabs stay on one line** (#210). Two- and three-digit counts and the
  Vietnamese labels no longer wrap a tab onto two lines, and the row never scrolls sideways.
  Each tab grows to fit its label and full count; when the row runs short, the tabs' side
  padding steps down first, from 12px to 8px, then to 4px with a tighter gap before the count.

## 2026-10-06 (a missing CRM lead says so, and heals when its thread is opened)

### Added

- **"Not in CRM yet" on a thread whose CRM lead was never written** (#211, ADR 0003). When the
  office has a CRM and a thread's lead write failed, the thread header shows a neutral "Not in CRM
  yet" chip, never red, to agents and managers. An office with no CRM shows nothing, as before.
- **Opening such a thread retries the lead write once, in the background** (#211). The wait
  since the last failure is stored on the thread, so every server instance honours it and the
  Inbox's 10-second polling never asks the CRM on every refresh. Retries wait 1, 5, 15, then 60
  minutes, and then stay an hour apart. On success the chip turns into "In CRM: {name}". A
  thread deleted under ADR 0020 takes its failure with it and is never retried. Retries with
  nobody opening the thread wait for background jobs (#64, ADR 0023).

### Changed

- **A failed CRM lead write is logged by kind only** (#211): timeout, auth, rejected or other,
  with no thread, guest or CRM id. The old log line named the thread.
- **A HubSpot call gives up after 15 seconds** (#211), so a hung call never holds a thread's lead
  write. It counts as a timeout, retried when the thread is next opened.

### Fixed

- **A lead write that died half-way no longer blocks its thread for good** (#211). Its claim is
  taken over once it is 15 minutes old, longer than any server function runs, so the guest's
  next message or opening the thread writes the lead.

## 2026-10-06 (after the auto-reply, the reply box takes the follow-up path)

### Fixed

- **After the auto-reply, the reply box no longer greets the guest again** (#166, ADR 0021 R11 and P2, spec #159). Once the greeting is on file, the greeting job re-runs the reply box's path on the thread as reloaded. The guest's first message, still unanswered, gets the follow-up template ("Thanks for your message. A colleague will get back to you here shortly.") in place of the first-reply template's "Thanks for writing …". Where a model is configured, the model's follow-up then replaces it, drafted from the whole conversation with the greeting in it. Every later guest message takes the same path, and so does "new suggestion" without a model. One predicate decides it in `inbox.ts`: a human reply was sent, or an auto-reply message is on the thread. A greeting that was claimed but never sent (a disconnected OA, a failed send) leaves the first-reply template, as before. A guest message whose thread was read just before the greeting was filed checks the stored thread again, so the first-reply template can't overwrite the greeting job's follow-up. With a model configured, every greeted first message now costs a model call, where before the first one came only after a human reply.
- **The funnel ignores the auto-reply, pinned by tests** (#166, R10). Vitest against the test database walks a greeted lead through the funnel. After the greeting it reads Leads in 1, Engaged 0, In conversation 0 and no response time, and the guest writing back before a human reply changes none of that. A human reply makes it Engaged, timed from the guest's first message rather than the greeting. A later guest message puts it In conversation. No SQL changed. E2E covers the funnel on Home and the reply box after the greeting.

## 2026-10-06 (Inbox polish from the UI walk)

### Added

- **A manager's count line says what the view holds** (#208, ADR 0022). Under the view tabs a
  manager reads, for example, "4 unassigned · 6 waiting in the office", worded per view, or
  "waiting on <name>" while the owner filter shows one operator. Agents keep "N guests are
  waiting on you".
- **International, coming soon** (#208). The sidebar lists International under Inbox again, as
  a disabled item marked "Coming soon": handling foreigners' documents in Vietnam. It links
  nowhere, and PRODUCT.md lists it under "Later, shown as Coming soon".

### Changed

- **"Assign to…" shows on the row you're on** (#208, ADR 0022). From `md` up, the pill on a
  manager's Unassigned rows shows on hover, on keyboard focus within the row and on the
  selected row, in the timestamp's place, so names keep the row's width. On a phone it stays
  visible, a 44px target, and on a touch screen at any width it shows on every row.

### Fixed

- **The view tabs stay put** (#208). A manager's owner filter now holds its place in every
  view, disabled in Unassigned, so the tabs and the list no longer jump 44px when switching to
  or from Unassigned.

## 2026-10-06 (a manager turns the office's auto-reply off)

### Added

- **A manager can turn the office's auto-reply off, and on again** (#167, ADR 0021 G6 and S1).
  The switch, "Auto-reply to a new guest's first message", sits on the office's settings page
  (General), which a manager now reaches from the user menu as "Office settings", next to Team.
  Agents see neither the menu item nor the switch, and the platform admin, as with Team, stays in
  the admin area. With it off, a new guest gets no auto-reply and the reply box holds the
  first-reply template for an agent to approve, as before the auto-reply. Turning it back on
  greets only threads that begin afterwards: a guest who first wrote while it was off is never
  greeted. The switch saves through `PUT /api/office/auto-reply` `{ on }`, for managers only
  (403 for an agent, 401 signed out), under the platform's `/api/` rate limit. EN and VI.

## 2026-10-06 (local E2E: build once, run many spec files)

### Added

- **Many local spec files share one E2E build** (#205). `scripts/e2e-server.sh` builds and
  starts the E2E server in the background, with the same chain, env, database and HTTPS proxy
  as a fresh run, and `E2E_REUSE=1 playwright test <file>` runs spec files against it without
  building again. It refuses to test stale code: once the app source differs from the build's,
  committed or not, it asks for a rebuild, while an edit under `tests/` alone never does.
  `--status` and `--stop` report on and stop the server. CI and the default mode still build
  fresh on every run.

### Fixed

- **The E2E HTTPS proxy no longer leaves a certificate folder behind** (#205). It reads its
  throwaway certificate into memory and deletes the temp folder at once. Before, every
  default-mode run left a `nhip-e2e-tls-*` folder in the OS temp dir.

## 2026-10-06 (E2E helpers query through one process per worker)

### Changed

- **E2E helpers that set up or read the database run in one long-lived process per Playwright worker, not a `pnpm exec tsx` spawn per call** (#203, follows #186). `pipes.ts`, `alerts.ts`, `crm.ts`, `deletion.ts` and `joinOffice`'s accounts send each call to the worker's state process (`apps/saas/tests/support/state-client.ts`, `state-process.ts`), which boots tsx, Prisma and the test-only Better Auth once. Each spawn cost about 2 s on CI. The helpers are now async. Every read the specs observe (`alertState`, `mockCrmLeads`, `guestDeletionRecords`) is still a fresh query, with no caching. A process that dies, never starts or doesn't answer fails the waiting test with its reason within 10–15 s, below the test's timeout, and the next call starts a new process. No spec checks anything different. CRM 3's check that a lost lead stays lost now waits on a second office's lead first, as CRM 1 does, since a read no longer takes 2 s. On CI, the E2E Playwright time fell from 9.3–9.4 min to 5.0–6.1 min.

## 2026-10-06 (workflows pin the pnpm action to a commit)

### Security

- **Every workflow pins `pnpm/action-setup` to its v4 commit** (#200 follow-up, from a security review of `changelog.yml`). The changelog fold pushes to main with `contents: write`, so a moved `v4` tag could have run someone else's code with that access. Production smoke already pinned it; CI, Format, Staging smoke and the fold now do too.

## 2026-10-05 (E2E operators join without the sign-up page)

### Changed

- **E2E specs set up their offices' agents and managers without a browser sign-up** (#186). `joinOffice` (`apps/saas/tests/support/operators.ts`) still invites, and accepts the invitation, through the kit's API, so the membership, its role and the session's office stay the server's. The account the invitation sign-up page would make (Better Auth's `createUser` and credential account, password `NEW_PASSWORD`) and its session come from a test-only Better Auth instance, one tsx process per Playwright worker (`accounts.ts`). Every spec but the Auth specs and Team moves to it; those keep the browser sign-up, which is what they prove. CI's E2E time did not measurably change: at 2 workers the UI joins were not its bottleneck.

## 2026-10-05 (changelog entries are fragments, folded on main)

### Changed

- **A pull request adds its changelog entry as a fragment, never to `CHANGELOG.md`** (#200). Each PR adds one file, `changelog.d/<issue>-<slug>.md`, holding its section as entries are written today (`changelog.d/README.md`), so two PRs no longer conflict over the top of `CHANGELOG.md`. On every push to main that adds fragments, `.github/workflows/changelog.yml` folds them into `CHANGELOG.md` with `scripts/changelog/fold.mjs`: newest on top, in the order they reached main (the first-parent log of the commits that added them, never their filenames). It then deletes them, runs oxfmt and pushes the result as github-actions[bot] in a commit named `docs(changelog): fold <n> fragment(s)`. If main moved meanwhile, it folds again on the new tip, up to five times. Runs are serialized and never cancelled. The format check now fails a PR whose diff edits `CHANGELOG.md` and checks each fragment's shape. The `CHANGELOG.md` union merge in `.gitattributes` goes.
- **The release gate accepts a changelog fold commit on its parent's CI** (#200, #190). A fold commit has no CI run of its own, since a `GITHUB_TOKEN` push starts no workflow. With no run, `scripts/release/check-release.sh` reads its parent's instead, and names that run, but only when the new `scripts/release/is-changelog-fold.sh` confirms that the commit has one parent; that its author and committer are both github-actions[bot]; that it has the fold's subject; and that against its parent it changes `CHANGELOG.md`, deletes fragments, and nothing else. The parent gets no exception of its own, and anything else with no run is refused, as before. `check-release.test.sh` proves it offline on fabricated commits: a fold passes, and a fold on a red or run-less parent is refused, as are a fold on a fold, code changes, a rename into `changelog.d/`, an added fragment, a forged email or committer, another subject, and a merge.

## 2026-10-05 (an assignment alerts, and the previous owner's bell row)

### Added

- **An assignment alerts the operator given the thread** (#133, ADR 0022, spec #84). When a manager gives a thread to another operator (an Unassigned lead, or a reassignment), that operator gets one `assigned` alert, which always sounds, pushed with the toast's words ("Minji was assigned to you"), and a bell row that names no guest, "A manager gave you a thread" (VI "Một quản lý đã giao cho bạn một cuộc trò chuyện"), opening the alert's `?alert=` link. A manager who takes a thread themselves sets off nothing.
- **A thread returned to Unassigned alerts the other managers** (#133). One `returned` alert ("Minji is waiting") to every manager of the office except the one who returned it; never an agent or the platform admin, and no bell row.
- **The operator a thread leaves gets a bell row naming the guest** (#133, ADR 0022 P4). Reassigned or returned by a manager other than themselves, they read "Minji was moved to another agent" (VI "Minji đã được chuyển cho nhân viên khác"; nameless "A guest was moved to another agent", VI "Một khách đã được chuyển cho nhân viên khác"), with no push, no alert in the log and no email. The row carries `{ threadId, guestName }`, so guest deletion takes it.
- Two `NotificationType` values, `THREAD_ASSIGNED` and `THREAD_MOVED` (one migration each; an added enum value is one deploy). Neither is in the settings or emails: `createNotification` still emails only the kit's welcome. New store write `reassign`, `setOwner` that also returns the owner it replaced, read under the thread's row lock, so two managers at once each alert from the owner their own change took the thread from. The alerts run in the background after the owner change; a failure is logged as its error's kind, without thread or guest ids, and never undoes the change.

## 2026-10-05 (the release gate needs green CI on main)

### Fixed

- **A release needs its commit's CI on main to have passed** (#190, #112). `scripts/release/check-release.sh` now also requires a successful `ci.yml` run, both its `ci` and `e2e` jobs, from the push to main of the release's exact commit. It refuses, naming the run, when the run failed, was cancelled (most likely by a newer push), or is still going ("wait for it to pass, then re-run the release"), and when the commit has no run, since only the last commit of each push gets one. Before, a commit whose E2E failed after merge could still ship. Docs-only commits are covered: `paths-ignore` skips CI on pull requests only, and pushes to main always run it. `check-release.test.sh` gains a cancelled-CI case and drops its branch case's `docs/attio-adr`, which has since merged, for #146's unmerged probe.

## 2026-10-05 (Nhịp installs as an app, and operators turn alerts on)

### Added

- **Nhịp installs as an app** (#135, ADR 0019). `app/manifest.ts`: standalone, opening on the Inbox, with icons (`public/icons/`, and `app/apple-icon.png` for an iPhone's Home Screen). `public/sw.js` is the service worker, served `no-cache`: it shows a push (`showNotification` with the payload's title, body and tag, and `renotify` from `sound`, left out on Apple's WebKit) and on a click focuses an open Nhịp window and takes it to the alert's link, or opens one. No fetch handler, no caching.
- **The Inbox's alerts panel** (#135), a panel on the canvas above the list. It never prompts on load: "Get an alert when a guest writes." with one blue "Turn on alerts" pill and "Not now"; an iPhone outside the Home Screen gets the Add to Home Screen steps; a blocked browser gets how to unblock; a sign-in whose device is gone is asked again; with alerts on, or for 7 days after "Not now" (on that device only), it shows nothing, and nothing when the deployment has no VAPID keys. Nothing on it is red. "Turn on alerts" asks the browser, registers the worker, subscribes (`userVisibleOnly`, the server's VAPID public key) and posts the device.
- **Settings → Notifications: "This device"** (#135): alerts on or off for this sign-in, "Turn on alerts", and "Send test alert" ("Test alert sent."); a 409 turns the row back to offering to turn alerts on. `GET /api/alerts/devices` gives the page the VAPID public key and whether this sign-in has a device.
- **Signing out also unsubscribes the browser** (#135), best effort, before the sign-out.

### Security

- **Proof of possession before a device moves** (#135). An endpoint another operator holds moves only with the same `p256dh` and `auth` (the same browser re-registering, a shared phone); otherwise `POST /api/alerts/devices` answers 409 and the browser subscribes afresh. Decided under an advisory lock on the endpoint, so a race can't slip past it.
- **A device registered as its sign-in ends doesn't survive it** (#135). Registration holds the session `FOR SHARE` and stores nothing (401) when it is gone; a session delete after-hook removes the session's devices once its row is gone.
- **The E2E VAPID pair is no longer committed** (#135). Playwright and CI's e2e job make a fresh pair per run; production, staging and any live deployment refuse the retired pair's key at startup.
- **A push gives up after 10 seconds** (#135), so a hung push service can't stall the background job; a device is updated or removed only as its operator's own.

### Changed

- **The new Vietnamese wording waits on a native read** (#78): the alerts panel's and the "This device" row's strings ("Bật cảnh báo", "Để sau", "Thiết bị này", "Gửi cảnh báo thử", and the rest).

## 2026-10-05 (only the platform admin deletes an office)

### Fixed

- **Only the platform admin deletes an office** (#185, ADR 0015). Better Auth let a manager holding the kit's `owner` role delete the whole office through `/organization/delete`, taking every thread, guest and member with it. An auth before-hook beside the owner and membership guards now refuses that route from anyone signed in but the platform admin: 403 `OFFICE_DELETE_PLATFORM_ADMIN_ONLY`. A request with no session is still the kit's to refuse (401). The platform admin's delete, from Admin → Organizations, is unchanged.

## 2026-10-05 (a late alert, the tab title and toasts)

### Added

- **An alert's link is resolved on the server** (#136, ADR 0019, spec #84). `/<locale>/inbox?alert=<id>` opens the thread only when the alert is the viewer's own and its thread is one they can open now (a manager's own alert still opens a thread they gave an agent). Anything else (a colleague's alert, a thread since given to someone else, an unknown or pruned id, a test alert) says "A colleague is answering this guest" (VI "Một đồng nghiệp đang trả lời khách này") and opens nothing of a thread, with no reason given; the queue stays usable beside it. The thread goes to the Inbox as a prop and `?alert=` leaves the URL, so a thread's id never appears there. `?thread=` and its "not here" notice are unchanged. New store read `alertThread(alertId, viewer)`.
- **The tab title carries the Your-turn count** (#136). While guests wait, every page's tab reads "(n) Inbox" (VI "(n) Hộp thư"), n being the nav's count; with none, the page's own title.
- **A toast when a guest writes, or a thread is given to you, away from the Inbox list** (#136). On Home, Settings, or a phone with a thread open, a guest writing on one of the operator's own threads (an agent's assigned threads; a manager's Unassigned ones and their own, the alert recipients' rule) raises a toast in the kit's Base UI Toaster: "Minji is waiting", "Zalo · Korean", the push's words. A thread a manager gives the operator raises "Minji was assigned to you" (VI "Minji đã được giao cho bạn"; nameless "A guest was assigned to you", VI "Một khách đã được giao cho bạn"), for the new owner only (Eyal, 2026-10-05): the previous owner's toast goes, the manager who assigns gets none, and a thread returned to Unassigned toasts no one. One per guest, replaced in place and keeping its place; at most three (a fourth replaces the oldest); none for what was already there when the page loaded. A toast stays until it is tapped, which opens the thread (handed to the Inbox in memory, not in the URL), closed, or has nothing left to say (the guest answered, the thread given away); opening the Inbox list closes them. The kit's toast close and action buttons now sit above a toast-wide link.

### Changed

- **The nav count reads the list's poll on every page** (#136). The toasts need the guests' names, so the shell polls `/api/conversations` everywhere and `/api/conversations/your-turn` goes; the database is asked once per poll, as before.

## 2026-10-05 (managers hand out leads from Unassigned)

### Added

- **A manager's Inbox opens on Unassigned** (#163, ADR 0022, spec #160). A new first view, "Unassigned" (VI "Chưa giao"; `?view=unassigned`), lists every thread with no owner, whatever its turn, oldest guest message first, with its count, and no Quiet fold. It is a manager's default view; agents don't have it, and an agent's `?view=unassigned` opens Your turn. The Inbox waits for the operator's role before it lists, so a manager never sees Your turn first. The owner filter sits this view out, and no longer offers "Unassigned", which the view covers: it narrows to one operator, and an old `?owner=unassigned` filters nothing. Empty while the office has threads, it reads "Every lead is assigned." (VI "Mọi khách đã được giao.", `data-test="inbox-all-assigned"`). A manager's reply on a lead there makes it theirs, as before, and the view moves on to the next lead.
- **"Assign to…" on each Unassigned row** (#163, DESIGN.md Thread Row). It's a small ghost pill at the row's end: a 44px tap target on the badges' last line below `md`, and the 24px pill on the name's line from `md`, so a row's badges keep one line on a desk. It opens the kit's dropdown of the office's operators (`GET /api/office/agents`). Choosing one assigns at once through the owner route, and the row leaves the view. The pill sits beside the row's button, not inside it, so it never opens the thread. The thread list is now a list (`ul`/`li`).

### Changed

- **Home's Waiting now lists Unassigned leads first for a manager** (#163, ADR 0022): the Unassigned Your-turn threads, then the rest, each group in the queue's order (quiet last), at most five. An agent's is unchanged.
- **The new Vietnamese wording waits on a native read** (#78): the view's "Chưa giao" (#162's label, reused) and "Mọi khách đã được giao."

## 2026-10-05 (Team asks before removing someone, and protects the platform admin)

### Fixed

- **Removing someone from Team asks first** (#174, ADR 0013). "Remove from office" opens the kit's alert dialog: "Remove {name} from the office?", "Removing {name} ends their account. Their guests return to Unassigned.", with Cancel and a red Remove (VI "Xóa {name} khỏi văn phòng?", "Xóa {name} sẽ xóa tài khoản của họ. Khách của họ trở về Chưa giao.", Hủy, Xóa; for review in #78). Remove still removes in that one step.
- **No manager touches the platform admin's membership** (#174). Better Auth let a manager holding the kit's `owner` remove the platform admin's inert `owner` membership or change its role, and any manager change it once it was no longer `owner`. An auth before-hook beside the owner guard now refuses `remove-member` (by member id or email) and `update-member-role` on the platform admin's membership from anyone but the platform admin: 403 `PLATFORM_ADMIN_MEMBERSHIP`. It reads the target from the field each route acts on, so a stray `memberIdOrEmail` beside `update-member-role`'s `memberId` doesn't get past it.
- **The platform admin's row never reaches a manager's browser** (#174). An auth after-hook drops the platform admin from `get-full-organization` and `list-members` (with its `total`) for every caller but the platform admin, so their email is in no answer Team, the office layout or the client gets. Team no longer hides the row itself. In the admin area the platform admin's own row reads "Platform admin" (VI "Quản trị viên nền tảng") rather than "Manager", with no role select or Leave (the membership is inert, ADR 0015).
- **A thread can't be given to the platform admin** (#174, ADR 0022). `setOwner` refuses them, so `POST /api/conversations/:id/owner` answers 400 for their user id, as for anyone not in the office; such a thread would have been seen and alerted by no one.

## 2026-10-05 (a new guest is greeted at once)

### Added

- **A new guest's first message gets the template auto-reply** (#165, ADR 0021, spec #159). Within seconds, with no approval, Nhịp answers a new guest's first message once, as the office: it thanks them, acknowledges what the extraction found (renting or buying and the area by value; a budget, timing or household by kind only), asks for at most two missing details in R3's order (rent or buy, area, budget, timeframe, household), and ends with the always-on label, "Auto-reply from <office>: a colleague will continue with you right here." (the office's name, last line, pending the lawyer). Its own text has no digit, price, link or time. EN, VI, JA, KO and RU; the four non-English texts wait on Eyal's review and a native read (#78). It goes only to a thread the office hasn't spoken on: a thread begun from the office's own app, a guest's second message, or an office that switched it off (`inbox_office_setting.autoReply`; no row means on, the switch itself is #167) gets none. The thread is claimed once by a conditional update (`inbox_conversation.autoReplyAt`), so two first messages at once make one greeting. It is sent like an Answer, from the endpoint the guest wrote to (never a disconnected one; mock in a mock deployment, where its id is `mock-auto-reply-<thread id>`), tried once, and a failure is logged by category only. It is filed as an outbound message with source `auto_reply`, `writtenBy` `template`, and the vendor's id hashed, so Zalo's echo of it is a duplicate, not a reply from the app. It is not an Answer: the thread stays Your turn and unassigned, and Home's Engaged, In conversation and response time don't count it. In the thread it shows as the office's message with a neutral "Auto-reply" badge and "Template" (VI "Trả lời tự động", "Mẫu"). The seed's demo threads are not greeted (`injectDevInbound`'s `autoReply: false`); a dev-injected guest is. The model writing it is #168, and the reply box after it is #166. Four migrations, each 1 deploy: the enum value `MessageSource.auto_reply`, the nullable `inbox_message.writtenBy`, the nullable `inbox_conversation.autoReplyAt`, and the new table `inbox_office_setting`.

### Fixed

- **A model draft is composed (NFC) before the post-check reads it** (#165, from #164): a decomposed "sở hữu" no longer slips past the paperwork list.

## 2026-10-05 (Unassigned is the managers'; agents see only their own threads)

### Changed

- **A new lead waits in Unassigned, for managers only; an agent sees only the threads assigned to them** (#162, ADR 0022, spec #160; supersedes ADR 0015's pool). An agent no longer lists, counts, searches or opens an Unassigned thread or a colleague's: opening one by link or through the API is a 404. A manager still sees every thread of the office and gives each lead to an operator from the thread header's "Assign to…" (VI "Giao cho…"), the Owner control renamed, whose no-owner option and the owner filter's now read "Unassigned" (VI "Chưa giao"; the filter's URL value is `?owner=unassigned`); the owner badge reads "Unassigned" (`data-owner="unassigned"`), which only managers ever see. The last assignment wins. A manager who approves a reply on an Unassigned lead becomes its owner, as before. An agent with nothing assigned reads "Nothing assigned to you yet." (VI "Chưa có khách nào được giao cho bạn."). Every "Pool" label and key goes.
- **An Unassigned guest alerts the office's managers only** (#162, amends ADR 0019 "Who"; replaces #132's pool rule). An owned thread's guest still alerts its owner only; the platform admin is never alerted. `officeOperators` returns each operator's `manager` flag (kit `owner` or `admin`). This ships with the visibility change, so nobody is alerted about a thread they can't open.
- **Deploy note:** no data migration. At release every pool thread becomes Unassigned and leaves the agents' Inboxes; the first client's managers must assign them.

## 2026-10-05 (devices, and the live push to them)

### Added

- **Alerts reach the operators' devices by web push** (#134, ADR 0019, spec #84). A device is a browser's push subscription, kept in the new `push_subscription` table (migration `20261005082256_push_subscription`, a new table, 1 deploy) with the sign-in that registered it and cascading with the user (ADR 0013). `POST /api/alerts/devices` `{ endpoint, keys: { p256dh, auth } }` adds one (201), only for an `https` endpoint on Google's, Apple's, Mozilla's or Microsoft's push service (else 400); an endpoint another operator held moves to whoever registers it, and an operator keeps 10 devices, dropping the oldest. `DELETE /api/alerts/devices` removes this sign-in's (204); `POST /api/alerts/devices/test` writes a `test` alert and pushes it to this sign-in's devices (202), or answers 409 with none. All three answer 401 signed out. Signing out deletes that sign-in's devices (a Better Auth before-hook), and so does every other way a live session ends: revoking it or the user's other sessions, a ban, a password change or reset that revokes, the end of an impersonation (a session delete hook). A session that merely expired keeps its devices. An admin impersonating an operator cannot add a device or send a test alert (403). An endpoint is stored and pushed in the one normal form it was checked in, and a host Node's legacy URL parser would read differently is refused. With `SEND_MODE=live` each alert is pushed to every device of its operator through `web-push` 3.6.7, VAPID-signed, urgency high, a 1-hour TTL, at most 5 pushes at a time per event; a 404 or 410 deletes the device, and a failure is logged as its status only, never the endpoint or the alert. The VAPID keys (`VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`) are a set: without them a live deployment logs "push not configured" and pushes nothing; a partial set is refused at startup. `pnpm seed` never pushes, whatever `SEND_MODE` says. There is no UI yet (#135).

## 2026-10-05 (French and Spanish stop reading as Vietnamese)

### Fixed

- **Vietnamese is read only from letters Vietnamese alone uses** (#164, ADR 0021). A guest's message reads as Vietnamese from ă, â, đ, ơ, ư, a hook above or a dot below, ẽ ĩ ũ ỹ, or any tone on ă â ê ô ơ ư; the acute, the grave, ã, õ and a bare ê or ô no longer count, so "está disponible", "não" and "à louer" read as English: they get the English first-reply template, a Vietnamese operator's translation is from English, and an English operator gets none (before, it was labelled as from Vietnamese). French "château" still reads as Vietnamese, through its â: a known, accepted limit. Any toned ă, â, ê, ô, ơ, ư (ắ, ấ, ế, ố, ớ, ứ…) now counts, so "Tiếng Việt" reads as Vietnamese where it read as English. The common-word list is unchanged, but its words now match whole by any letter, so "thuê nhà" still reads as Vietnamese: "thuê" and "nhà" end in an accented letter and never matched as words, only through the letters now dropped. Text with neither, such as "Xin chào" alone, reads as English until detection moves to a model or classifier. Text that sends a tone or horn as its own combining mark (decomposed, NFD, as some keyboards do) is composed first, so it reads and extracts like the same text composed: "Cảm ơn" decomposed read as English, and a decomposed "Tây Hồ" was no area.

## 2026-10-05 (managers invite their own agents from Team)

### Added

- **Team: a manager invites the office's agents** (#82, ADR 0015). A manager's user menu has "Team" (VI "Nhóm"), the kit's members page at `/<locale>/<office slug>/settings/members`: invite by email as Agent or Manager, see pending invitations, change an agent's role, remove someone. The roles read Agent and Manager (VI Nhân viên, Quản lý), in the admin area too, and `owner` is never offered. The page hides the platform admin's inert owner row and the manager's own Leave (ADR 0013 would delete the account) and role. An agent gets a 404 there and has no Team item; the API refuses an agent's invite, role change and removal (Better Auth), and an auth hook refuses `owner` in an invite or role change from anyone but the platform admin, including a manager who holds the kit's `owner`, whom Better Auth lets grant it. `/api/office` also returns the office's slug.

## 2026-10-05 (a manager deletes a guest's data)

### Added

- **A manager deletes a guest's data, and Home keeps the numbers** (#138, ADR 0020, spec #85). The thread header's ⋯ "Thread actions" menu has "Delete guest data", for managers only. One dialog says what goes (the thread's messages with their translations, the suggested reply, the extracted details), that the chat stays in the office's Zalo OA or WhatsApp, and that it can't be undone; its confirm is the only red. Confirming hard-deletes the thread and everything under it in one transaction, together with any bell row that names it (`notification.data.threadId`), and writes two records that name no guest: an anonymous **lead tally** (pipe, language, first contact, first reply, in conversation, CRM outcome) and a **receipt** (office, manager, time, row counts, CRM result). Home's funnel adds the office's tallies to its cohort, by the same per-lead rule, so leads in, engaged, in conversation, response time, the bands and leads by day don't move. Refused while a reply is sending (the item is disabled with "A reply is still sending"; the API answers 409). `POST /api/conversations/:id/deletion` takes `{ deleteInCrm }`, required; agents get 403, the platform admin 403, another office's thread 404. A thread's CRM lead is only unlinked for now (receipt `unlinked`); deleting the lead in the CRM is #139. New tables `inbox_lead_tally` and `inbox_guest_deletion` (migration `20261005061004_guest_deletion`, new tables, 1 deploy). Receipts are read on request; no screen shows them.
- **A deletion says why.** The dialog asks for a reason ("The guest asked to be deleted", "Duplicate or spam", "Test data", "Other") and an optional note of up to 500 characters, required for Other, with the hint "Don't include the guest's name or contact details". The server masks phone numbers and emails in the note (`[phone]`, `[email]`) before the receipt stores it with the reason. The API answers 400 without a reason, or for Other without a note. Migration `20261005082102_guest_deletion_reason` (a new column with a constant default, 1 deploy): `reason` defaults to `other` for a receipt written before, and `note` is nullable.

### Fixed

- **Recording a sent reply, and re-running a thread's extraction, lock the thread first**, the order guest deletion locks in, so neither can deadlock with a deletion (#138). A guest who writes while their thread is being deleted is filed as a new guest, instead of failing the webhook.

## 2026-10-05 (a guest's new message alerts the operators, logged)

### Added

- **A guest's new message is an alert, decided and logged** (#132, ADR 0019). A pool guest alerts every agent and manager of the office; a guest on an owned thread alerts its owner only; the platform admin, the kit `owner` of the offices they created, is never alerted. Each operator gets one row in the new alert log (`inbox_alert`, migration `20261004213801_inbox_alert`, a new table): its kind, whether it sounded, and its link `/<locale>/inbox?alert=<the row's own id>` in the operator's language (Vietnamese when none is set), which names no thread and no guest. An alert sounds only after 2 minutes of quiet on that thread for that operator, decided under an advisory lock so a burst sounds once. Its text is "Minji is waiting · Zalo · Korean" (EN/VI), "A guest is waiting" without a name, never the message. No push is sent yet: a mock deployment and, until #134, a live one write the log only. The log is pruned after 30 days without a scheduler, like webhook deliveries. A vendor's retry of a message already stored alerts no one: `upsertInbound` returns `{ conversation, inserted }`, and only an inserted guest message is alerted.

## 2026-10-05 (approve on a deleted thread)

### Fixed

- **Approving a reply on a thread deleted under it answers 404** (#137, ADR 0020, the first step of guest-data deletion). Approve now locks the thread (`FOR KEY SHARE`) before it reads or writes an Answer, on a first send and on the retry of a failed one, which is the order the coming deletion locks in. A thread deleted before the approval, or while it waited, is `not_found` and the route answers 404. Before, a first send failed its foreign key with a 500, a retry on an owned thread approved a reply on a thread already gone, and a retry on a pool thread could deadlock (`40P01`). The new lock doesn't make approvals queue behind each other: two agents on one pool thread end with one owner, and the other is told the reply is being sent.

## 2026-10-04 (no notification emails)

### Changed

- **No notification emails, except the welcome** (#148). `createNotification` emails only the kit's welcome (an allow-list in code); every other type is a bell row only, whatever the person's email preferences say, and the notification settings no longer show email switches. Transactional emails are unchanged: the invitation, the sign-in link, verification, email change and password reset.
- **A broken pipe is a bell row** (ADR 0017, amended). When a Zalo OA disconnects, every platform admin gets a bell row naming the pipe and the office, in their language, linking to the office in the admin area; it is no longer emailed. New notification type `PIPE_DISCONNECTED` (migration `20261004192216_pipe_disconnected_notification`, an additive enum value).
- **`pnpm lint` passes `--disable-nested-config`**, so a checkout with agent worktrees under `.claude/worktrees/` lints instead of failing on their configs, and `pnpm format` no longer formats those worktrees' files.

## 2026-10-04 (safer migrations and connections before go-live)

### Changed

- **New migrations are linted in CI** (#98). Squawk checks the migrations a PR adds against the expand/contract rules: a required column without a default, `SET NOT NULL` in one deploy, or a foreign key on existing rows without `NOT VALID` fails the PR (`migrate:lint`, rules in `packages/database/.squawk.toml`).
- **A migration blocked on a lock fails the build within 5s** instead of queueing every request behind it: hosted builds and `migrate:deploy` set `lock_timeout` on the migration connection (`scripts/migrate-deploy.sh`).
- **The app's connections give up after 10s** instead of hanging on a cold or unreachable database, and release idle connections before a Fluid compute instance suspends (`attachDatabasePool`). The app's role `nhip_app` (`packages/database/sql/app-role.sql`) carries the server timeouts; Eyal creates it on staging and production.
- **Rolling back after a migration:** AGENTS.md says when Vercel's instant rollback is unsafe, and that production's restore window is 6 hours.

## 2026-10-04 (a thread's id names no guest)

### Changed

- **A thread's id is opaque, never the guest's phone or Zalo id** (#141, ADR 0010 amended). Thread ids were `office:pipe:guest`, so a WhatsApp guest's number rode in every `/api/conversations/<id>` route, every `?thread=` link, the thread link on the CRM lead, request logs and background-job labels. New threads take a `cuid()`; migration `20261004181201_opaque_thread_id` re-keys existing threads to random UUIDs (every child row follows through the foreign keys' `ON UPDATE CASCADE`) and points the mock CRM's thread links at the new ids. HubSpot deals made before keep stale links. Inbound still finds its thread by (office, pipe, guest). `conversationId()` is gone.
- **A stale or unknown `?thread=` link says the conversation isn't here** and opens no thread; it used to open the first guest in the queue, another guest's thread. A link to a thread the operator answered (Sent) opens that thread, in All, instead of the first guest waiting.
- **The guest's id is stored once, on the thread.** `Answer.to` (a copy of `guestId`, never read) is dropped by migration `20261004182359_drop_answer_to`. Vendor message ids (`Message`, `Answer`, the webhook log), which can encode the guest's WhatsApp number, are stored as an HMAC-SHA256 under a key derived from `BETTER_AUTH_SECRET`, and the duplicate check compares the same hash; the raw ids already stored are cleared by the migration, since SQL has no key to hash them with. The webhook log now holds no guest identity, as it said, and Admin → Webhooks no longer lists vendor message ids. Rotating `BETTER_AUTH_SECRET` re-keys the hash, so a vendor retry across a rotation is filed again.
- **`pnpm seed --reset`** finds the demo threads by (office, pipe, guest) to rewrite them, not by a computed id.

## 2026-10-04 (the database holds the office line)

### Changed

- **Every office-owned row carries its office, and the database holds it** (#95). Messages, Answers, translations and their failures, qualifications, drafts and paperwork have an `officeId`, backfilled from their thread by migration `20261004074733_office_on_every_row`. Composite foreign keys keep each row's office equal to its thread's (or its message's), so a row filed under the wrong office is refused by Postgres; a CRM link's office must be its thread's too. A draft's `answersMessageId` is now a foreign key and clears when its message goes.
- **The store fails closed.** Every inbox store method names the office it acts for and filters by it in the query: an id of another office's thread, message or Answer reads and writes nothing. `getConversation`, `listConversations`, `approveAndSend` and `regenerateDraft` require the viewer; background work (drafts, translation, the CRM) reads through `getOfficeConversation`.
- **Indexes:** `Conversation.ownerId`, `Answer.operatorId` and `PipeConnection.officeId` are indexed; `Conversation(officeId)`, `Member(organizationId)` and `Purchase(subscriptionId)` lose indexes their unique keys already cover.
- **A CRM token is replaced only on the kind it was sealed for**, so two admins saving at once never leave a HubSpot token on a mock connection.
- **`pnpm --filter @repo/database migrate:baseline`** gives a database built by `db push` a migration history (AGENTS.md, "Migrations").

## 2026-10-04 (a HubSpot deal won or lost reaches the inbox)

### Added

- **A HubSpot deal won or lost reaches the inbox** (#66, spec #59). HubSpot tells Nhịp when a deal's stage changes, at `/webhooks/crm/hubspot`, and the deal's thread shows "Won" or "Lost" within seconds, exactly as with the mock CRM. Each request is checked against HubSpot's v3 signature (the app's client secret over the method, `HUBSPOT_WEBHOOK_URL`, the raw body and the timestamp) and refused (401) when it fails or is more than 5 minutes off. One HubSpot app serves every office: each event names its portal, and only the office on that portal is touched. Nhịp learns an office's portal from HubSpot right after its token is saved (in the background; the save never waits), and again when a webhook names a portal no office is known on; a new token forgets the old portal. Other events, and portals no office is on, are taken (200) and ignored. Deployments set `HUBSPOT_APP_CLIENT_SECRET` and `HUBSPOT_WEBHOOK_URL` together; without them the route answers 404. The demo app subscribes to deal stage changes (`webhooks-hsmeta.json`, its `targetUrl` set at rehearsal or deploy).

## 2026-10-03 (the admin connects an office to HubSpot)

### Added

- **The platform admin connects an office to HubSpot** (#65, spec #59). The CRM row of the office's Connections card offers HubSpot next to None and Mock CRM. Choosing it saves nothing until the office's HubSpot access token is entered and saved; Save with an empty field asks for the token. The token is write-only: it is sealed with `PIPE_SECRETS_KEY` (ADR 0017's AES-256-GCM, bound to the office) before it is stored on the office's CRM connection, opened only by the CRM sync for the adapter, and never shown again; the card and `GET /api/crm/connection` say only that a token is set (`tokenSet`). Saving a new token replaces it and keeps the office's thread links; switching to another CRM or None drops the token with the links. `PUT` with HubSpot and no token answers 400, and 503 where the deployment has no `PIPE_SECRETS_KEY`. Nothing calls HubSpot on save. A new guest on a HubSpot office now becomes a HubSpot contact with a deal: a contact with the guest's phone or Zalo id is reused, and linked to its open deal when it has one; new deals start unassigned and carry the pipe, language, extracted fields and a link to the thread, never message text.

## 2026-10-03 (won or lost leaves the queue)

### Added

- **Won or lost leaves the queue, and comes back** (#63, spec #59). When the office's CRM tells Nhịp a lead was won or lost, its thread leaves Your turn and the nav count and shows a neutral "Won" or "Lost" where the turn was, under Sent and All. When the guest writes after Nhịp first heard that outcome, the thread is back in Your turn. The CRM's own close date never decides it. For now the mock CRM's signed webhook (`MOCK_CRM_WEBHOOK_SECRET`, development and E2E only) carries the notice; HubSpot's comes with #66.

## 2026-10-03 (the admin sets an office's CRM)

### Added

- **The platform admin sets an office's CRM** (#62, spec #59). The office's Connections card has a CRM row next to Zalo and WhatsApp: None or Mock CRM, saved at once. Choosing Mock turns lead creation on for the office; None (or another kind) drops its thread links, and with them any Won or Lost: those threads count as unanswered again if the guest spoke last. Only the platform admin can change it (`/api/crm/connection`: 401 signed out, 403 otherwise).

## 2026-10-03 (a new guest becomes a CRM lead)

### Added

- **A new guest becomes a lead in the office's CRM** (#61, spec #59). When a guest writes on a thread with no CRM lead (their first message, or the next one on a thread from before the office's CRM), Nhịp finds their lead in the office's CRM (by phone on WhatsApp, by the Zalo id it stored on Zalo) or creates one, in the background: name, phone or Zalo id, pipe, language, the extracted fields and a link to the thread, never message text. A burst of first messages makes one lead; a guest matching two leads is linked to neither. The thread header shows "In CRM: <name>". Offices are on the mock CRM until the admin's CRM setting (#62) and HubSpot (#65) land.

## 2026-10-03 (one queue rule)

### Changed

- **The nav's Your-turn count uses the queue rule.** It counts the thread summaries with the same rule as the inbox's list, instead of a second count in SQL, so a later change to what is in the queue (the CRM's resolved threads, spec #59) is made in the queue rules alone. No visible change.

## 2026-09-27 (send safety)

### Fixed

- **A failed reply is retried once.** Two approvals racing the retry of a `failed` Answer could both transmit; the retry is now guarded on `failed` and the loser gets `409 in_progress`.
- **A vendor retry is stored once.** A unique index on (thread, vendor message id), and one retry of the inbound write on a unique violation, so the same webhook landing twice, or a new guest's first two messages landing together, make one row and one thread.
- **Zalo replays are refused.** A signed Zalo timestamp more than 15 minutes from now fails verification.
- **One office per operator holds (ADR 0010).** The accept-invitation guard read a session that is empty in a before-hook and never fired; it reads the request's session now.

### Changed

- **Home counts replies sent from the vendor's app.** Engaged, in conversation and response time use the office's first reply, whether approved in Nhịp or sent from the WhatsApp or Zalo app. A live deployment leaves mock sends out.

## 2026-09-24 (operators end with their office)

### Changed

#### No office, no account (ADR 0013)

- When an operator's membership ends (the office is deleted, they are removed, or they leave), their account is deleted with its sessions, credentials and sent invitations. The platform admin keeps theirs.
- Deleting any account cancels its subscriptions, whichever path deletes it (self, admin, or the above); the kit did this on self-delete only.
- `Answer.operatorName` keeps the sender's name at approval, so a reply still says who sent it after the account is gone. `pnpm seed` fills it on existing Answers.

## 2026-09-20 (send contract)

### Changed

#### The Answer is the record of a send (ADR 0011)

- `Approval`, `Send` and `Message.claimedAt` fold into one `Answer` table: one row per guest message answered, written in status `sending` before the vendor is called, then `sent`, `failed` or `unknown`. Old files migrate on open.
- Approve names its target: the request carries `inboundId` and `reply`; `409 stale_target` when the guest wrote again, `400 inbound_required` and `400 empty_reply` otherwise. The reply box keys edits by the guest message, so a new message empties it.
- A vendor refusal or missing credentials is `failed` and may be approved again; a network failure, or a vendor success the app could not record, is `unknown` and refused with `409 delivery_unknown` until reconciled. Nothing is ever sent twice for one guest message.
- "Your turn" is derived from Answers, not message order: a guest message arriving mid-send stays in the queue.
- The guest's profile name is escaped in the follow-up prompt like the messages are (audit finding 7).
- `Conversation.lastSend` becomes `answers` and `lastAnswer`.

## 2026-09-20

### Added

#### Office tenancy and the Home screen (ADRs 0001, 0002, 0008)

- **The office is the tenant.** `Conversation.ownerUserId` becomes `officeId`, the kit organization's id. The store lists and reads strictly by office, and the "unowned is visible to everyone" fallback is gone. Files from before tenancy migrate on open (the column is dropped) and their threads wait unowned until `adoptUnownedThreads` runs; the seed does that for the walk office.
- **Session gate resolves the office.** `requireInboxSession` returns `{ userId, officeId }`: the session's active organization, else the first membership, else `403 no_office`. (Since superseded: the gate requires exactly one membership, refusing none with `no_office` and more than one with `ambiguous_office`, and refuses the platform admin; `apps/saas/modules/inbox/lib/office.ts`.) `POST /dev/inbound` needs a session and files under that office.
- **Pipe-to-office mapping.** `PipeConnection` (pipe + vendor id of the number or OA → office) replaces `INBOX_OWNER_USER_ID`. Webhook events carry `pipeExternalId` (WhatsApp `phone_number_id`, Zalo OA id) and are filed under the office that owns it; inbound on an unconnected pipe is dropped with a log line. `pnpm --filter saas pipe:connect` sets a mapping.
- **Walk office.** `pnpm seed` creates organization `walk-office` with the walk user as owner and active organization, and files the invented threads under it.
- **Home.** `/home` is enabled in the sidebar: the five funnel stages as cards, closings and lost showing "Connect your CRM", the rest and response time marked as coming next. No number on the screen looks like a fact yet.
- **Office assignment (ADR 0010).** The gate reads the operator's memberships on every request and never the session's active organization (a client-writable field); none is `403 no_office`, more than one `403 ambiguous_office`. Thread identity is (office, pipe, guest) with a unique index on the triple, so the same guest at two offices is two threads. Each message records the office endpoint it travelled through; a live send is refused with `409 pipe_not_configured` when the thread's number is not the one the credentials belong to (`ZALO_OA_ID` names the Zalo OA). Public sign-up is closed, operators cannot create organizations, and accepting a second office's invitation is refused. The seed adds `admin@nhip.local` (platform admin, owner of the walk office), and the sidebar shows **Admin** to platform admins.
- GPT-6-Astra architecture audit recorded in `reports/2026-09-20-gpt6-astra-architecture-audit.md`; its tenancy findings are addressed here, the send-contract findings go to the next PR.

## 2026-09-18

### Added

#### The conversation loop (ADR 0009: ADRs 0004, 0005, 0006, 0007)

- **Reply-only per-message approval.** `Approval` and `Send` record the guest message they answer (`answersMessageId`); the unique index moves from `Send.conversationId` to `Send.answersMessageId`, and the atomic claim moves from the thread to the inbound message (`Message.claimedAt`). `Conversation.sentAt` is the last office send and no longer terminal. Existing SQLite files migrate on open, and old sends are backfilled with the inbound they answered.
- **Your turn.** The queue's pending state is `Conversation.unansweredInboundId` (the guest spoke last). Views are `yourTurn`, `sent`, `all`. Threads the guest last touched more than 48 hours ago sit in a collapsed **Quiet** section at the bottom of Your turn. A second approve with no new inbound is `409 already_answered`.
- **Guest message translation.** Every guest message is translated into EN and VI at ingest, in the background, through the draft adapter, stored per message per operator language, and shown under the original. `GET /api/conversations?locale=` backfills missing translations.
- **AI follow-up drafts.** When a guest writes back after a send, the follow-up template appears at once and a model draft from the whole conversation replaces it when it lands. The reply box shows where the suggestion came from and has **Regenerate** (`POST /api/conversations/[id]/draft`). A post-check drops any draft that touches paperwork or ownership. The first reply keeps the template.
- **Draft adapter, vendor-neutral.** `DRAFT_API_KEY` + `DRAFT_MODEL` enable an OpenAI-compatible chat-completions client (`DRAFT_BASE_URL` defaults to OpenRouter; any vendor or a local Ollama is a config change, no SDK). A key without a model is a startup error. Unset means no translation and template drafts. Nothing in this path sends.
- The inbox client polls every 10 seconds. `CribLanguage` is renamed `OperatorLanguage` (CONTEXT.md).

## 2026-09-06

### Changed

#### Inbox walk UI (apps/saas, packages/ui, tooling/tailwind)

- Visual upgrade of the walk inbox (list, detail, sticky approve bar) and shared chrome (`NavBar`, `UserMenu`, `WalkLocaleToggle`). Routes, nav labels, the en+vi language control, and disabled Home / International are unchanged.
- The sidebar rail only collapses on click and uses a pointer cursor (no `w-resize` / `e-resize`). The mobile header shows the full **Nhịp** wordmark next to the logo, untruncated.
- The theme FOUC script no longer renders inside a client React tree. `@repo/ui` `ThemeProvider` / `useTheme` wrap `@teispace/next-themes`; layouts inject `getThemeScript()` in `<head>` with `noScript` so React 19 does not warn about `next-themes`' inline `<script>`. The light/dark/system toggle API is unchanged.
- The color mode toggle uses `cursor-pointer` / `resize-none` on the pill and every system/light/dark button, like the walk language toggle. The user-menu color-mode row is `cursor-default resize-none` so the sidebar rail cannot show a resize cursor between light and dark.
- Root docs are product-first: `README.md`, `PRODUCT.md`, `ARCHITECTURE.md`, and `HANDOFF.md`. Locale-prefixed inbox routes stay the rule; `AGENTS.md` stays the agent entry.
- The SaaS type stack is Be Vietnam Pro + IBM Plex Mono (Vietnamese-capable, not Inter). Olive tokens stay one green family, with `--touch` the single accent. Buttons keep the kit pill rule; inbox rows stay square; panels use the 8px radius.
- Thread rows use squircle initials, tabular timestamps, and compact status flags. Extract / crib / reply use hairline sections instead of generic cards. Loading uses list-shaped skeletons; load errors offer **Try again**.
- The sidebar wordmark is `inbox.brand` (Nhịp), not Acme.
- Inbox search is `h-12` with more padding. The desktop thread list is a locked `22rem` column (`flex: 0 0 22rem`) so long detail content cannot change its width.
- Walk-visible `inbox.*` and operator menu copy: EN chips use sentence case (`Needs approval`, `Sent`, `Demo send`). Crib is **Operator note**. VI is full Vietnamese (no Draft / inbound / interviewer leftovers; user menu is Cài đặt tài khoản / Giao diện / Đăng xuất).
- The sticky detail bar is **Approve and send** plus **Edit reply**. Idle **Not sent** stays an accessible live region but is visually hidden, so it does not look like a second button. Progress, errors, and **Sent {at}** stay muted under the row. Edit reply scrolls `#inbox-reply` into view and focuses it.
- SaaS uses next-intl locale prefixes (`/en/inbox`, `/vi/inbox`) with `defineRouting`, `createNavigation`, and `proxy.ts`. Cookie-only locale (no path prefix) is rejected for this walk. Bare `/inbox` and `/` go to a prefixed inbox. The walk language toggle navigates `/en/inbox` ↔ `/vi/inbox`. Walk bypass lands on `/{locale}/inbox`.
- `NextIntlClientProvider` receives `locale` on the `[locale]` layout so extract labels follow EN↔VI. English rent/buy values are **Rent** / **Buy** (not raw codes). Extract fields remount with `useLocale()`.

### Added

#### Walk / tunnel (apps/saas)

- `allowedDevOrigins: ["*.trycloudflare.com"]` so Cloudflare quick tunnels can load `/_next/*` during `next dev`.
- Optional local/tunnel walk flag `WALK_BYPASS_AUTH=1` (off by default, commented in `.env.local.example`) signs in the invented `walk@nhip.local` demo session at `GET /api/walk-bypass` and redirects to `NEXT_PUBLIC_SAAS_URL` + `/inbox`. It refuses in `NODE_ENV=production`; it is not an open door or “no login”. Inbox stays invented threads + mock send, and Better Auth stays enabled.

### Changed

#### Walk language (apps/saas)

- Walk chrome language lives in the Walk Operator **User menu**, directly under **Account settings**, as **Language** / **Ngôn ngữ** with **EN** / **VI** toggles only. Kit `de` / `es` / `fr` stay in `@repo/i18n` config but are not offered in the walk selector. The sidebar Account settings submenu drops Language. Login still uses the kit `LocaleSwitch`, and choosing a language still writes `NEXT_LOCALE` and refreshes.

#### Walk nav placeholders (apps/saas)

- **Start** is labeled **Home** / **Trang chủ** and stays in the sidebar as a disabled placeholder (`aria-disabled`, not clickable).
- **AI Chatbot** is labeled **International** / **Quốc tế** and stays as a disabled placeholder. Inbox remains the only working nav job; Account settings stays.

#### Inbox chrome experiment (apps/saas, packages/ui)

- Reversible look-only branch: kit `AppWrapper` / `NavBar` compose shadcn-style `Sidebar*` primitives from `@repo/ui` (provider, header/content/footer, grouped menus, icon collapse, mobile sheet). Inbox stays the only working job. Nav furniture is Home (disabled), Inbox, International (disabled), and Account settings.
- Sidebar tokens use a cooler sage palette (`--sidebar*`) so chrome reads differently from the olive page tokens. Landed on `main` with beautify and product-first docs in PR #8.

## 2026-09-05

### Changed

#### Inbox (apps/saas)

- Inbox is a first-class authenticated account route at `/inbox` (`(account)/inbox`, like chatbot), using kit `AppWrapper` / `NavBar` (mobile hamburger Sheet, desktop collapsible sidebar). The custom `InboxShell` rail is gone.
- `/` redirects to `/inbox`. Unauthenticated visits hit kit login; `redirectAfterSignIn` is `/inbox`. `pnpm seed` still writes invented threads to `data/nhip.db` and adds walk login `walk@nhip.local` / `walkthrough` when `DATABASE_URL` is Postgres. Organizations are not required; kit `hideOrganization` keeps the org switcher / create-org out of NavBar. Reports, International, billing, and orgs are not product features.
- Walk language sits in the Walk Operator user menu under Account settings (**EN** / **VI** only). Inbox list/detail no longer duplicate the Language control.
- Below Tailwind `md`, the inbox shows either the thread list or the selected thread. Detail opens from a list row and returns with an in-app **Back** control; the detail header shows the guest name. Desktop two-pane layout is unchanged.
- **Approve and send** (full label) and send status pin to a sticky detail bar, so the operator does not scroll past extract, crib, and reply. Reply stays editable above. One send path.
- Extract keeps the nine-field model, lists filled facts first, and collapses `(missing)` / `none mentioned` rows. Mentioned paperwork stays visible.
- Message and `sentAt` display use localized relative or local datetime. Storage stays ISO.
- Send status uses `role="status"` with `aria-live="polite"` and `aria-atomic="true"`.
- **For you** is omitted when there is no one-shot crib; empty extracts use `inbox.crib.emptyFacts`.
- Search sits in a full-width chrome row above the thread list and conversation pane (the width of list + detail, not the left shell nav).
- Kit `NavBar` adds **Inbox** as the live account job next to existing kit items. Reports and International are not shipped as nav.
- Inbox UI strings live under `inbox.*` in `packages/i18n/translations/{en,de,es,fr,vi}/saas.json`. Vietnamese is registered as BCP-47 `vi` in `packages/i18n/config.ts`. The **Language** / **Ngôn ngữ** control writes the kit `NEXT_LOCALE` cookie via `updateLocale`. Unknown codes such as `vn` fall back to English.
- **For you** crib body is formatted at read time from `inbox.crib` templates (not the seeded English-only string). Guest **Reply** stays in the guest's language. Inbox UI uses `useTranslations("inbox")` plus nested keys (`crib.body`, `fields.*`) so next-intl does not throw `MISSING_MESSAGE` for `inbox.crib`. Message JSON is imported statically from `@repo/i18n`.
- Vietnamese list states `inbox.loading` (`Đang tải cuộc hội thoại…`) and `inbox.loadError` (`Không tải được cuộc hội thoại.`) match the English keys.

### Fixed

#### Inbox (apps/saas)

- **Approve and send** refuses a second send on a thread that already has `sentAt` (`409 already_sent`). The button is disabled after a mock send, so a double tap cannot transmit twice.
- Inbox list shows a loading and load-error state instead of a false “No conversations.” when `/api/conversations` is still in flight or fails.
- Seed output reports fresh writes vs skipped existing IDs. Docs and `.env.local.example` state the repo-root SQLite path and that `SEND_MODE` is mock unless exactly `live`.

## 2026-08-30

### Added

#### Inbox (apps/saas)

- Ported the Nhịp inbox into `apps/saas`: thread list search, layman extract, **For you** (crib, not sent to the guest) above **Reply**, paperwork flag, **Approve and send** (mock). The default URL is the inbox on port **3010**. Auth is bypassed for the local walkthrough. `pnpm seed` seeds four invented threads (Minji, Yuki, Alexei, Thảo).
- New Prisma / Drizzle models in `packages/database`: `Pipe`, `Conversation`, `Message`, `Qualification`, `Draft`, `Paperwork`, `Approval`, `Send`. The walkthrough uses SQLite (`file:./data/nhip.db`). Inbox rows are not stored on User / Org / Plan / Subscription.

## 2026-08-18

### Changed

#### Dependencies

- **Production dependencies**: Bumped `es-toolkit` to `^1.51.0`. Run `pnpm install` after pulling; `pnpm-workspace.yaml` enforces `minimumReleaseAge: 1440` (one day).

## 2026-08-17

### Changed

#### UI

- **Toasts now use Base UI**: `packages/ui/components/toast.tsx` is rebuilt on `@base-ui/react/toast` (after the shadcn Base UI toast) and `sonner` is removed from the workspace. The `toastSuccess`, `toastError`, `toastInfo`, `toastWarning`, `toastLoading`, `toastPromise` and `dismiss` helpers are gone; use the exported `toast` manager (`toast.add({ title, description, type: "success" })`, `toast.close(id)`, `toast.promise(promise, { loading: { title }, success: { title }, error: { title } })`). `Toaster` still accepts `position` and takes a translated `closeLabel` for the dismiss button (`common.aria.closeToast`); the toast primitives (`Toast`, `ToastContent`, `ToastTitle`, `ToastDescription`, `ToastAction`, `ToastClose`, `ToastViewport`, ...) are exported for custom toasts. Run `pnpm install` after pulling.

#### Dependencies

- **Production dependencies**: Bumped `@hookform/resolvers` to `^5.9.0`. Run `pnpm install` after pulling; `pnpm-workspace.yaml` enforces `minimumReleaseAge: 1440` (one day).

## 2026-08-16

### Changed

#### Dependencies

- **Production dependencies**: Bumped `ai` to `^7.0.66`, `@ai-sdk/openai` to `^4.0.42`, `@ai-sdk/react` to `^4.0.69`, `@aws-sdk/client-s3` and `@aws-sdk/s3-request-presigner` to `3.1111.0`, `better-auth` and `@better-auth/passkey` to `1.6.29`, and `prisma-zod-generator` to `3.3.0`. **Development dependencies**: Bumped `turbo` to `^2.10.10`. Run `pnpm install` after pulling; `pnpm-workspace.yaml` enforces `minimumReleaseAge: 1440` (one day).

## 2026-08-15

### Changed

#### Dependencies

- **Production dependencies**: Bumped `ai` to `^7.0.65`, `@ai-sdk/react` to `^4.0.68`, `@aws-sdk/client-s3` and `@aws-sdk/s3-request-presigner` to `3.1110.0`, `@hookform/resolvers` to `^5.8.0`, `@next/third-parties` and `next` to `16.3.1`, `better-auth` and `@better-auth/passkey` to `1.6.28`, `fumadocs-core` and `fumadocs-ui` to `16.14.4`, `hono` to `^4.13.2`, `dodopayments` to `^2.46.0`, and `resend` to `^6.20.0`. Run `pnpm install` after pulling; `pnpm-workspace.yaml` enforces `minimumReleaseAge: 1440` (one day).

## 2026-08-14

### Changed

#### Dependencies

- **Production dependencies**: Bumped `ai` to `^7.0.64`, `@ai-sdk/openai` to `^4.0.41`, `@ai-sdk/react` to `^4.0.67`, and `@aws-sdk/client-s3` and `@aws-sdk/s3-request-presigner` to `3.1109.0`. Run `pnpm install` after pulling; `pnpm-workspace.yaml` enforces `minimumReleaseAge: 1440` (one day).

## 2026-08-13

### Changed

#### Page titles

- **Document title**: Marketing and SaaS use `{page} – {appName}` (en dash) instead of a pipe. Every SaaS page sets a title, so tabs read like `Welcome back – supastarter for Next.js Demo` rather than the product name alone.
- **Blog list**: The tab title and page-header eyebrow say `Blog`; the H1 stays `Notes from the product`.
- **Hero preview**: The dashboard mock’s drop shadow is no longer clipped at the bottom. The section drops `overflow-x-hidden` around the preview, and the mock has enough bottom padding for the full blur.

#### UI

- **Mail templates**: The shared mail wrapper is wider (640px) with more padding and 16px body copy, so transactional emails are less cramped. The primary button matches that scale.
- **Form controls**: Inputs, selects, and textareas use `rounded-xl` to sit closer to the pill buttons and other rounder surfaces.
- **Alerts**: Feedback alerts use `rounded-xl` to match the form controls. Success, error, and warning use Tailwind `green-800`/`green-400`, `red-700`/`red-400`, and `yellow-700`/`yellow-500` instead of custom oklch values.
- **Logo**: The middle bar of the shared Acme mark uses the chromatic olive touch color.
- **App icon**: Replaced the rocket `icon.png` in marketing, SaaS, and docs with the three-bar Acme mark, whose middle bar uses the chromatic olive touch color.
- **SaaS touch color**: The chromatic olive marks state in the product: active nav icons, settings/tab underlines, checked switches, unread notification badges, active/recommended plans, the chat send control, and organization logo placeholders.
- **Marketing type scale**: Replaced one-off font sizes (`text-[2.5rem]`, `text-[11px]`, and similar) with the nearest Tailwind tokens to keep marketing type on the shared scale.
- **Docs typography**: The docs app uses the marketing pairing—Inter for body copy and DM Sans for headings and the wordmark.
- **Accordion**: FAQ panels animate height with `--accordion-panel-height` and a longer ease, so open/close no longer snaps.
- **Locale switch**: Moved the duplicated marketing/SaaS language pickers into `@repo/ui`. Apps pass locales, the current value, and a persist callback, keeping the UI package free of `@repo/i18n`.
- **Feature headlines**: Product feature spreads drop the icon above the top-level title; the three-up benefit grid keeps it.
- **Inner pages**: Blog, changelog, and contact use the homepage’s left-aligned header (olive eyebrow, stacked title and lede). Changelog is a dated timeline with six example releases; the journal has product-shaped sample posts.
- **Marketing container**: The marketing `container` max-width steps down from `7xl` to `6xl`, narrowing the public pages.
- **SaaS logo**: The authenticated app and auth screens show only the three-bar mark, without the Acme wordmark.
- **Blog covers**: Each sample journal post has a product-frame cover, shown left of the title at full container width in the list; the article page already used the same `image` field.
- **Blog tags**: The journal list filters with `?tag=`. Tags on the list and article pages are links; the active tag (or All) clears the query.
- **Hero grid**: Removed the faint grid overlay from the marketing hero.
- **Trial copy**: FAQ and the billing journal post say 7-day trials, matching `trialPeriodDays` in the payments config.
- **Hero highlights**: Removed the Authentication / Organizations / Billing row under the homepage preview.
- **Headline wrapping**: Left-aligned headlines and subtitles use `text-pretty` so the last line rarely leaves a single word hanging. Centered headings keep `text-balance`.
- **Homepage sections**: Tighter vertical padding brings features, testimonials, pricing, FAQ, and the CTA closer together.

#### Dependencies

- **Production dependencies**: Bumped `ai` to `^7.0.62`, `@ai-sdk/openai` to `^4.0.40`, `@ai-sdk/react` to `^4.0.65`, `better-auth` and `@better-auth/passkey` to `1.6.27`, and `@aws-sdk/client-s3` and `@aws-sdk/s3-request-presigner` to `3.1108.0`. Run `pnpm install` after pulling; `pnpm-workspace.yaml` enforces `minimumReleaseAge: 1440` (one day).

---

## 2026-08-12

### Changed

#### Dependencies

- **Production dependencies**: Bumped `ai` to `^7.0.59`, `@ai-sdk/openai` to `^4.0.37`, `@ai-sdk/react` to `^4.0.62`, `@aws-sdk/client-s3` and `@aws-sdk/s3-request-presigner` to `3.1107.0`, `next-intl` to `4.13.6`, `use-intl` to `^4.13.6`, `resend` to `^6.19.0`, and `stripe` to `^22.5.0`. Run `pnpm install` after pulling; `pnpm-workspace.yaml` enforces `minimumReleaseAge: 1440` (one day).
- **Development dependencies**: Bumped `@shikijs/rehype` to `^4.4.3`, `oxlint` to `^1.78.0`, and `oxfmt` to `^0.63.0`.

---

## 2026-08-11

### Changed

#### Marketing redesign

- **Typography**: Marketing uses Inter for body copy and DM Sans for headlines (including the wordmark), with `text-balance` only on centered headlines and subtitles. The SaaS app uses Inter throughout.
- **Color scheme**: Shared tokens sit on Tailwind’s olive scale—warm olive-50 paper, olive-tinted borders, and olive-950 actions—giving the high-contrast ink look a quiet color in the Oatmeal olive theme’s family.
- **Marketing visual language**: Moved the public site toward a quieter Linear/Notion-like layout with UserJot-inspired structure—more vertical air, a left-aligned hero, stacked section titles with the lede underneath, a single bordered pricing table, and shared medium-weight page headers across blog, changelog, contact, and legal pages. A chromatic olive-green touch color plays the role of UserJot’s orange: a “New” pill, section labels, larger unboxed icons, checks, and secondary links. The faint hero grid stays; scroll reveals and hero fade-ins are gone.
- **Landing sections**: Added testimonials and a closing CTA band to the marketing homepage, richer example copy across marketing locales, and clearer shared pricing descriptions.
- **Visual polish**: The hero uses a live dashboard wireframe (sidebar, stats, placeholder) instead of screenshots, feature placeholders are CSS product frames with dummy portraits and plan icons, testimonials include example headshots, pricing leads with the amount, and the newsletter is a compact closer instead of a second CTA.
- **Logo**: Replaced the layered hex SVG with a stacked three-bar Acme mark (thin rounded bars forming a pyramid) and a semibold wordmark in the shared `Logo` component.
- **Color mode toggle**: Moved the duplicated marketing/SaaS pickers into `@repo/ui`. Apps pass translated labels as props, keeping the UI package free of `@repo/i18n`. The active option drops its drop shadow.

#### Dependencies

- **Production dependencies**: Bumped `lucide-react` to `^1.31.0`, `react-dropzone` to `^20.1.0`, and `sonner` to `^2.0.8`. Run `pnpm install` after pulling; `pnpm-workspace.yaml` enforces `minimumReleaseAge: 1440` (one day).
- **Development dependencies**: Bumped `fumadocs-core` and `fumadocs-ui` to `16.14.3`, `fumadocs-mdx` to `15.2.3`, and `tsx` to `^4.23.12`.

---

## 2026-08-10

### Changed

#### Dependencies

- **Production dependencies**: Bumped `@orpc/*` to `1.15.0`, `pg` to `^8.23.0`, and `@tanstack/react-table` to `^9.1.2`. Run `pnpm install` after pulling; `pnpm-workspace.yaml` enforces `minimumReleaseAge: 1440` (one day).

---

## 2026-08-09

### Changed

#### Dependencies

- **Production dependencies**: Bumped `ai` to `^7.0.58`, `@ai-sdk/openai` to `^4.0.36`, `@ai-sdk/react` to `^4.0.61`, `@aws-sdk/client-s3` and `@aws-sdk/s3-request-presigner` to `3.1106.0`, `@tanstack/react-table` to `^9.1.0`, `dodopayments` to `^2.45.1`, `hono` to `^4.13.1`, `lucide-react` to `^1.30.0`, `nodemailer` to `^9.0.5`, `react-email` to `^6.9.2`, and `react-hook-form` to `^7.85.0`. Run `pnpm install` after pulling; `pnpm-workspace.yaml` enforces `minimumReleaseAge: 1440` (one day).
- **Development dependencies**: Bumped `fumadocs-core` and `fumadocs-ui` to `16.14.2`, `@types/node` to `26.2.0`, `tsx` to `^4.23.11`, and `turbo` to `^2.10.9`.

---

## 2026-08-08

### Changed

#### Dependencies

- **Production dependencies**: Bumped `ai` to `^7.0.56`, `@ai-sdk/openai` to `^4.0.34`, `@ai-sdk/react` to `^4.0.59`, `@orpc/*` to `1.14.15`, `@aws-sdk/client-s3` and `@aws-sdk/s3-request-presigner` to `3.1105.0`, and `lucide-react` to `^1.29.0`. Run `pnpm install` after pulling; `pnpm-workspace.yaml` enforces `minimumReleaseAge: 1440` (one day).
- **Development dependencies**: Bumped `fumadocs-core` and `fumadocs-ui` to `16.14.1`, `postcss` to `8.5.26`, `tsx` to `^4.23.9`, and `typescript` to `7.0.2` (major upgrade: enabled `experimental.useTypeScriptCli` in Next.js app configs because TypeScript 7 drops the JavaScript compiler API). `@repo/logs` imports `createConsola` from `consola/core` for TypeScript 7's stricter module resolution.

---

## 2026-08-07

### Fixed

#### Auth

- **Social sign-in errors**: Failed OAuth/social sign-in API calls on the login and signup pages show an error toast instead of failing silently.

#### Admin

- **User list after delete**: Removing a user invalidates the admin users query, so the deleted row leaves the list without a manual refresh.
- **Organization list caches**: Admin organization create/update/delete also invalidates the user organization switcher list.

#### Organizations

- **Leave organization**: Removing a member (including leave) refreshes both the members query and the switcher's organization list.

#### Settings

- **Active sessions after password change**: Changing a password with `revokeOtherSessions` invalidates the active sessions list.

#### Organizations

- **Invitation accept button**: The organization invitation modal's Accept action uses the primary button variant, setting it apart from Decline.

#### Permissions

- **Admin layout Permix race**: The nested admin layout no longer calls `permix.check` before the authenticated layout may have finished `setup()`; it uses `checkPermission` for the user-scoped `admin.access` gate instead.

### Changed

#### Dependencies

- **Production dependencies**: Bumped `ai` to `^7.0.54`, `@ai-sdk/openai` to `^4.0.31`, `@ai-sdk/react` to `^4.0.57`, `@aws-sdk/client-s3` and `@aws-sdk/s3-request-presigner` to `3.1104.0`, `dodopayments` to `^2.45.0`, and `nuqs` to `^2.9.5`. Skipped `typescript` `7.x` (Next.js 16.3.x still probes `typescript/lib/typescript.js`, dropped in TypeScript 7). Run `pnpm install` after pulling; `pnpm-workspace.yaml` enforces `minimumReleaseAge: 1440` (one day).
- **Development dependencies**: Bumped `tsx` to `^4.23.8`.

---

## 2026-08-06

### Changed

#### Dependencies

- **Production dependencies**: Bumped `ai` to `^7.0.52`, `@ai-sdk/openai` to `^4.0.30`, `@ai-sdk/react` to `^4.0.55`, `better-auth` and `@better-auth/passkey` to `1.6.26`, `next-intl` and `use-intl` to `4.13.5`, `@aws-sdk/client-s3` and `@aws-sdk/s3-request-presigner` to `3.1103.0`, `@base-ui/react` to `^1.7.0`, `nodemailer` to `^9.0.4`, and `@tanstack/react-table` to `^9.0.0` (table components migrated to `useTable` with explicit `tableFeatures`). Skipped `typescript` `7.x` (Next.js 16.3.x still probes `typescript/lib/typescript.js`, dropped in TypeScript 7). Run `pnpm install` after pulling; `pnpm-workspace.yaml` enforces `minimumReleaseAge: 1440` (one day).
- **Development dependencies**: Bumped `@shikijs/rehype` to `^4.4.2` and `tsx` to `^4.23.6`.

---

## 2026-08-05

### Changed

#### Dependencies

- **Production dependencies**: Bumped `ai` to `^7.0.50`, `@ai-sdk/openai` to `^4.0.28`, `@ai-sdk/react` to `^4.0.53`, `@orpc/*` to `1.14.14`, `nanoid` to `^6.0.1`, `@aws-sdk/client-s3` and `@aws-sdk/s3-request-presigner` to `3.1102.0`, `hono` to `^4.13.0`, `next` to `^16.3.0`, and `@next/third-parties` to `16.3.0`. Removed the deprecated `@types/uuid` stub (`uuid` ships its own TypeScript definitions). Skipped `typescript` `7.x` (Next.js 16.3.x still probes `typescript/lib/typescript.js`, dropped in TypeScript 7). Run `pnpm install` after pulling; `pnpm-workspace.yaml` enforces `minimumReleaseAge: 1440` (one day).
- **Development dependencies**: Bumped `oxlint` to `^1.77.0` and `oxfmt` to `^0.62.0`.

---

## 2026-08-04

### Added

#### Admin

- **User bans**: Admin controls to ban users with an internal reason and optional expiration, review active ban details, and unban users.

#### Developer tooling

- **Agent skills**: Repository-scoped agent skills for common feature, auth, payments, database, docs, testing, and verification workflows.

#### Permissions

- **Permix authorization**: Introduced `@repo/permissions` with a typed permission matrix and `createPermissionRules` / `checkPermission` helpers. Permix is wired into oRPC (`permix/orpc`) for `adminProcedure` and organization/payment gates, and into the SaaS app via `permix/next` (server setup + dehydrate) and a client `PermixProvider` per the official Next.js integration (`setup` early, `dehydrate` → `PermixHydrate`, client `setup` for `isReady`, nested `setup` only when org context changes). UI guards use `permix.check` / `usePermissions().check` instead of scattered role string comparisons; `isOrganizationAdmin` / `isOrganizationOwner` remain as thin wrappers. Better Auth `organization.*` client endpoints stay on Better Auth's own access control. oRPC `protectedProcedure` sets user-scoped rules only (no per-request active-org membership fetch); org-scoped API checks resolve membership for the target organization. `checkPermission` reads the boolean matrix directly rather than constructing a Permix instance per call.

### Changed

#### Dependencies

- **Production dependencies**: Added `permix` `^4.1.2`. Bumped `@hookform/resolvers` to `^5.7.1`, `hono` to `^4.12.34`, and `react-dropzone` to `^20.0.0` (major upgrade: Node.js 22+ required, ESM-first package layout). Synced the lockfile for `fumadocs-mdx` `15.2.2`. Skipped `typescript` `7.x` (Next.js 16.2.x still probes `typescript/lib/typescript.js`, dropped in TypeScript 7) and `@types/uuid` (deprecated). Run `pnpm install` after pulling; `pnpm-workspace.yaml` enforces `minimumReleaseAge: 1440` (one day).
- **Development dependencies**: Bumped `tsx` to `^4.23.5`.

---

## 2026-08-03

### Fixed

#### Auth

- **Login tab order**: Moved the forgot-password link so keyboard navigation goes from the password field to the password visibility toggle before leaving the field group.

#### UI

- **Base UI migration follow-ups**: Repaired button `render` composition, dropdown link grouping, select popup sizing, and destructive confirmation styling after the Base UI migration.

### Changed

#### Dependencies

- **Production dependencies**: Bumped `ai` to `^7.0.48`, `@ai-sdk/react` to `^4.0.51`, `@hookform/resolvers` to `^5.6.0`, and `react-dropzone` to `^19.2.0`. Synced the lockfile to the catalog, including prior bumps for `ai` `^7.0.47`, `@ai-sdk/openai` `^4.0.27`, `@aws-sdk/client-s3` and `@aws-sdk/s3-request-presigner` `3.1101.0`, `dodopayments` `^2.44.0`, `hono` `^4.12.33`, `nuqs` `^2.9.4`, and `react-hook-form` `^7.84.0`. Skipped `typescript` `7.x` (Next.js 16.2.x still probes `typescript/lib/typescript.js`, dropped in TypeScript 7) and `@types/uuid` (deprecated). Run `pnpm install` after pulling; `pnpm-workspace.yaml` enforces `minimumReleaseAge: 1440` (one day).
- **Development dependencies**: Bumped `start-server-and-test` to `^3.0.12`. Synced the lockfile, including prior bumps for `@shikijs/rehype` `^4.4.1`, `prisma-zod-generator` `3.1.0`, and `turbo` `^2.10.8`.

---

## 2026-08-02

### Changed

#### Dependencies

- **Production dependencies**: Bumped `ai` to `^7.0.47`, `@ai-sdk/openai` to `^4.0.27`, `@ai-sdk/react` to `^4.0.50`, `@aws-sdk/client-s3` and `@aws-sdk/s3-request-presigner` to `3.1101.0`, `dodopayments` to `^2.44.0`, `hono` to `^4.12.33`, `nuqs` to `^2.9.4`, and `react-hook-form` to `^7.84.0`. Skipped `typescript` `7.x` (Next.js 16.2.x still probes `typescript/lib/typescript.js`, dropped in TypeScript 7) and `@types/uuid` (deprecated). Run `pnpm install` after pulling; `pnpm-workspace.yaml` enforces `minimumReleaseAge: 1440` (one day).
- **Development dependencies**: Bumped `@shikijs/rehype` to `^4.4.1`, `prisma-zod-generator` to `3.1.0`, and `turbo` to `^2.10.8`.

---

## 2026-07-31

### Fixed

- **Auth redirects**: Login, signup, OTP, and onboarding redirects are restricted to normalized root-relative SaaS paths, so untrusted `redirectTo` values cannot send users to external sites.
- **SaaS indexing**: Added app-wide `noindex, nofollow` robots metadata to keep authentication and protected SaaS pages out of search results.

### Changed

#### Headless UI library: Radix UI → Base UI

- **Breaking**: `packages/ui` builds on `@base-ui/react` instead of `radix-ui`, matching the TanStack Start version. Composition uses Base UI's `render` prop; the Radix `asChild` prop is removed from all components (no compatibility shim).
  - `<Button asChild><Link href="/" /></Button>` becomes `<Button render={(props) => <Link {...props} href="/" />} />`.
  - `<DropdownMenuTrigger asChild><Button /></DropdownMenuTrigger>` becomes `<DropdownMenuTrigger render={<Button />} />`.
  - `DropdownMenuItem` rendering a link needs `nativeButton={false}` alongside `render`.
- **State attributes**: Base UI `data-[open]`, `data-[closed]`, `data-[checked]`, `data-[starting-style]`, and `data-[ending-style]` replace Radix `data-[state=open|closed|checked]` variants. Update custom styles that target the old attributes.
- **CSS variables**: `--radix-accordion-content-height` → `--collapsible-panel-height`, `--radix-dropdown-menu-trigger-width` → `--anchor-width`.
- **Component API deltas**: `Tabs` uses `Tab`/`Panel` instead of `Trigger`/`Content`, `Accordion` takes `multiple`/`defaultValue` instead of `type`/`collapsible`, `TooltipProvider` takes `delay` instead of `delayDuration`, `DropdownMenuItem` uses `closeOnClick={false}` instead of `onSelect` + `preventDefault`, and `Select` accepts an `items` prop so `SelectValue` renders labels instead of raw values.
- **Dependencies**: Removed `radix-ui`; added `@base-ui/react` to the workspace catalog and `@repo/ui`.

#### Dependencies

- **Production dependencies**: Bumped `ai` to `^7.0.42`, `@ai-sdk/openai` to `^4.0.24`, `@ai-sdk/react` to `^4.0.45`, `@aws-sdk/client-s3` and `@aws-sdk/s3-request-presigner` to `3.1098.0`, `nuqs` to `^2.9.3`, `postcss` to `8.5.25`, and `stripe` to `^22.4.0`. Skipped `typescript` `7.x` (Next.js 16.2.x still probes `typescript/lib/typescript.js`, dropped in TypeScript 7) and `@types/uuid` (deprecated). Run `pnpm install` after pulling; `pnpm-workspace.yaml` enforces `minimumReleaseAge: 1440` (one day).

---

## 2026-07-30

### Changed

#### Dependencies

- **Production dependencies**: Bumped `ai` to `^7.0.41`, `@ai-sdk/openai` to `^4.0.23`, `@ai-sdk/react` to `^4.0.44`, `@orpc/client`, `@orpc/json-schema`, `@orpc/openapi`, `@orpc/server`, `@orpc/tanstack-query`, and `@orpc/zod` to `1.14.13`, `@aws-sdk/client-s3` and `@aws-sdk/s3-request-presigner` to `3.1097.0`, and `postcss` to `8.5.24`. Synced the lockfile to the catalog, including prior bumps for `@prisma/adapter-pg`, `@prisma/client`, `@prisma/nextjs-monorepo-workaround-plugin`, and `prisma` `7.9.1`, and `fumadocs-core` / `fumadocs-ui` `16.13.0`. Skipped `typescript` `7.x` (Next.js 16.2.x still probes `typescript/lib/typescript.js`, dropped in TypeScript 7) and `@types/uuid` (deprecated). Run `pnpm install` after pulling; `pnpm-workspace.yaml` enforces `minimumReleaseAge: 1440` (one day).
- **Development dependencies**: Bumped `resend` to `^6.18.1` in `@repo/mail`.

---

## 2026-07-29

### Changed

#### Dependencies

- **Production dependencies**: Bumped `ai` to `^7.0.40`, `@ai-sdk/openai` to `^4.0.22`, `@ai-sdk/react` to `^4.0.43`, `@orpc/client`, `@orpc/json-schema`, `@orpc/openapi`, `@orpc/server`, `@orpc/tanstack-query`, and `@orpc/zod` to `1.14.12`, `@aws-sdk/client-s3` and `@aws-sdk/s3-request-presigner` to `3.1096.0`, `@prisma/adapter-pg`, `@prisma/client`, `@prisma/nextjs-monorepo-workaround-plugin`, and `prisma` to `7.9.1`, and `fumadocs-core` / `fumadocs-ui` to `16.13.0`. Skipped `typescript` `7.x` (Next.js 16.2.x still probes `typescript/lib/typescript.js`, dropped in TypeScript 7) and `@types/uuid` (deprecated). Run `pnpm install` after pulling; `pnpm-workspace.yaml` enforces `minimumReleaseAge: 1440` (one day).
- **Development dependencies**: Bumped `@types/node` to `26.1.2`, `oxlint` to `^1.76.0`, and `oxfmt` to `^0.61.0`.

---

## 2026-07-28

### Changed

#### Dependencies

- **Production dependencies**: Bumped `@orpc/client`, `@orpc/json-schema`, `@orpc/openapi`, `@orpc/server`, `@orpc/tanstack-query`, and `@orpc/zod` to `1.14.10`, and `@hookform/resolvers` to `^5.5.7`. Upgraded `prisma-zod-generator` to `3.0.1` (major) and regenerated Prisma Zod schemas. Skipped `typescript` `7.x` (Next.js 16.2.x still probes `typescript/lib/typescript.js`, dropped in TypeScript 7) and `@types/uuid` (deprecated). Run `pnpm install` after pulling; `pnpm-workspace.yaml` enforces `minimumReleaseAge: 1440` (one day).
- **Development dependencies**: Bumped `turbo` to `^2.10.7`.

---

## 2026-07-27

### Fixed

#### API

- **Organization billing authorization**: Listing purchases requires organization membership, and creating organization checkout sessions requires an owner or administrator role. Inaccessible customer portal purchases return `NOT_FOUND` to prevent resource enumeration.
- **Payment redirects**: Restrict checkout and customer portal return URLs to the configured SaaS application origin.
- **AI message validation**: Validate incoming UI messages with the AI SDK before converting them or invoking the model.

### Changed

#### API

- **Response contracts**: Added explicit, co-located Zod output schemas to every oRPC procedure and removed redundant notification response remapping.

#### SaaS app

- **Organization role select**: Removed secondary role descriptions and their unused translation keys from the organization role select, which shows only compact role names.

#### Dependencies

- **Production dependencies**: Bumped `@ai-sdk/anthropic` to `^4.0.21`, `next` to `^16.2.12`, `@next/third-parties` to `16.2.12`, `lucide-react` to `^1.27.0`, `radix-ui` to `^1.6.7`, and `recharts` to `^3.10.1`. Synced the lockfile to the catalog, including prior bumps for `ai` `^7.0.37`, `@ai-sdk/openai` `^4.0.20`, `@ai-sdk/react` `^4.0.40`, `@aws-sdk/client-s3` / `@aws-sdk/s3-request-presigner` `3.1095.0`, `better-auth` `1.6.25`, `hono` `^4.12.32`, `next-intl` `4.13.4`, `fumadocs-core` / `fumadocs-ui` `16.12.1`, and related catalog entries. Skipped `typescript` `7.x` (Next.js 16.2.x still probes `typescript/lib/typescript.js`, dropped in TypeScript 7), `@types/uuid` (deprecated), and `@orpc/*` `1.14.10`, `@hookform/resolvers` `5.5.3`, `prisma-zod-generator` `2.8.1`, and `turbo` `2.10.7` (published within the one-day `minimumReleaseAge` window). Run `pnpm install` after pulling; `pnpm-workspace.yaml` enforces `minimumReleaseAge: 1440` (one day).

---

## 2026-07-26

### Changed

#### Dependencies

- **Production dependencies**: Bumped `@aws-sdk/client-s3` and `@aws-sdk/s3-request-presigner` to `3.1095.0`, `hono` to `^4.12.32`, `@ai-sdk/anthropic` to `^4.0.20`, `dodopayments` to `^2.43.0`, `es-toolkit` to `^1.50.0`, `react-hook-form` to `^7.83.0`, and `nuqs` to `^2.9.2`. Synced the lockfile to the catalog, including prior bumps for `ai` `^7.0.37`, `@ai-sdk/openai` `^4.0.20`, `@ai-sdk/react` `^4.0.40`, `better-auth` `1.6.25`, `lucide-react` `^1.26.0`, `next-intl` `4.13.4`, `fumadocs-core` / `fumadocs-ui` `16.12.1`, and `react-email` `^6.9.1`. Skipped `typescript` `7.x` (Next.js 16.2.x still probes `typescript/lib/typescript.js`, dropped in TypeScript 7), `@types/uuid` (deprecated), and `@ai-sdk/anthropic` `4.0.21` and `turbo` `2.10.7` (published within the one-day `minimumReleaseAge` window). Run `pnpm install` after pulling; `pnpm-workspace.yaml` enforces `minimumReleaseAge: 1440` (one day).
- **Development dependencies**: Bumped `postcss` to `8.5.23` and `@playwright/test` to `^1.62.0`.

---

## 2026-07-25

### Changed

#### Dependencies

- **Production dependencies**: Bumped `ai` to `^7.0.37`, `@ai-sdk/anthropic` to `^4.0.19`, `@ai-sdk/openai` to `^4.0.20`, `@ai-sdk/react` to `^4.0.40`, `@aws-sdk/client-s3` and `@aws-sdk/s3-request-presigner` to `3.1094.0`, `better-auth` to `1.6.25`, `@better-auth/passkey` to `^1.6.25`, `lucide-react` to `^1.26.0`, `next-intl` to `4.13.4`, `use-intl` to `^4.13.4`, `openai` to `^6.49.0`, `fumadocs-core` / `fumadocs-ui` to `16.12.1`, and `react-email` to `^6.9.1`. Skipped `typescript` `7.x` (Next.js 16.2.x still probes `typescript/lib/typescript.js`, dropped in TypeScript 7) and `@types/uuid` (deprecated). Run `pnpm install` after pulling; `pnpm-workspace.yaml` enforces `minimumReleaseAge: 1440` (one day).
- **Development dependencies**: Synced `postcss` to `8.5.22`, `radix-ui` to `^1.6.5`, and `turbo` to `^2.10.6` in the lockfile.

---

## 2026-07-24

### Changed

#### Dependencies

- **Production dependencies**: Bumped `ai` to `^7.0.35`, `@ai-sdk/openai` to `^4.0.18`, `@ai-sdk/react` to `^4.0.38`, `@aws-sdk/client-s3` and `@aws-sdk/s3-request-presigner` to `3.1093.0`, `better-auth` to `1.6.24`, `@better-auth/passkey` to `^1.6.24`, `postcss` to `8.5.22`, `radix-ui` to `^1.6.5`, and `fumadocs-core` / `fumadocs-ui` to `16.12.0`. Skipped `typescript` `7.x` (Next.js 16.2.x still probes `typescript/lib/typescript.js`, dropped in TypeScript 7) and `@types/uuid` (deprecated). Run `pnpm install` after pulling; `pnpm-workspace.yaml` enforces `minimumReleaseAge: 1440` (one day).
- **Development dependencies**: Bumped `turbo` to `^2.10.6`.

---

### Changed

#### Dependencies

- **Production dependencies**: Bumped `ai` to `^7.0.34`, `@ai-sdk/openai` to `^4.0.17`, `@ai-sdk/react` to `^4.0.37`, `@aws-sdk/client-s3` and `@aws-sdk/s3-request-presigner` to `3.1092.0`, `next` to `^16.2.11`, `@next/third-parties` to `16.2.11`, `next-intl` to `4.13.3`, `use-intl` to `^4.13.3`, `postcss` to `8.5.21`, `react` and `react-dom` to `19.2.8`, `@tanstack/react-query` to `^5.101.4`, and `resend` to `^6.18.0`. Skipped `typescript` `7.x` (Next.js 16.2.x still probes `typescript/lib/typescript.js`, dropped in TypeScript 7) and `@types/uuid` (deprecated). Run `pnpm install` after pulling; `pnpm-workspace.yaml` enforces `minimumReleaseAge: 1440` (one day).
- **Development dependencies**: Bumped `oxlint` to `^1.75.0`, `oxfmt` to `^0.60.0`, and `oxlint-tsgolint` to `^7.0.2001` (major upgrade).

---

## 2026-07-22

### Changed

#### Dependencies

- **Production dependencies**: Bumped `ai` to `^7.0.32`, `@ai-sdk/react` to `^4.0.35`, `@aws-sdk/client-s3` and `@aws-sdk/s3-request-presigner` to `3.1091.0`, `@prisma/adapter-pg`, `@prisma/client`, and `@prisma/nextjs-monorepo-workaround-plugin` to `7.9.0`, `prisma` to `7.9.0`, `radix-ui` to `^1.6.4`, `recharts` to `^3.10.0`, `@tanstack/react-query` to `^5.101.3`, and `@polar-sh/sdk` to `^0.49.0`. Skipped `@types/uuid` (deprecated). Run `pnpm install` after pulling; `pnpm-workspace.yaml` enforces `minimumReleaseAge: 1440` (one day).
- **Development dependencies**: Reverted `typescript` to `6.0.3`: Next.js 16.2.x still probes `typescript/lib/typescript.js`, which TypeScript 7 drops, so `next typegen` failed in CI and left generated route types (`PageProps`, `LayoutProps`, `RouteContext`) undefined.

---

## 2026-07-21

### Changed

#### Dependencies

- **Production dependencies**: Bumped `nuqs` to `^2.9.1`, `postcss` to `8.5.20`, and `react-dropzone` to `^19.1.1`. Skipped `radix-ui` `1.6.3` (published within the one-day `minimumReleaseAge` window) and `@types/uuid` (deprecated).
- **Development dependencies**: Kept `typescript` on `6.0.3` because Next.js 16.2.x does not yet support TypeScript 7's native package layout. Run `pnpm install` after pulling; `pnpm-workspace.yaml` enforces `minimumReleaseAge: 1440` (one day).

---

## 2026-07-20

### Changed

#### Dependencies

- **Production dependencies**: Bumped `hono` to `^4.12.31` and `react-dropzone` to `^19.0.2` (major upgrade: accepts in-limit files instead of rejecting the whole batch). Skipped `typescript` `7.x` (major upgrade pending ecosystem support) and `@types/uuid` (deprecated). Run `pnpm install` after pulling; `pnpm-workspace.yaml` enforces `minimumReleaseAge: 1440` (one day).

---

## 2026-07-19

### Changed

#### Dependencies

- **Production dependencies**: Bumped `ai` to `^7.0.31`, `@ai-sdk/anthropic` to `^4.0.16`, `@ai-sdk/openai` to `^4.0.16`, `@ai-sdk/react` to `^4.0.34`, `@aws-sdk/client-s3` and `@aws-sdk/s3-request-presigner` to `3.1090.0`, `lucide-react` to `^1.25.0`, and `react-hook-form` to `^7.82.0`. Synced the lockfile for the previous run's catalog upgrades (including `fumadocs` 16.11.5/15.2.0, `react-email` 6.9.0, `stripe` 22.3.2, and `tailwindcss` 4.3.3). Skipped `typescript` `7.x` (major upgrade pending ecosystem support) and `@types/uuid` (deprecated). Run `pnpm install` after pulling; `pnpm-workspace.yaml` enforces `minimumReleaseAge: 1440` (one day).
- **Development dependencies**: Synced `oxlint-tsgolint` to `^0.25.0`.

---

## 2026-07-18

### Changed

#### Dependencies

- **Production dependencies**: Bumped `ai` to `^7.0.30`, `@ai-sdk/openai` to `^4.0.15`, `@ai-sdk/react` to `^4.0.33`, `@aws-sdk/client-s3` and `@aws-sdk/s3-request-presigner` to `3.1089.0`, `fumadocs-core` and `fumadocs-ui` to `16.11.5`, `fumadocs-mdx` to `15.2.0`, `react-email` to `^6.9.0`, and `stripe` to `^22.3.2`. Skipped `typescript` `7.x` (major upgrade pending ecosystem support) and `@types/uuid` (deprecated). Run `pnpm install` after pulling; `pnpm-workspace.yaml` enforces `minimumReleaseAge: 1440` (one day).
- **Development dependencies**: Bumped `@tailwindcss/postcss` to `^4.3.3`, `tailwindcss` to `4.3.3`, and `oxlint-tsgolint` to `^0.25.0`.

---

## 2026-07-17

### Changed

#### Apps

- **Favicons**: Aligned the marketing and docs favicons with the updated SaaS app icon, so all shipped apps use the same rocket icon.

---

## 2026-07-16

### Fixed

- **Avatar crop dialog**: The Cropper.js canvas and shade stay inside the dialog, so resizing the crop area no longer overflows the modal. The initial crop selection covers 95% of the available area, keeping drag handles visible.

### Changed

#### Theme and UI

- **Font**: Replaced Figtree with Plus Jakarta Sans in the SaaS and marketing app layouts.
- **Color tokens**: Switched the shared theme from stone to zinc neutrals, with slate primary accents in light and dark mode (`tooling/tailwind/theme.css`).
- **Buttons**: Hover states use `color-mix` for primary/secondary/destructive; outline buttons use foreground-based borders and hover fills.
- **Dialogs and menus**: Alert dialogs use `bg-card` with larger radius; dialogs use `rounded-2xl`; dropdown menus use `rounded-xl`.
- **Logo**: Slightly smaller default logo mark (`size-8`).

#### SaaS app

- **App shell**: Removed the floating content card. Navbar and main content share one background, separated by a border; content padding aligns with the navbar.
- **Navbar collapse**: Replaced the header toggle with a Vercel-style edge drag strip (hover chip) that expands/collapses the sidebar. Active nav items use a muted background instead of a bordered card. Expanded mode shows the logo label.
- **Organization select**: Card-styled trigger with tighter padding; the dropdown uses a regular width with the trigger as min-width and opens to the right when the sidebar is collapsed. A tighter plan label line-height keeps the trigger height stable. Personal account uses a user icon (instead of the profile photo), drops the group title, and shows the “Personal account” label as the row text.
- **Organization grid**: Organization logos use rounded corners to match the refreshed cards.
- **User menu**: Dropdown uses a regular width with the trigger as min-width; opens above (expanded), to the right (collapsed desktop), or below and right-aligned (mobile).
- **Auth screens**: Removed the bordered auth card wrapper; titles and subtitles are centered. Login/signup divider labels use `bg-background`.
- **Settings**: Simplified active sessions and connected accounts rows (no bordered cards); settings item headers get consistent bottom padding on wide layouts.
- **App icon**: Updated the SaaS app icon asset.

#### Marketing

- **Hero**: Dropped the primary-tinted gradient background; the hero media frame uses `bg-muted`.
- **Consent banner**: The Allow action explicitly uses the primary button variant.

#### Database

- **Two-factor authentication**: Added `failedVerificationCount` and `lockedUntil` to the `TwoFactor` model in Prisma and the PostgreSQL, MySQL, and SQLite Drizzle schemas. Apply with your usual database push/migrate workflow.

#### Dependencies

- **Production dependencies**: Bumped `ai` to `^7.0.28`, `@ai-sdk/anthropic` to `^4.0.15`, `@ai-sdk/openai` to `^4.0.14`, `@ai-sdk/react` to `^4.0.30`, `@aws-sdk/client-s3` and `@aws-sdk/s3-request-presigner` to `3.1087.0`, and `openai` to `^6.47.0`. Synced the lockfile for earlier runs' catalog upgrades (including major upgrades for `ai` 7.x, `@ai-sdk/*` 4.x, `cookie` 2.x, `cropperjs` 2.x, `nanoid` 6.x, and `react-dropzone` 17.x). Skipped `typescript` `7.x` (major upgrade pending ecosystem support) and `@types/uuid` (deprecated). Run `pnpm install` after pulling; `pnpm-workspace.yaml` enforces `minimumReleaseAge: 1440` (one day).
- **Development dependencies**: Bumped `oxlint` to `^1.74.0`, `oxfmt` to `^0.59.0`, and `turbo` to `^2.10.5`.

---

## 2026-07-15

### Fixed

- Removed the stale `cropperjs/dist/cropper.css` import from the SaaS app root layout; the file no longer exists in the package (Cropper.js v2 ships its styles inside its web components), which broke the Next.js production build. Aligned the avatar crop dialog with the TanStack Start implementation, including shade clipping and layout styles for the Cropper.js v2 web component API.

### Changed

#### Mail

- **Default provider**: Switched the default mail provider export from Plunk to Resend and removed the Plunk provider and the `PLUNK_API_KEY` example environment variable.

#### Dependencies

- **Production dependencies**: Bumped `fumadocs-core` and `fumadocs-ui` to `16.11.4`, `fumadocs-mdx` to `15.1.1`, and `react-email` to `^6.8.1`. Skipped `ai` `7.0.26`, `@ai-sdk/*` `4.0.13`/`4.0.14`/`4.0.27`, and `@aws-sdk/*` `3.1086.0` (under 24 hours old), plus `typescript` `7.x` (major upgrade awaiting ecosystem support) and `@types/uuid` (deprecated). Run `pnpm install` after pulling; `pnpm-workspace.yaml` enforces `minimumReleaseAge: 1440` (one day).
- **Development dependencies**: Bumped `postcss` to `8.5.19`. Skipped `turbo` `2.10.5` (under 24 hours old).

---

## 2026-07-14

### Changed

#### Dependencies

- **Production dependencies**: Bumped `@orpc/*` to `1.14.8`, `hono` to `^4.12.30`, `nanoid` to `^6.0.0`, and `react-dropzone` to `^17.0.0`. Synced the lockfile for earlier catalog upgrades (including `ai` 7.x, `@ai-sdk/*` 4.x, `cookie` 2.x, and `cropperjs` 2.x). Skipped `typescript` `7.x` (major upgrade awaiting ecosystem support) and `@types/uuid` (deprecated). Run `pnpm install` after pulling; `pnpm-workspace.yaml` enforces `minimumReleaseAge: 1440` (one day).
- **Development dependencies**: Bumped `postcss` to `8.5.18` and `tsx` to `^4.23.1`.

---

## 2026-07-13

### Changed

#### Dependencies

- **Production dependencies**: Bumped `fumadocs-core` and `fumadocs-ui` to `16.11.3`. Skipped `typescript` `7.x` (major upgrade awaiting ecosystem support) and `@types/uuid` (deprecated). Run `pnpm install` after pulling; `pnpm-workspace.yaml` enforces `minimumReleaseAge: 1440` (one day).
- **Development dependencies**: Bumped `postcss` to `8.5.17`.

---

## 2026-07-12

### Changed

#### Dependencies

- **Production dependencies**: Bumped `ai` to `^7.0.22`, `@ai-sdk/anthropic` to `^4.0.12`, `@ai-sdk/react` to `^4.0.23`, `@aws-sdk/client-s3` and `@aws-sdk/s3-request-presigner` to `3.1085.0`, `hono` to `^4.12.29`, `next-intl` to `4.13.2`, `use-intl` to `^4.13.2`, `fumadocs-core` / `fumadocs-ui` to `16.11.2`, and `react-email` to `^6.7.0`. Synced the lockfile for the previous run's catalog upgrades. Skipped `typescript` `7.x` (major upgrade awaiting ecosystem support) and `@types/uuid` (deprecated). Run `pnpm install` after pulling; `pnpm-workspace.yaml` enforces `minimumReleaseAge: 1440` (one day).
- **Development dependencies**: Bumped `oxfmt` to `0.58.0`, `oxlint` to `1.73.0`, `turbo` to `2.10.4`, and `@types/node` to `26.1.1`.

---

## 2026-07-11

### Changed

#### Dependencies

- **Production dependencies**: Bumped `ai` to `^7.0.19`, `@ai-sdk/anthropic` to `^4.0.11`, `@ai-sdk/openai` to `^4.0.11`, `@ai-sdk/react` to `^4.0.20`, `@aws-sdk/client-s3` and `@aws-sdk/s3-request-presigner` to `3.1084.0`, `dodopayments` to `^2.42.2`, `lucide-react` to `^1.24.0`, `openai` to `^6.46.0`, `react-email` to `^6.6.9`, and `stripe` to `^22.3.1`. Skipped `typescript` `7.x` (major upgrade awaiting ecosystem support) and `@types/uuid` (deprecated). Run `pnpm install` after pulling; `pnpm-workspace.yaml` enforces `minimumReleaseAge: 1440` (one day).

---

## 2026-07-10

### Changed

#### Dependencies

- **Production dependencies**: Synced the lockfile with the catalog major upgrades (`ai` `^7.0.16`, `@ai-sdk/*` `^4.0.x`, `cookie` `^2.0.1`, `cropperjs` `2.1.1`, `resend` `^6.17.2`, `nodemailer` `^9.0.3`, and related packages). Bumped `@aws-sdk/client-s3` and `@aws-sdk/s3-request-presigner` to `3.1083.0`.
- **Development dependencies**: Bumped `@types/node` to `26.1.1`. Skipped `ai` `7.0.18`, `@ai-sdk/react` `4.0.19`, `@ai-sdk/openai` `4.0.9`, and `@aws-sdk/*` `3.1084.0` (under 24 hours old). Run `pnpm install` after pulling; `pnpm-workspace.yaml` enforces `minimumReleaseAge: 1440` (one day).

---

## 2026-07-09

### Changed

#### Dependencies

- **Production dependencies**: Synced the lockfile with the catalog major upgrades (`ai` `^7.0.16`, `@ai-sdk/*` `^4.0.x`, `cookie` `^2.0.1`, `cropperjs` `2.1.1`, `resend` `^6.17.1`, `nodemailer` `^9.0.3`, and related packages). Bumped `dodopayments` to `^2.42.1`, `react-email` to `^6.6.8`, `fumadocs-core` / `fumadocs-ui` to `16.11.1`, and `fumadocs-mdx` to `15.1.0`.
- **Development dependencies**: Bumped `vitest` and `@vitest/coverage-v8` to `^4.1.10`, `turbo` to `^2.10.4`, `oxlint` to `^1.73.0`, and `oxfmt` to `^0.58.0`. Skipped `ai` `7.0.17`, `@ai-sdk/react` `4.0.18`, and `@aws-sdk/*` `3.1081.0` (under 24 hours old). Run `pnpm install` after pulling; `pnpm-workspace.yaml` enforces `minimumReleaseAge: 1440` (one day).

---

## 2026-07-08

### Changed

- **Dependabot**: Removed the `.github/dependabot.yml` configuration. Dependency updates are manual or can be automated with AI agent tools such as Cursor Automations or Claude Code Routines. `pnpm-workspace.yaml` still enforces `minimumReleaseAge: 1440` (one day) on install.

#### Dependencies

- **Production dependencies**: Bumped `ai` to `^7.0.16`, `@ai-sdk/react` to `^4.0.17`, `@orpc/*` to `1.14.7`, `hono` to `^4.12.28`, `dodopayments` to `^2.42.0`, `@aws-sdk/client-s3` and `@aws-sdk/s3-request-presigner` to `3.1080.0`, and `radix-ui` to `^1.6.2`.
- **Development dependencies**: Bumped `vitest` and `@vitest/coverage-v8` to `^4.1.10`, `turbo` to `^2.10.4`, `oxlint` to `^1.73.0`, and `oxfmt` to `^0.58.0`. Run `pnpm install` after pulling; `pnpm-workspace.yaml` enforces `minimumReleaseAge: 1440` (one day).

---

## 2026-07-07

### Changed

#### Dependencies

- **Production dependencies**: Bumped `@ai-sdk/openai` to `^4.0.8`. Skipped the other available updates (`ai` 7.0.16, `@ai-sdk/react` 4.0.17, `dodopayments` 2.42.0, `hono` 4.12.28, `@aws-sdk/client-s3` 3.1080.0, `oxlint` 1.73.0, `oxfmt` 0.58.0, and `turbo` 2.10.4) as under 24 hours old. Run `pnpm install` after pulling; `pnpm-workspace.yaml` enforces `minimumReleaseAge: 1440` (one day).

---

## 2026-07-06

### Changed

#### Dependencies

- **Production dependencies**: Bumped `ai` to `^7.0.15`, `@ai-sdk/anthropic` to `^4.0.8`, `@ai-sdk/react` to `^4.0.16`, `react-hook-form` to `^7.81.0`, and `dodopayments` to `^2.41.0`. Run `pnpm install` after pulling; `pnpm-workspace.yaml` enforces `minimumReleaseAge: 1440` (one day).

---

## 2026-07-05

### Changed

#### Dependencies

- **Production dependencies**: Bumped `recharts` to `^3.9.2` and `resend` to `^6.17.1`.
- **Development dependencies**: Bumped `@shikijs/rehype` to `^4.3.1`, `tsx` to `^4.23.0`, and `turbo` to `^2.10.3`. Run `pnpm install` after pulling; `pnpm-workspace.yaml` enforces `minimumReleaseAge: 1440` (one day).

---

## 2026-07-04

### Changed

#### Dependencies

- **Production dependencies**: Bumped `ai` to `^7.0.14`, `@ai-sdk/anthropic` to `^4.0.7`, `@ai-sdk/openai` to `^4.0.7`, `@ai-sdk/react` to `^4.0.15`, `@aws-sdk/client-s3` and `@aws-sdk/s3-request-presigner` to `3.1079.0`, and `react-email` to `^6.6.6`. Run `pnpm install` after pulling; `pnpm-workspace.yaml` enforces `minimumReleaseAge: 1440` (one day).
- **Development dependencies**: Bumped `tsx` to `^4.22.5`.

---

## 2026-07-03

### Changed

#### Dependencies

- **Production dependencies**: Bumped `ai` to `^7.0.11`, `@ai-sdk/anthropic` to `^4.0.5`, `@ai-sdk/openai` to `^4.0.5`, `@ai-sdk/react` to `^4.0.12`, `@aws-sdk/client-s3` and `@aws-sdk/s3-request-presigner` to `3.1078.0`, `next` to `^16.2.10`, `@next/third-parties` to `16.2.10`, `next-intl` and `use-intl` to `4.13.1`, `lucide-react` to `^1.23.0`, `nuqs` to `^2.9.0`, `radix-ui` to `^1.6.1`, `recharts` to `^3.9.1`, `nodemailer` to `^9.0.3`, and `sharp` to `^0.35.3`. Run `pnpm install` after pulling; `pnpm-workspace.yaml` enforces `minimumReleaseAge: 1440` (one day).
- **Development dependencies**: Bumped `@types/node` to `26.1.0`, `turbo` to `^2.10.2`, and `oxlint-tsgolint` to `^0.24.0`.

---

## 2026-07-01

### Changed

#### Dependencies

- **Production dependencies**: Bumped `ai` to `^7.0.7`, `@ai-sdk/anthropic` to `^4.0.2`, `@ai-sdk/openai` to `^4.0.3`, `@ai-sdk/react` to `^4.0.8`, Better Auth to `1.6.23`, `@better-auth/passkey` to `^1.6.23`, `@aws-sdk/client-s3` and `@aws-sdk/s3-request-presigner` to `3.1076.0`, `fumadocs-core` and `fumadocs-ui` to `16.10.7`, and `tailwindcss` to `4.3.2`. Run `pnpm install` after pulling; `pnpm-workspace.yaml` enforces `minimumReleaseAge: 1440` (one day).
- **Development dependencies**: Bumped `oxlint` to `^1.72.0`, `oxfmt` to `^0.57.0`, and `turbo` to `^2.10.1`.

---

## 2026-07-02

### Changed

#### Dependencies

- **Development dependencies**: Bumped `oxlint-tsgolint` to `0.24.0` and Turborepo to `2.10.2`. Run `pnpm install` after pulling; `pnpm-workspace.yaml` enforces `minimumReleaseAge: 1440` (one day).

---

## 2026-06-30

### Changed

#### Dependencies

- **Production dependencies**: Major upgrades — `ai` to `^7.0.4`, `@ai-sdk/anthropic` to `^4.0.1`, `@ai-sdk/openai` to `^4.0.2`, `@ai-sdk/react` to `^4.0.5`, `cookie` to `^2.0.0`, and `cropperjs` to `2.1.1`. Replaced `react-cropper` with native Cropper.js v2 integration in the avatar crop dialog. Run `pnpm install` after pulling; `pnpm-workspace.yaml` enforces `minimumReleaseAge: 1440` (one day).

---

## 2026-06-30 (earlier)

### Changed

#### Dependencies

- **Production dependencies**: Bumped `@ai-sdk/anthropic` to `^3.0.89`, `@ai-sdk/openai` to `^3.0.77`, `@ai-sdk/react` to `^3.0.216`, and `ai` to `^6.0.214`. Skipped major upgrades to `ai` 7.x, `@ai-sdk/*` 4.x, `cookie` 2.x, and `cropperjs` 2.x pending migration work.
- **Development dependencies**: Bumped `@types/node` to `26.0.1` and `prettier` to `3.9.3`. Run `pnpm install` after pulling; `pnpm-workspace.yaml` enforces `minimumReleaseAge: 1440` (one day).

---

## 2026-06-30 (earlier)

### Changed

#### Dependencies

- **Production dependencies**: Bumped `lucide-react` to `1.22.0`, `date-fns` to `4.4.0`, `openai` to `6.45.0`, `postcss` to `8.5.16`, `autoprefixer` to `10.5.2`, `uuid` to `14.0.1`, and `start-server-and-test` to `3.0.11`. Skipped major upgrades to `ai` 7.x, `@ai-sdk/*` 4.x, `cookie` 2.x, and `cropperjs` 2.x pending migration work.
- **Development dependencies**: Bumped `@types/node` to `25.9.4` and `@types/js-cookie` to `3.0.6`. Run `pnpm install` after pulling; `pnpm-workspace.yaml` enforces `minimumReleaseAge: 1440` (one day).

---

## 2026-06-29

### Changed

#### Dependencies

- **Production dependencies**: Bumped `@tanstack/react-query` to `5.101.2`, `dodopayments` to `2.40.1`, `fumadocs-core` to `16.10.6`, `fumadocs-mdx` to `15.0.13`, and `fumadocs-ui` to `16.10.6`. Skipped major upgrades to `ai` 7.x, `@ai-sdk/*` 4.x, `cookie` 2.x, and `cropperjs` 2.x pending migration work. Run `pnpm install` after pulling; `pnpm-workspace.yaml` enforces `minimumReleaseAge: 1440` (one day).

---

## 2026-06-28

### Changed

#### Dependencies

- **Production dependencies**: Bumped Better Auth to `1.6.22`, `@better-auth/passkey` to `1.6.22`, `es-toolkit` to `1.49.0`, and `resend` to `6.16.0`. Skipped major upgrades to `ai` 7.x, `@ai-sdk/*` 4.x, `cookie` 2.x, and `cropperjs` 2.x pending migration work. Run `pnpm install` after pulling; `pnpm-workspace.yaml` enforces `minimumReleaseAge: 1440` (one day).

---

## 2026-06-26

### Changed

#### Dependencies

- **Production dependencies**: Bumped 40+ packages, including Next.js `16.2.9`, Better Auth `1.6.20`, oRPC `1.14.6`, Tailwind CSS `4.3.1`, AWS SDK S3 clients `3.1075.0`, and Radix UI `1.6.0`. Skipped major upgrades to `ai` 7.x, `@ai-sdk/*` 4.x, `cookie` 2.x, and `cropperjs` 2.x pending migration work.
- **Development dependencies**: Bumped Turborepo to `2.10.0`, Oxlint to `1.71.0`, Oxfmt to `0.56.0`, Vitest to `4.1.9`, and Playwright to `1.61.1`. Run `pnpm install` after pulling; `pnpm-workspace.yaml` enforces `minimumReleaseAge: 1440` (one day).

---

## 2026-06-22

### Changed

#### Dependencies

- **Production dependencies**: Bumped `hono` to `^4.12.25` in the catalog and lockfile, and `nodemailer` to `^9.0.1` in the mail package. Refresh the lockfile with `pnpm install` after pulling.

---

## 2026-06-16

### Fixes and improvements

#### SaaS app

- **Organization members**: Removed the role permissions summary box from the members settings page. Role descriptions appear only in the role select dropdown (capped to one line), and the select trigger shows just the role label.

### Changed

#### Dependencies

- **Development dependencies**: Bumped Turborepo to `2.9.18` and `@tailwindcss/typography` to `0.5.20`. Refresh the lockfile with `pnpm install` after pulling.

---

## 2026-06-06

### Changed

#### Dependencies

- **Production dependencies**: Bumped `cookie` from `0.7.2` to `1.1.1` (major) across the lockfile.
- **Development dependencies**: Bumped `oxlint-tsgolint` to `0.23.0`, Turborepo to `2.9.16`, and `@content-collections/core` to `0.15.1`. Refresh the lockfile with `pnpm install` after pulling.

---

## 2026-06-04

### Changed

#### Dependencies

- **Production dependencies**: Bumped 29 packages, including Next.js `16.2.7`, React and React DOM `19.2.7`, Better Auth `1.6.14`, Vitest `4.1.8`, and `next-intl` `4.13.0`. Refresh the lockfile with `pnpm install` after pulling.

---

## 2026-06-02

### Fixes and improvements

#### SaaS app

- **Organization settings**: Only organization owners see the delete organization section in general settings; admins keep access to the rest of organization settings.

---

### Removed

#### Auth

- **Username plugin**: Removed the Better Auth `username()` plugin and the `username` and `displayUsername` columns from the Prisma and Drizzle user schemas. This eliminates the unauthenticated `POST /api/auth/is-username-available` endpoint, which allowed anonymous username enumeration. Apply the schema change with `pnpm --filter @repo/database push` (drops the two columns).

---

## 2026-05-27

### Changed

#### Infrastructure

- **Node.js and pnpm**: The workspace requires Node.js `>=22` and pins `pnpm@11.3.0`. Upgraded Turborepo to the latest 2.9.x release.
- **Dependabot**: Removed the open-pull-requests limit and Dependabot cooldown, so daily upgrade PRs are no longer capped at two. `pnpm-workspace.yaml` still enforces `minimumReleaseAge: 1440` (one day) on install.
- **Lint tooling**: Moved `oxlint-tsgolint` from root dependencies to devDependencies so it installs only for development.

---

## 2026-05-25

### Fixes and improvements

#### Payments

- **Stripe one-time checkout**: Checkout links for a user or organization with an existing Stripe customer no longer send `customer_creation` alongside `customer`, which Stripe rejects as a parameter conflict.

#### Marketing and SaaS apps

- **Theme toggle**: `ColorModeToggle` defers reading `next-themes` until after mount, so the marketing and SaaS toggles render matching server markup and client hydration without `suppressHydrationWarning`; the active indicator no longer jumps or mismatches on first paint.

#### Marketing

- **Content Collections**: `content-collections` config uses the `content` option instead of the deprecated `collections` field (0.14+ migration), keeping the marketing content pipeline on the supported API.

---

## 2026-05-21

### Fixes and improvements

#### SaaS app

- **Organization members**: Role selects are ordered member → admin → owner (least to most access). The members settings page includes a role permissions summary, and each role option shows a short description of what it can do.

---

## 2026-05-20

### Removed

#### Mail

- **NewUser template**: Removed the unused `NewUser` email template, its `mailTemplates` wiring, orphaned per-locale `mail.json` entries, and the `common.otp` string used only there. Signup and email changes keep using the email verification template.

### Changed

#### Dependencies

- **Workspace prune**: Dropped direct dependencies never imported from their package trees, removed the `openapi-schema` helper that only supported the removed `openapi-merge` dependency, and refreshed the lockfile; type-check and tests still pass.

---

## 2026-05-18

### Changed

#### Mail

- **React Email 6**: The mail workspace uses the unified `react-email` package (v6), replacing the separate `@react-email/components` and `@react-email/render` dependencies. Per the v6 upgrade guide, the mail preview app replaces `@react-email/preview-server` with `@react-email/ui`. Email templates were reformatted with oxfmt.

---

## 2026-05-13

### Fixes and improvements

#### Infrastructure

- **Dependency minimum release age**: A 1-day minimum release age is enforced at two levels to reduce supply chain attack exposure. Dependabot's `cooldown: default-days: 1` delays upgrade PRs for freshly published versions, and `pnpm-workspace.yaml` sets `settings.minimumReleaseAge: 1440` (minutes) so pnpm v11+ refuses to install any package version younger than one day, including transitive dependencies. This gives the community time to detect newly published, potentially compromised versions before they reach the project.
- **pnpm v11**: The monorepo targets pnpm `11.1.1`; package-manager-only build settings moved from the root `package.json` into `pnpm-workspace.yaml` so installs and CI work on the v11 toolchain.

#### Marketing and SaaS apps

- **Theme toggle**: Light/dark controls in the marketing and SaaS apps render correct server markup and no longer rely on a client-only placeholder that hid the toggle before hydration.

---

## 2026-05-09

### Fixes and improvements

#### Database

- **Two-factor authentication schema**: Added the missing Better Auth `verified` flag to the `TwoFactor` Prisma model, the generated Prisma Zod schema, and the PostgreSQL, MySQL, and SQLite Drizzle schemas, so every database adapter represents two-factor enrollment state the same way.

---

## 2026-05-06

### Fixes and improvements

#### SaaS app

- **Account security settings**: Passkeys can be renamed from the passkey list, and the rename dialog opens automatically after creating a passkey. The list shows user-defined names without the device type prefix, falling back to “Unnamed passkey” for legacy passkeys without a saved name. The two-factor authentication block stays visible when no password is set and explains that a password is required before enabling two-factor authentication.

---

## 2026-04-24 v3.3.2

### Fixes and improvements

#### SaaS app

- **Organization general settings**: The organization name field syncs when client data loads; success and error toasts use dedicated `organizations.settings` i18n keys. After a rename, the organization list query is refetched, the active organization refreshed, and the name form reset to the saved value. The organization switcher no longer briefly shows “Personal account” when opening account settings with an active organization (the active-org query keeps previous data across route key changes).

---

## 2026-04-20 v3.3.1

### Fixes and improvements

#### Database

- **Drizzle notifications and schema**: Notification persistence (preferences, inserts, listing rows, unread counts, mark read) lives in `@repo/database` for both Prisma and Drizzle, so the Drizzle scaffold no longer mixes in Prisma-style `db` calls. The Drizzle schema barrel (`drizzle/schema/index.ts`) re-exports the PostgreSQL schema (aligned with the Drizzle client) and exposes `NotificationType` / `NotificationTarget` for type-safe consumers.
- **`user.lastActiveOrganizationId` in Drizzle**: Added to the PostgreSQL, MySQL, and SQLite user tables so Drizzle schemas match the Prisma user model and the auth hooks that read this field.
- **Organization lookups (Drizzle)**: `findFirst`-based helpers normalize missing rows to `null`, matching Prisma `findUnique` behavior for tests and callers.

#### Packages

- **`@repo/notifications`**: Dropped the thin `list`, `mark-read`, and `preferences` modules; the package index re-exports the shared notification query helpers from `@repo/database` alongside create/welcome/resolve-link.

#### API

- **Notifications procedures**: List and unread-count handlers use the database row helpers from `@repo/notifications` / `@repo/database` and apply `resolveNotificationLink` when shaping list responses.

#### SaaS app

- **Notification center**: Removed interval-based notification refetching from the notification center UI.

Related: [issue #2395](https://github.com/supastarter/supastarter-nextjs/issues/2395) (Drizzle + Postgres scaffold parity).

---

## 2026-03-30 v3.3.0

### Added

#### Database

- **Notification entity**: New `Notification` model in Prisma and Drizzle (PostgreSQL, MySQL, SQLite) with user association and read/unread state.

#### Packages

- **`@repo/notifications`**: Shared module for notification definitions (`catalog`), creating and listing notifications, marking as read, per-user preferences, and a welcome notification helper.

#### API

- **Notifications oRPC**: Procedures to list notifications, get the unread count, mark one or all as read, and read/update notification preferences.

#### SaaS app

- **Notification Center**: Navbar UI to view notifications and mark them read.
- **Notification preferences**: Account settings page and form for per-channel preferences; server-only notification logic stays out of the preferences form's client bundle.
- **Auth**: A database hook after user creation creates a welcome in-app notification via `@repo/notifications`.

#### Mail and i18n

- **`Notification` email template** and template wiring; **saas** and **mail** translation keys for notifications in English, German, Spanish, and French.

#### UI

- **Popover** and **Switch** components exported from `@repo/ui` for notification UI patterns.

### Changed

#### SaaS settings

- **Account and organization settings**: Removed nested `settings/layout.tsx` for account and org routes and updated settings sub-pages (general, billing, security, members, etc.) to the flatter structure. New **Notifications** route under account settings.

#### NavBar and theming

- **NavBar**: Reworked layout and behavior (including notification entry points); **Tailwind theme** (`tooling/tailwind/theme.css`) and related component tweaks for consistency.

---

## 2026-03-24 v3.2.0

### Testing

- **Vitest setup**: Added Vitest configuration (`vitest.config.ts`) to `apps/saas`, `apps/marketing`, and `packages/api` so each workspace package runs unit tests with `pnpm test`.
- **Unit tests**: Added initial suites covering `base-url` helpers in both apps, content utilities in the marketing app, and organization membership logic, slug generation, and oRPC procedure wiring in the API package.
- **CI integration**: Added a unit test job to the GitHub Actions workflow so unit tests run on every pull request; the Turbo `test` task no longer depends on `build`.

---

## 2026-03-24 v3.1.1

### Fixes and improvements

#### SaaS app

- **Checkout return after payment**: After Stripe checkout, users land on `/checkout-return`, which polls `listPurchases` until an active plan appears (avoiding a race with webhook processing). The pricing table passes `organizationId` in the return URL when applicable. If confirmation does not arrive before the timeout, users are sent to `/choose-plan`. Added `checkoutReturn` copy in English, German, Spanish, and French.

---

## 2026-03-23 v3.1.0

### Tooling

- **Lint and format stack**: Replaced Biome with [Oxlint](https://oxc.rs/docs/guide/usage/linter) and [Oxfmt](https://oxc.rs/docs/guide/usage/formatter) for faster linting and formatting across the monorepo.
- **Workspace layout**: Consolidated Oxlint/Oxfmt dependencies at the repository root (pnpm catalog) and removed redundant per-package Biome configs; updated the lockfile and many source files to the new rules and formatter output.

---

## 2026-03-18 v3.0.3

### Added

#### Organizations

- **Persist last active organization**: A new `lastActiveOrganizationId` field on the user record is updated whenever the active organization changes. On the next sign-in, a better-auth `databaseHook` restores the session to that organization, so users no longer land on a default/empty organization.

---

## 2026-03-09 v3.0.2

### Fixes and improvements

#### Marketing app

- **Tailwind Typography**: Added the `@tailwindcss/typography` plugin to the marketing app so `prose` and `prose-invert` classes style content correctly (blog posts, legal pages, changelogs)
- **Page spacing**: Normalized top padding on marketing pages (blog list, blog post, changelog, contact, legal) from `pt-24 pb-16` to `py-16` for consistent vertical rhythm
- **Image hostname**: Added `picsum.photos` to the allowed remote image hostnames in `next.config.ts` for blog placeholder images

---

## 2026-03-08 v3.0.1

### Fixes and improvements

#### i18n and translation usage

- **Single `useTranslations()` per component**: Removed redundant `useTranslations()` hooks (e.g. `tSignup`, `tLogin`, `tSettings`, `tPricing`, `tActions`, `tAria`, `tAvatar`, `tOrgSettings`) across marketing and SaaS components, which use a single `t` for all translation keys.
- **Color mode labels**: Marketing and SaaS `ColorModeToggle` use the full key path `common.colorMode.${option.value}` for option labels.
- **Organization and settings keys**: `ChangeOrganizationNameForm` uses `organizations.settings.changeName.notifications.success` / `error` and `settings.save` via the shared `t`; the other organization and settings forms (delete org, logo, change email/name/password, two-factor) use the single `t` for their copy.

#### Payments and purchases

- **List purchases enrichment**: `listPurchases` (packages/api) returns each purchase with resolved `planId` and `planPrice` from the payments helper, so clients get plan data without extra lookups.
- **Purchase helper**: `createPurchasesHelper` and `getActivePlanFromPurchases` in `packages/payments` accept a `ResolvedPurchase` type (with optional `planId` and `planPrice`) and use `resolvePurchasePlan` / `resolvePurchasePlanId` to skip duplicate provider price resolution for already-enriched purchases.

#### UI

- **SaaS NavBar**: The nav link list uses `flex-nowrap`, `overflow-x-auto`, and responsive `md:overflow-visible md:flex-wrap` so links scroll horizontally on small screens and wrap on larger ones; the sidebar layout keeps `md:flex-nowrap` for the vertical nav.

---

## 2026-03-08 v3.0.0

### Major architectural changes and breaking updates

The monorepo is restructured around separate marketing and SaaS apps, with expanded localization and reworked billing configuration. The major version reflects breaking changes to app paths, imports, routes, configuration, and payment data.

#### Summary of breaking changes

- **App split**: The former `apps/web` app is split into dedicated `apps/marketing` and `apps/saas` Next.js apps
- **Route changes**: Marketing routes and SaaS auth/app routes moved into new App Router layouts and path groups
- **Config scoping**: Marketing and SaaS use app-local `config.ts`, `types.ts`, and i18n request/config helpers instead of the shared `apps/web` config
- **Payments model**: Billing uses plan-based configuration and provider `priceId` values instead of client-facing `productId`
- **Purchase schema**: Purchase `productId` is renamed to `priceId` across Prisma, Drizzle, and generated Zod schemas
- **i18n split**: Translations are split by scope (`marketing`, `saas`, `mail`, `shared`) and loaded through a new `getMessagesForLocale` helper
- **Translation key updates**: Marketing and SaaS copy uses full-length translation keys across forms, nav, pricing, settings, admin, and auth flows
- **API removals**: The contact and newsletter API routers were removed from `packages/api`
- **Mail changes**: Newsletter signup email/template support was removed, and mail rendering resolves scoped translations from `@repo/i18n`
- **UI moves**: Several SaaS-specific UI primitives moved from `@repo/ui` into `apps/saas/modules/shared`
- **Workspace tooling**: Shared dependency versions come from a pnpm catalog

#### Dedicated marketing and SaaS applications

- **New apps**: Standalone `apps/marketing` and `apps/saas` apps, each with its own `package.json`, `next.config.ts`, `tsconfig.json`, global styles, robots, layouts, config, and Playwright setup
- **Marketing app**: Public pages live in `apps/marketing`: home, blog index and post routes, changelog, contact, legal pages, sitemap generation, locale switching, and refreshed home-page sections
- **SaaS app**: Protected routes live in `apps/saas`, with separate authenticated and unauthenticated layouts, account dashboards, organization settings, onboarding, auth pages, and API routes
- **Removed**: The old combined `apps/web` app and its shared layouts, proxy, sitemap, and duplicated feature modules

**Migration steps:**

1. Update scripts, deploy targets, env vars, or local workflows that referenced `apps/web`
2. Point public-site work to `apps/marketing` and protected-product work to `apps/saas`
3. Update route assumptions for auth pages (`/login`, `/signup`, etc.) and SaaS layouts if you maintain custom links or middleware

#### Localization and content restructuring

- **Scoped translations**: Locale files are split into `packages/i18n/translations/{locale}/marketing.json`, `saas.json`, `mail.json`, and `shared.json`
- **New locales**: Spanish (`es`) and French (`fr`) join English and German
- **Typed config**: Typed i18n config/interfaces; `@repo/i18n` exports `config`, `Locale`, and scoped message types
- **Message loading**: `getMessagesForLocale(locale, scope)` merges shared messages and falls back to the default locale
- **Key normalization**: Marketing and SaaS components use explicit full-length translation keys instead of short or ambiguous key paths
- **App wiring**: Marketing and SaaS each own their locale request/update helpers and locale-aware providers

**Migration steps:**

1. Move custom translation keys into the new scoped translation files
2. Replace imports of old flat message utilities with `getMessagesForLocale`
3. Rename custom UI translation lookups that rely on old short-form key paths
4. Update code that assumed only `en` and `de` locales exist

#### Payments, auth, and data model updates

- **Plan-based checkout**: `createCheckoutLink` accepts `planId`, `type`, and optional `interval`, then resolves provider price IDs server-side
- **Payments config**: Typed plan definitions, `priceId` fields, `requireActiveSubscription`, and reusable plan lookup helpers replace the `productId` pricing config
- **Purchase queries**: `listPurchases` accepts an optional input object by default, simplifying direct server/client calls
- **Database schema**: Purchase `productId` is renamed to `priceId` in Prisma and generated validation output
- **Auth updates**: Better Auth uses the SaaS base URL, raises the minimum password length to 8, reserves `chatbot` as an organization slug, and redirects invitations to `/login` and `/signup`

**Migration steps:**

1. Rename custom purchase schema usage from `productId` to `priceId`
2. Update payment integrations to pass `planId` and `interval` instead of provider product IDs
3. Regenerate and apply database migrations if your environment still uses the old purchase column name
4. Verify `NEXT_PUBLIC_SAAS_URL` and payment provider price env vars are set for the split-app setup

#### Mail, API, and shared component cleanup

- **Removed API endpoints**: The contact and newsletter oRPC modules are deleted from `packages/api`
- **Mail package refactor**: Mail helpers moved into `packages/mail/lib`, scoped mail translation loading was added, and the newsletter signup template/export was removed
- **Marketing forms**: Contact/newsletter flows were refactored with the app split and no longer rely on the removed shared API modules
- **SaaS UI ownership**: Password input, settings list/item, page header, and related components moved into the SaaS app rather than being over-generalized in `@repo/ui`
- **Workspace cleanup**: pnpm catalog version management and refreshed package wiring across apps and packages

---

## 2026-03-05 v2.0.6

### Refactoring

#### oRPC server-side client and payments

- **Server-side oRPC**: A server-only oRPC client calls the API router directly (no HTTP) during SSR. Adds `@orpc/server` (1.13.6) to `apps/web`, a new `orpc.server.ts` that sets `globalThis.$orpcClient` via `createRouterClient(router, ...)`, and `instrumentation.ts` plus a root layout import so the server client is registered before use.
- **orpc-client**: The client throws on the server ("RPCLink is not allowed on the server side") and uses `window.location.origin` for the RPC URL; it exports `orpcClient` as `globalThis.$orpcClient ?? createORPCClient(link)` so server code uses the direct router client.
- **API**: `packages/api` exports `router`; the `payments.listPurchases` procedure returns the purchases array directly instead of `{ purchases }`.
- **Payments**: Removed `getPurchases` and `apps/web/modules/saas/payments/lib/server.ts`. The account and organization billing pages and the choose-plan page call `orpcClient.payments.listPurchases()` directly, with a plain `await` replacing `attemptAsync` (es-toolkit). The `usePurchases` hook uses `data ?? []` to match the new return shape.

---

## 2026-03-05 v2.0.5

### Fixes

#### SaaS app layout – purchase list organization scoping

- **Payments / organizations**: When redirecting unsubscribed users to the choose-plan page, `organizationId` is passed to the payments list only when organizations are enabled **and** billing is attached to the organization (`billingAttachedTo === "organization"`). Previously it was passed whenever organizations were enabled, which could scope purchase lookups by organization when billing was user-level and cause a redirect loop.

---

## 2026-03-02 v2.0.4

### Dependency updates

#### oRPC upgrade

- **@orpc packages**: Upgraded from 1.13.2 to 1.13.6 across the monorepo
- **apps/web**: `@orpc/client` to 1.13.6
- **packages/api**: `@orpc/client`, `@orpc/json-schema`, `@orpc/openapi`, `@orpc/server`, and `@orpc/zod` to 1.13.6

---

## 2026-02-05 v2.0.3

### Radix UI dependency consolidation

#### Unified Radix UI package migration

- **Major dependency update**: Migrated from individual `@radix-ui/react-*` packages to the unified `radix-ui` package (v1.4.3)
- **Consolidated dependencies**: 13 separate Radix UI packages become one
- **Updated all UI components** to import from the unified `radix-ui` package:
  - `accordion.tsx`: `Accordion`
  - `alert-dialog.tsx`: `AlertDialog`
  - `avatar.tsx`: `Avatar`
  - `button.tsx`: `Slot` and `Slottable`
  - `dialog.tsx`: `Dialog`
  - `dropdown-menu.tsx`: `DropdownMenu`
  - `form.tsx`: `Label` and `Slot`
  - `label.tsx`: `Label`
  - `progress.tsx`: `Progress`
  - `select.tsx`: `Select`, with icons migrated to Lucide
  - `sheet.tsx`: `Sheet`
  - `tabs.tsx`: `Tabs`
  - `tooltip.tsx`: `Tooltip`

#### Icon migration

- **Replaced Radix icons**: Migrated from `@radix-ui/react-icons` to Lucide icons
- **Features component**: Radix `MobileIcon` replaced by Lucide `SmartphoneIcon`
- **Select component**: Radix `CheckIcon` replaced by Lucide's `CheckIcon`
- Removed the `@radix-ui/react-icons` dependency

#### Package updates

- **UI package**: `packages/ui/package.json` uses the unified `radix-ui` package
- **Web app**: `apps/web/package.json` uses the unified `radix-ui` package
- **Dependencies**: Reduced from 13 Radix packages to 1

**Benefits:**

- Simpler dependency management
- Smaller bundle and faster installs
- Consistent versioning across all Radix UI components
- Easier maintenance and updates

---

## 2026-02-05 v2.0.2

### AI Chat refactoring and UI improvements

#### AI Chat simplification

- **Major refactoring**: AI chat is simplified to a streaming-only interface without chat persistence
- **Removed**: Chat storage and CRUD operations (create, list, find, update, delete, add-message procedures)
- **Removed**: The `AiChat` database model from all schemas (Prisma, Drizzle MySQL/PostgreSQL/SQLite)
- **Removed**: AI chat database queries (`ai-chats.ts` files)
- **Simplified**: The AI router exposes a single `stream` endpoint for real-time AI responses
- **Refactored**: The `AiChat` component streams without persistence, using `@ai-sdk/react`'s `useChat` hook
- **Simplified**: Chatbot pages no longer prefetch chat lists or individual chats
- **New**: A `stream-message` procedure streams AI responses without storing conversations

**Breaking changes:**

- Code using `orpcClient.ai.chats.*` endpoints must be updated
- Database migrations must drop the `ai_chat` table if it exists
- Chat history no longer persists - conversations are session-only

#### UI component improvements

- **NavBar**: Conditional bottom border when scrolled (`border-b` when `!isTop`)
- **Button component**: Removed icon opacity styling (`[&>svg]:opacity-60`) for better icon visibility
- **Global styles**: Consistent Lucide icon stroke-width (`1.75`) for better icon rendering

---

## 2026-02-05 v2.0.1

### UI component enhancements and design improvements

#### Toast component redesign

- **Major enhancement**: The toast component is redesigned with custom styling and improved UX
- Custom `Toast` component supporting types (success, error, info, warning, loading, default)
- Automatic Lucide icons for each toast type
- Helper functions: `toastSuccess`, `toastError`, `toastInfo`, `toastWarning`, `toastLoading`
- `toastPromise` handles async operations with loading/success/error states
- Type-specific border colors
- Action and cancel buttons in toasts

#### Color mode toggle redesign

- **Redesigned**: A segmented toggle-button control replaces the dropdown menu
- Sliding indicator animation for the active state
- Tooltips for each color mode option (System, Light, Dark)
- ARIA labels and pressed states for accessibility
- Translations for color mode labels (`common.colorMode.system`, `common.colorMode.light`, `common.colorMode.dark`)
- System mode icon changed from `HardDriveIcon` to `MonitorCogIcon`

#### User menu improvements

- **Simplified**: Removed the inline color mode submenu from the user menu
- Color mode uses the standalone `ColorModeToggle` component
- Cleaner menu structure with better separation of concerns

#### Component styling updates

- **Select component**: Border radius changed from `rounded-md` to `rounded-lg` to match the design system
- **SettingsItem component**: Left column widened from `280px` to `320px` for better content spacing
- **Theme colors**: Muted background changed from `#1d1e1e` to `#191b1b` for better contrast

#### Form components

- All SaaS form components use the new toast API:
  - Organization forms (Create, Change Name, Delete, Logo, Invite Member)
  - Settings forms (Change Email, Change Name, Change Password, Set Password, Delete Account, User Avatar, User Language)
  - Admin components (Organization Form, Organization List, User List)
  - Organization management components (Members List, Invitations List, Organization Select)
  - Security components (Passkeys Block, Two Factor Block, Active Sessions Block)
  - Customer Portal Button

---

## 2026-02-02 v2.0.0

### Major architectural changes and breaking updates

The major version reflects breaking architectural changes across the codebase. Existing code is updated to the new structure; custom code needs manual migration.

#### Summary of breaking changes

- **Docs application**: Moved from the web app to a standalone Next.js app (`apps/docs`)
- **UI components**: Moved from `apps/web/modules/ui/` to `packages/ui/`
- **Configuration**: Removed the centralized `config/` package; config is scoped per package
- **Shared components**: `Logo` and `Spinner` moved to `@repo/ui`
- **Mail package**: Flattened directory layout (no `src/`); Logo component and custom provider removed
- **Payments package**: Helper utilities moved from `src/lib/` to `lib/`
- **Mail preview app**: New `apps/mail-preview` app for previewing emails
- **Not-found pages**: Dedicated not-found pages for marketing and SaaS routes
- **Import paths**: Imports updated throughout the codebase (275+ files changed)

#### Dedicated docs application

**Breaking changes:**

- Removed docs routes from `apps/web/app/(marketing)/[locale]/docs/[[...path]]/`
- Removed docs API route `apps/web/app/api/docs-search/route.ts`
- Removed `apps/web/app/docs-source.ts`
- Removed all docs content from `apps/web/content/docs/` (including `getting-started/` and `index.mdx`)
- Removed the `TableOfContents` component from marketing shared components
- Removed the docs image `apps/web/public/images/docs/login.png`
- `apps/web/content-collections.ts` excludes docs content
- `apps/web/app/sitemap.ts` excludes docs routes

**New structure:**

- New `apps/docs` app, a separate Next.js app built on fumadocs (default port 3001)
- Docs content lives in `apps/docs/content/docs/`
- Uses fumadocs-ui
- Includes an AI-powered page actions component
- The docs app has its own `package.json`, `tsconfig.json`, and `next.config.ts`

**Migration steps:**

1. Migrate custom docs content to `apps/docs/content/docs/`
2. Update links to `/docs/*` routes - docs are served from the separate app
3. Remove imports of the `TableOfContents` component
4. Run `pnpm dev` in `apps/docs` to start the docs server (or `pnpm --filter @repo/docs dev`)
5. Update CI/CD pipelines that build or deploy docs

#### UI components moved to packages

UI components moved to a shared package for reuse across the monorepo.

**Breaking changes:**

- Removed all UI components from `apps/web/modules/ui/components/` (25+ components including accordion, alert, button, card, dialog, form, input, select, etc.)
- Removed `apps/web/modules/ui/lib/index.ts`
- Removed `apps/web/components.json` (shadcn config file)

**New structure:**

- New `packages/ui` package containing all UI components
- Components are imported from `@repo/ui/components/[component-name]`
- Shared utilities (like `cn`) come from `@repo/ui`
- `components.json` moved to `packages/ui/components.json`
- The package includes all Radix UI dependencies and styling utilities

**Migration steps:**

1. Update imports from `apps/web/modules/ui/components/*` to `@repo/ui/components/*`
2. Update `cn` imports from `apps/web/modules/ui` to `@repo/ui`
3. Remove references to `components.json` in the web app
4. Add `@repo/ui` as a dependency to other packages that use UI components
5. Update custom TypeScript path aliases that pointed to the old location

#### Configuration restructuring

Scoped config files replace the centralized config package for better package isolation.

**Breaking changes:**

- Removed the `config/` package entirely:
  - `config/index.ts`
  - `config/package.json`
  - `config/tsconfig.json`
  - `config/types.ts`
- Imports from `@repo/config` or `config` will fail

**New structure:**

- Each package has its own `config.ts` file:
  - `apps/web/config.ts` - Web app configuration
  - `packages/api/config.ts` - API configuration
  - `packages/auth/config.ts` - Auth configuration
  - `packages/i18n/config.ts` - i18n configuration
  - `packages/mail/config.ts` - Mail configuration
  - `packages/payments/config.ts` - Payments configuration
  - `packages/storage/config.ts` - Storage configuration
- A root `config.ts` file holds shared configuration

**Migration steps:**

1. Update imports from `@repo/config` or `config` to package-specific configs:
   - `import { config } from "@config"` for the web app
   - `import { config as i18nConfig } from "@repo/i18n/config"` for package configs
2. Update code that references the old config package structure
3. Review each package's config file for the available options
4. Update environment variable usage if the config structure changed

#### Shared components cleanup

Removed shared components that the UI package now provides.

**Breaking changes:**

- Removed `apps/web/modules/shared/components/Logo.tsx`
- Removed `apps/web/modules/shared/components/Spinner.tsx`

**Migration steps:**

1. Replace imports of `Logo` from `@shared/components/Logo` - Logo comes from `@repo/ui`
2. Replace imports of `Spinner` - use skeleton components from `@repo/ui` instead
3. Update custom code that imports these components

#### Mail package restructuring

**Breaking changes:**

- Removed `packages/mail/src/components/Logo.tsx` (use `@repo/ui` instead)
- Removed the `packages/mail/src/provider/custom.ts` provider
- Restructured the mail package directory layout:
  - `src/components/` → `components/` (PrimaryButton, Wrapper moved)
  - `src/provider/` → `provider/` (all providers moved)
  - `src/util/` → `util/` (send, templates, translations moved)
- Mail providers use the new config structure, and email templates use the new import paths

**New structure:**

- Components, providers, and utilities sit at the package root, without a `src/` directory
- New `packages/mail/config.ts` for mail configuration

**Migration steps:**

1. If mail templates use the Logo component, import it from `@repo/ui`:
   ```typescript
   import { Logo } from "@repo/ui";
   ```
2. If you use a custom mail provider, migrate to a supported provider:
   - Resend
   - Nodemailer
   - Mailgun
   - Postmark
   - Plunk
   - Console (for development)
3. Configure the mail provider in `packages/mail/config.ts`
4. Update imports from `packages/mail/src/*` to `packages/mail/*`
5. Use the `apps/mail-preview` app to preview emails during development

#### Payments package restructuring

**Breaking changes:**

- Moved `packages/payments/src/lib/customer.ts` → `packages/payments/lib/customer.ts`
- Moved `packages/payments/src/lib/helper.ts` → `packages/payments/lib/helper.ts`
- Removed the old duplicate `packages/payments/src/lib/helper.ts`
- Updated payment provider implementations (Stripe, LemonSqueezy, DodoPayments, Polar)
- Payment procedures use the new config structure

**New structure:**

- New `packages/payments/config.ts` for payment configuration

**Migration steps:**

1. Update imports from `packages/payments/src/lib/*` to `packages/payments/lib/*`
2. Configure payments in `packages/payments/config.ts`
3. Review `packages/payments/lib/` for helper functions

#### Import path updates

**Affected areas:**

- UI component imports across all modules (200+ files updated)
- Config imports throughout the codebase
- Shared component imports
- Mail template imports
- Payment provider imports

**Migration steps:**

1. Run `pnpm install` to link all workspace dependencies
2. Update custom code that uses old import paths:
   - `apps/web/modules/ui/*` → `@repo/ui/*`
   - `@repo/config` → package-specific configs
   - `@shared/components/Logo` → `@repo/ui`
3. Run type checking with `pnpm type-check` to find remaining import issues
4. Update custom scripts or build tools that reference old paths

#### Workspace configuration updates

**Breaking changes:**

- `pnpm-workspace.yaml` still references the removed `config` package - update it manually
- The workspace includes the new `apps/docs` app and `packages/ui` package

**Migration steps:**

1. Remove the `config` entry from `pnpm-workspace.yaml`:
   ```yaml
   packages:
     - apps/*
     - packages/*
     - tooling/*
   ```
2. Run `pnpm install` to refresh workspace links
3. Verify all packages are linked with `pnpm list --depth=0`

#### Biome configuration standardization

**Changes:**

- All package-level Biome configs extend the root config with `"extends": "//"`
- Root `biome.json` holds the shared configuration
- Package-specific `biome.json` files override only when needed
- The database package excludes Prisma-generated zod files from linting

**Migration steps:**

1. Make custom Biome rules follow the new pattern:
   ```json
   {
   	"root": false,
   	"extends": "//"
   }
   ```
2. Run `pnpm format` to apply the new formatting rules
3. Run `pnpm lint` to check for linting issues under the new config

#### Package dependencies and workspace structure

**Changes:**

- Added `@repo/ui` as a workspace dependency where needed
- Updated `pnpm-lock.yaml` for the new workspace structure (2760+ lines changed)
- Removed dependencies on the deleted `config` package
- Updated every package's `package.json` to the new structure
- Added the `@repo/docs` workspace package
- Updated tooling packages (scripts, tailwind, typescript) with new dependencies
- Added new messages to i18n translations (en.json, de.json)

**Migration steps:**

1. Run `pnpm install` to link all workspace dependencies
2. Verify workspace structure with `pnpm list --depth=0`
3. Check for remaining references to `@repo/config` in `package.json` files

#### Monorepo organization improvements

**Changes:**

- Improved package boundaries, separation of concerns, isolation between apps and packages, and dependency relationships

**Benefits:**

- Better code organization and discoverability
- Clearer separation between application code and shared packages
- Easier-to-understand dependencies between packages
- Better support for independent package versioning

#### Other updates

**Documentation:**

- `agents.md` reflects the new architecture and import paths
- Coding guidelines reference the new package structure
- Import examples use the new `@repo/ui` package

**Configuration:**

- `.env.local.example` reflects the new configuration structure
- Updated environment variable documentation

**Build and deployment:**

- Updated image proxy route configuration
- `turbo.json` uses the TUI interface (`"ui": "tui"`)

**New applications:**

- `apps/docs` - Standalone fumadocs documentation app
- `apps/mail-preview` - Email preview app for development (port 3005)

**Not-found pages:**

- Dedicated `not-found.tsx` pages for marketing routes (`apps/web/app/(marketing)/[locale]/not-found.tsx`) and SaaS routes (`apps/web/app/(saas)/app/not-found.tsx`)
- Removed the `NotFound` component from marketing shared components in favor of Next.js not-found pages

**TypeScript:**

- Updated TypeScript configurations across packages
- Updated path aliases in `tsconfig.json` files
- Added type definitions for UI package exports
- Added TypeScript configs for the new apps (docs, mail-preview)

---

## 2026-01-30 v1.3.5

### Design system updates and UI improvements

#### Visual design updates

- Replaced `bg-card` with `bg-background` in navigation and the app wrapper for better contrast
- Changed the newsletter section background from `bg-primary/5` to `bg-muted`
- Removed borders from cards and dropdown menus
- Changed buttons from `rounded-md` to `rounded-full`
- Increased container max-width from `--container-6xl` to `--container-7xl`

#### Typography improvements

- Increased heading sizes across marketing pages (Hero, Features sections)
- Changed letter spacing from `-0.02em` to `-0.01em` for readability
- Added a max-width to the hero paragraph

#### Component enhancements

- Added a title field and improved layout to changelog items
- Switched the changelog section to `rounded-3xl` with a `bg-muted` background
- Updated dropdown menu border radius and shadow
- Removed the explicit border and rounded corners from the settings item component

---

## 2026-01-26 v1.3.4

### Enhanced organization dashboard with visual trend charts

The organization dashboard has interactive trend charts.

---

## 2026-01-12 v1.3.3

### Consolidated agent rules into single agents.md file

All coding agent guidelines are consolidated into one `agents.md` file in the repository root.

#### Removed files

- `claude.md` - Previous Claude-specific guide
- `.windsurfrules` - Windsurf editor rules
- `.cursor/rules/*.mdc` - All 7 Cursor IDE rule files

#### New files

- `agents.md` - 679-line guide covering:
  - Technology stack overview
  - Monorepo architecture and directory structure
  - Import conventions and path aliases
  - TypeScript best practices with code examples
  - React & Next.js patterns (Server vs Client Components)
  - API & Data Layer patterns (oRPC procedures, database queries)
  - Authentication & Authorization patterns
  - UI & Styling guidelines
  - Forms & Validation patterns
  - Internationalization
  - Configuration management
  - Tooling & Quality standards
  - Performance optimization guidelines
  - Code review checklist
- `claude.md` - Symlink to `agents.md` for Claude Code compatibility

It is the single source of truth for all AI coding agents, whatever the IDE or tool.

---

## 2026-01-10 v1.3.2

#### Package updates

- Updated ORPC packages (`@orpc/client`, `@orpc/tanstack-query`, `@orpc/json-schema`, `@orpc/openapi`, `@orpc/server`, `@orpc/zod`) from `^1.11.2` to `1.13.2`

#### Code changes

- Changed the `experimental_SmartCoercionPlugin` import in `packages/api/orpc/handler.ts` to `SmartCoercionPlugin`

---

## 2026-01-02 v1.3.1

### Drizzle schema update for better-auth

Aligned all drizzle schema files with the latest better-auth version.

#### Schema updates

- **User table**: Added `displayUsername` and `twoFactorEnabled` (with a default value) fields
- **Passkey table**: Added the `aaguid` field (authenticator attestation GUID)
- **Organization table**: Made `slug` required (`notNull()`) and unique
- **Member table**: Added default `"member"` for `role` and default `cuid()` for `id`
- **Invitation table**: Added `createdAt` with a default timestamp, and default `"pending"` for `status`
- Added indexes on `invitation.organizationId` and `invitation.email`

#### Relation updates

- Added the `members` relation to `userRelations`
- Changed `invitationRelations` from `inviter` to `user` for consistency with PostgreSQL schema
- Reorganized relation definitions to match the PostgreSQL structure

---

## 2026-01-02 v1.3.0

### New design

- The UI has a new, more modern design.

---

## 2025-12-22 v1.2.12

### Fixed Prisma configuration

#### Script updates

- Removed the explicit `--schema=./prisma/schema.prisma` flag from all Prisma scripts (generate, push, migrate, studio); they use Prisma's default schema location

#### Configuration cleanup

- Moved `prisma.config.ts` to the root of the database package

---

## 2025-12-21 v1.2.11

### Update dependencies

Updated next, react and react-dom to latest.

---

## 2025-12-21 v1.2.10

### Fixed settings item component

The settings item component now applies the correct layout.

---

## 2025-12-17 v1.2.9

### Updated Prisma database push script

- Removed the deprecated `--skip-generate` flag from the database `push` script

---

## 2025-12-17 v1.2.8

### Updated dependencies

#### Prisma major version upgrade

- Updated `@prisma/client` from `6.19.0` to `7.1.0`
- Updated `prisma` from `6.19.0` to `7.1.0`
- Updated `prisma-zod-generator` from `1.32.1` to `2.1.2`

#### Prisma configuration changes

- Moved `DATABASE_URL` configuration from the `schema.prisma` datasource block to `prisma.config.ts`
- The `url` field is managed in the Prisma config file

#### Better-auth updates

- Updated `better-auth` from `1.4.4` to `1.4.7` in both web app and auth package
- Updated `@better-auth/passkey` from `^1.4.4` to `^1.4.7`

---

## 2025-12-16 v1.2.7

### TypeScript configuration improvements

#### Type safety enhancements

- Added explicit type assertions in the Creem payment provider

#### TypeScript config updates

- Added `jsx: "preserve"` to the base TypeScript configuration
- Added `DOM.Iterable` to the React library TypeScript configuration

#### Cleanup

- Removed the unused `test:webhook` script from the payments package
- Removed the unnecessary `type-check` script from the tailwind config package

---

## 2025-12-16 v1.2.6

### Updated dependencies

- Updated `next` from `16.0.7` to `16.0.10`
- Updated `react` from `19.2.1` to `19.2.3`
- Updated `react-dom` from `19.2.1` to `19.2.3`

---

## 2025-12-16 v1.2.5

### Fixed prisma-zod-generator version

Pinned `prisma-zod-generator` to `1.32.1` to block automatic upgrades to `1.32.2`, which has breaking changes and is deprecated for Prisma 6.

---

## 2025-12-05 v1.2.4

### Updated DodoPayments integration

#### SDK upgrade

- Updated `dodopayments` from `^2.5.0` to `^2.8.0`

#### Webhook improvements

- The webhook handler uses the SDK's built-in verification instead of manual signature verification
- Moved webhook secret configuration to client initialization for better security
- Updated webhook event types to match the new SDK:
  - `checkout.session.completed` → `payment.succeeded`
  - `subscription.created` → `subscription.active`
  - `subscription.cancelled` → `subscription.expired`
  - Added the `subscription.plan_changed` event
- Product ID extraction uses the new SDK's `product_cart` array

---

## 2025-12-04 v1.2.3

### Improved admin list components

#### API changes

- Changed pagination parameters from `itemsPerPage`/`currentPage` to `limit`/`offset`
- Renamed the `searchTerm` parameter to `query` across admin list endpoints
- Count functions respect search queries, so pagination totals are accurate when filtering

#### Search improvements

- **Users list**: Searches name and email (case-insensitive)
- **Organizations list**: Search is case-insensitive
- Search queries apply to both data fetching and count queries

#### UI improvements

- Replaced the loading spinner with skeleton rows matching the table structure
- Fixed pagination reset logic so the page no longer resets on initial mount
- Fixed the pagination display condition to check the total count

---

## 2025-12-03 v1.2.2

### Updated next, react and react-dom for security updates

A critical-severity vulnerability was found in react server components. We updated the related dependencies to latest to fix it.

Details: https://vercel.com/changelog/cve-2025-55182

---

## 2025-12-01 v1.2.1

### Several small type issues fixed

Fixed type issues in ForgotPasswordForm, SetPasswordForm, ChangePasswordForm, and OrganizationRoleSelect components.

---

## 2025-12-01 v1.2.0

### Better-auth 1.4 upgrade

Upgraded `better-auth` from `1.3.34` to `1.4.4`, which brings breaking changes and improvements.

#### Migration steps

1. **Update dependencies:**
   - Update `better-auth` to `1.4.4` in both `apps/web/package.json` and `packages/auth/package.json`
   - Add `@better-auth/passkey` (`^1.4.4`) to `packages/auth/package.json`

2. **Update passkey plugin imports:**
   - In `packages/auth/auth.ts`: Change `import { passkey } from "better-auth/plugins/passkey"` to `import { passkey } from "@better-auth/passkey"`
   - In `packages/auth/client.ts`: Change `passkeyClient` import from `better-auth/client/plugins` to `import { passkeyClient } from "@better-auth/passkey/client"`

3. **Update magicLink callback signature:**
   - Change the `sendMagicLink` callback from `async ({ email, url }, request)` to `async ({ email, url }, ctx)`
   - Get the request from context: `const request = ctx?.request as Request`

4. **Update database schema:**
   - Run `pnpm db:push` or create a migration to add these indexes:
     - `Session`: `@@index([userId])`
     - `Account`: `@@index([userId])`
     - `Verification`: `@@index([identifier])`
     - `Passkey`: `@@index([userId])` and `@@index([credentialID])`
     - `TwoFactor`: `@@index([secret])` and `@@index([userId])`
     - `Member`: `@@index([organizationId])` and `@@index([userId])`
     - `Invitation`: `@@index([organizationId])` and `@@index([email])`
   - Add a `createdAt DateTime @default(now())` field to the `Invitation` model

The indexes improve query performance, and the changes align with better-auth 1.4's plugin architecture, where passkey is a separate package.

---

## 2025-11-25 v1.1.4

### Fix OpenAPI schema

Custom OpenAPI endpoints are reachable through the `/api` path again.

---

## 2025-11-23 v1.1.3

### Fix active sessions block

Removing the current session from the active sessions block no longer causes a redirect loop on the login page.

---

## 2025-11-20 v1.1.2

### Fix missing organization settings item in navbar

The organization settings item was missing from the navbar when the config's `hideOrganization` option was true.

---

## 2025-11-16 v1.1.1

### Remove unnecessary font-sans variable

Removed the `--font-sans` variable from theme.css; `layout.tsx` already defines it where it imports the font and injects it into the html element.

### Updated dependencies

Updated all production and development dependencies to latest.

---

## 2025-11-12 v1.1.0

### Add claude.md file

Added a `claude.md` file to the repository root with the project's coding guidelines, which Claude Code uses to generate code.

---

## 2025-11-12 v1.0.9

### Fix passkeys reload issue

The passkeys list now reloads correctly after adding or deleting a passkey.

---

## 2025-11-12 v1.0.8

### Fix missing fields in auth schema

Added the missing `aaguid` (Passkey) and `displayUsername` (User) fields to the schema; their absence made passkey creation fail.

---

## 2025-11-12 v1.0.7

### Fixed mobile menu closing issue

The mobile menu now closes when a menu item is clicked.

---

## 2025-11-11 v1.0.6

### Fix content-collections schema

The upcoming content-collections version requires the `content` field, which was previously generated automatically.
We added it to the schema to avoid breaking changes.

### Updated production dependencies

Updated all production dependencies to latest.

### Fixed AI chat component

Fixed a validation issue in the AI chat component that made the `addMessageToChat` procedure fail.

---

## 2025-11-11 v1.0.5

### Fix formatting

Ran `pnpm format` to fix formatting.

### Updated all dependencies

Updated production and development dependencies to latest.

---

## 2025-11-08 v1.0.4

### Fixed AI chat component

Fixed a type issue in the AI chat component.

### Fixed Tailwind CSS wrapper component in mail templates

As reported in #2173, some Tailwind CSS classes were not applied correctly in the email wrapper.

### Added typescript as dev dependency to web app

This fixes the `pnpm type-check` command.

---

## 2025-11-08 v1.0.3

### Fixed schema error in addMessageToChat procedure

Fixed a schema error in the `addMessageToChat` procedure that made the OpenAPI schema invalid.

---

## 2025-11-03 v1.0.2

### Updated dependencies

---

## 2025-11-03 v1.0.1

### Updated React type definitions

Updated `@types/react` and `@types/react-dom` from 19.0.0 to 19.2.2 for the latest React 19 type definitions and fixes.

The pnpm overrides are consolidated in the root `package.json`.

### Optimized pnpm dependency installation

Added `onlyBuiltDependencies` to the pnpm settings so only the Prisma packages (`@prisma/client`, `prisma`, and `prisma-zod-generator`) are built, which avoids unnecessary rebuilds and speeds up installation.

### Added pg dependency

Added `pg` (PostgreSQL client) as a dependency for the Prisma Rust-free client; the Prisma adapter needs it for PostgreSQL connections.

---

## 2025-11-03 v1.0.0

### Prisma client migration to Rust-free client

We migrated to the Rust-free Prisma client to reduce client bundle size and improve performance.

#### Migration steps

To upgrade a supastarter project to this version, change how the prisma client is generated:

1. Update `prisma` and `@prisma/client` to the latest version.

2. In the `schema.prisma` file, change the `provider` to `prisma-client`, the `output` to `./generated` and set the `engineType` to `client`.

3. Update `packages/database/prisma/client.ts` like this:

```ts
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "./generated/client";

const prismaClientSingleton = () => {
	if (!process.env.DATABASE_URL) {
		throw new Error("DATABASE_URL is not set");
	}

	const adapter = new PrismaPg({
		connectionString: process.env.DATABASE_URL,
	});

	return new PrismaClient({ adapter });
};

declare global {
	var prisma: undefined | ReturnType<typeof prismaClientSingleton>;
}

// biome-ignore lint/suspicious/noRedeclare: This is a singleton
const prisma = globalThis.prisma ?? prismaClientSingleton();

if (process.env.NODE_ENV !== "production") {
	globalThis.prisma = prisma;
}

export { prisma as db };
```

For a database other than PostgreSQL, see which adapter to use: https://www.prisma.io/docs/orm/prisma-client/setup-and-configuration/no-rust-engine#3-install-the-driver-adapter

### Next.js 16 migration

To align an existing project with the Next.js 16 defaults and Supastarter conventions:

1. Upgrade `next`, `react`, and `react-dom` to their latest stable releases in both `package.json` files (`package.json` at the root and `apps/web/package.json` if it exists).

2. Rename the middleware entry point:
   - Move `apps/web/middleware.ts` to `apps/web/proxy.ts`.
   - In the renamed file, rename the exported handler from `middleware` to `export function proxy(...)`.

3. Remove the inline ESLint configuration from `apps/web/next.config.ts`

4. In the marketing docs layout `apps/web/app/(marketing)/[locale]/docs/[[...path]]/layout.tsx`, change the `DocsLayout` prop from `disableThemeSwitch` to `themeSwitch={{ enabled: true }}`.

See https://nextjs.org/docs/app/guides/upgrading/version-16 for the full migration guide (beyond the supastarter codebase).

---

### Biome 2.3 upgrade

Biome 2.3 changes how CSS files are handled and doesn't yet support the Tailwind CSS 4 config format, so update `biome.json` to ignore `globals.css` for now:

```jsonc
{
	"files": {
		"includes": [
			"**",
			"!zod/index.ts",
			"!tailwind-animate.css",
			"!!**/globals.css", // <- ignore this file
		],
	},
	"css": {
		"parser": {
			"tailwindDirectives": true, // <- enable tailwind directives parsing
		},
	},
}
```
