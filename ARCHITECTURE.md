# Architecture

How Nhịp is built today, on `main`. The product is [PRODUCT.md](./PRODUCT.md), the words
are [CONTEXT.md](./CONTEXT.md), and the reasons are the ADRs in [docs/adr](./docs/adr).
Setup, commands, aliases and gates are in [AGENTS.md](./AGENTS.md). Where something here is
planned rather than built, it says so and names the ADR or PRODUCT line.

## The system in one picture

```text
 guest (phone)
   │  WhatsApp / Zalo
   ▼
 vendor ──webhook──▶ /webhooks/{whatsapp,zalo}   verify signature (fail closed, 403)
                        │                         parse through the pipe adapter
                        ▼
                     endpoint → office?  ── no ──▶ dropped (logged)
                        │ yes
                        ▼
                     inbox store (Postgres) ◀──── one-shot: language, extract, template
                        │                    ◀──── model adapter, in after(): translation
                        │                          into en + vi, follow-up draft
                        │                    ◀──── auto-reply, in after(): a new guest's first
                        │                          message, claimed once, sent (ADR 0021)
                        ▼
                     Inbox (operator) ── polls /api/conversations (summaries) and the
                        │                  open thread's /api/conversations/:id, every 10 s
                        │
                        │  Approve and send (one guest message, exact text)
                        ▼
                     Answer written (sending) ─▶ pipe adapter ─▶ vendor ─▶ guest
                        │                          (mock unless live + connected)
                        ▼
                     Home: funnel counted from Answers in SQL, per office
```

- **Drafts and translation** go through one model layer (`modules/inbox/lib/drafts/`,
  ADRs 0005, 0007, 0024), as two named tasks, `draft` and `translate`. With
  `DRAFT_API_KEY` set, each task calls OpenRouter (`drafts/openrouter.ts`, plain `fetch` to
  `/chat/completions`) with its own model: `DRAFT_MODEL` and `TRANSLATE_MODEL`, both
  defaulting to `anthropic/claude-haiku-5.5`. Every request asks for zero-retention routing
  (`provider: { zdr: true, data_collection: "deny" }`); production refuses a
  `DRAFT_BASE_URL` other than OpenRouter. `drafts/layer.ts` puts each call behind the
  office's daily cap (`DRAFT_DAILY_CAP` 50, `TRANSLATE_DAILY_CAP` 1000, counted per call in
  `inbox_model_usage`, the day midnight to midnight in Asia/Ho_Chi_Minh), a 20 s timeout with
  one retry, and one log line per call (task, model, officeId, tokens, latency, outcome; never
  text). Without a key no task runs: no translation, template drafts. In E2E, `MODEL_STUB`
  answers the tasks it names with fixed text (`drafts/stub.ts`); production refuses it. Guest
  text is framed as data in the prompt, with no phone number or email. The model reads the last 10
  messages and the auto-reply's open questions, and answers JSON: the reply in the guest's
  language and the same reply in the office language (`inbox_draft.officeReply`, #251).
  `drafts/guardrails.ts` drops a malformed answer, and a draft that states a price, an
  availability, a viewing time or a legal answer, or writes a number the guest didn't.
- **Translation** goes into the office language only (ADR 0025): `inbox_office_setting.language`,
  read through `store.officeLanguage`, English when the manager hasn't set one
  (`DEFAULT_OFFICE_LANGUAGE`). It runs at ingest and when a thread is opened (the detail route
  reads the office language itself, never the client's), never from the list poll. After the
  manager changes the language, opening an older thread translates its guest messages into the
  new one then, against the daily cap; translations in the old language are kept, not shown. A failed call is recorded per message and
  language (`inbox_translation_failure`) and retried no sooner than 10 minutes later, at most
  5 times (`translationRetryDue` in `translate.ts`), so an outage costs no repeated model calls.
- **Inbox reads** come in three shapes (`modules/inbox/lib/inbox-queries.ts`): the list is
  `ConversationSummary` rows from one SQL query (`listConversationSummaries`: who, pipe,
  owner, turn, the last guest message as preview), the open thread is the whole
  `Conversation` from `/api/conversations/:id`, and the Your-turn count is the queue rule's
  `yourTurnCount` over those same summaries, on the server for pages without the list and on
  the client where the list is loaded. The store derives each thread's turn fact
  (`unansweredInboundId`); which threads count is decided only in the queue rules, so the
  count has no SQL copy. All three share one
  visibility rule and one Your-turn rule, and live under one TanStack Query key, so a send or
  reassignment refreshes them together.
- **The auto-reply** (ADR 0021, `sendAutoReply` in `inbox.ts`): after the one-shot,
  `afterGuestInbound` schedules it in the background for a new guest message on a thread the
  office hasn't spoken on. The job reads the office's switch (`inbox_office_setting`, no row
  means on) and skips a thread whose first message is older than the switch's last turn on
  (`autoReplyOnSince`, S1; message times are the vendor's clock). A manager sets the switch on
  the office's General settings page (`PUT /api/office/auto-reply`, #167), which stamps
  `autoReplyOnSince` only on a turn from off to on, in one statement. The job then claims the
  thread with one conditional update (`autoReplyAt` null → now, and still no office message),
  so two first messages at once make one greeting. It sends through
  `connectionFor` and `transmit` like an Answer (never from a disconnected endpoint; a mock
  send reports `mock-auto-reply-<thread id>`), once, and files an outbound with source
  `auto_reply`, `writtenBy`, and the hashed vendor id, so the vendor's echo is a duplicate. It
  is not an Answer: no `sentAt`, no owner, and the queue and funnel SQL read only Answers and
  `oa_echo`, so the thread stays Your turn. The text is `greetingTemplate` (`greeting.ts`) in
  the guest's language, ending with the label; the model writes it from #168. The seed passes
  `autoReply: false`.
- **Background work** (`background.ts`) runs on Next.js `after()` inside a request, so the
  platform keeps it alive after the response (ADR 0016). Tests call `settleBackgroundWork()`.
- **Alerts** (ADR 0019, spec #84), `modules/inbox/lib/guest-alerts/`: a new guest message
  (`afterGuestInbound`, inserted messages only) schedules `alertGuestMessage` in the
  background. It picks the recipients (`recipients.ts`), writes one `inbox_alert` row each
  under the burst rule's advisory lock, then hands the event's deliveries to the **transport
  seam** (`transport.ts`), chosen by `SEND_MODE`: mock sends nothing; live
  (`push.ts`, `web-push`) posts each recipient's devices (`push_subscription`, queries in
  `packages/database/prisma/queries/push-subscriptions.ts`) with VAPID, urgency high and a
  1-hour TTL, at most 5 pushes in flight per event, deletes a device on 404 or 410, and logs a
  failure as its status only. Without the VAPID keys it logs "push not configured". It posts
  only to `https` endpoints on Google's, Apple's, Mozilla's and Microsoft's push hosts, checked on registration and again before each push, in one normal form (the WHATWG
  `href`, plain DNS labels, and the same host for Node's legacy parser, which `web-push`
  connects with), which is what is stored and posted to. The payload is `{ alertId, tag, title, body,
url, sound }`, encrypted for the device; `tag` is an HMAC of the thread id. Devices come and
  go through `/api/alerts/devices` (POST, DELETE for this sign-in, `/test`), and a Better Auth before-hook on `/sign-out` deletes the signing-out session's devices; a
  session delete hook does the same for every other way a live session ends (revoking it or
  the others, a ban, a password reset that revokes, the end of an impersonation), while an
  expired session keeps its devices (A5). An impersonating admin cannot add a device. `pnpm seed`
  always uses the mock transport. Registering is proof of possession (#135): an endpoint
  another operator holds moves only with the same `p256dh` and `auth` (the same browser),
  else 409, decided under an advisory lock on the endpoint; and the registration holds the
  session row `FOR SHARE` and keeps no device if its session is gone, while a session delete
  after-hook removes the session's devices once its row is gone, so a sign-out racing a
  registration leaves none. A push gives up after 10 seconds.
- **Installable app and service worker** (#135): `app/manifest.ts` (standalone, starts on the
  Inbox, icons in `public/icons/`) and `public/sw.js`, served `no-cache` (`next.config.ts`);
  both pass the locale proxy, whose matcher skips dotted paths. The worker has no fetch
  handler and caches nothing: it shows a push (`showNotification` with the payload's title,
  body and `tag`, and `renotify` from `sound` except on Apple's WebKit) and on a click focuses
  an open Nhịp window and takes it to the alert's link, or opens one. The page registers it
  and subscribes only on "Turn on alerts" (`modules/inbox/lib/this-device.ts`), with the VAPID
  public key from `GET /api/alerts/devices` (which also says whether this sign-in has a
  device). The Inbox's alerts panel and Settings → Notifications' "This device" row read that;
  signing out also unsubscribes the browser. E2E and CI make a fresh VAPID pair per run; a
  production, staging or live deployment refuses the retired E2E key at startup.
- **CRM seam** (ADR 0003, spec #59), `modules/inbox/lib/crm/`: one `CrmAdapter` per CRM kind
  (`crmAdapterFor`: the mock and HubSpot), pure rules (`rules.ts`, `phone.ts`), and the CRM
  sync module (`sync.ts`), which owns a thread's link to its lead and persists through the
  store. After a guest's message on a thread with no lead, `afterGuestInbound` runs the sync's
  `newGuest` in the background; the thread's `inbox_crm_link` row is the claim, so concurrent
  first messages make one lead. The platform admin sets the office's CRM in its Connections
  card (`OfficeCrm`, `/api/crm/connection`). A kind that takes an access token (HubSpot) is
  saved only with one: `connectOffice` seals it with `PIPE_SECRETS_KEY` (ADR 0017's
  `encryptSecret`) onto `inbox_crm_connection.accessToken`, and only the sync opens it, to hand it
  to `crmAdapterFor`; the API answers `tokenSet`, never the token. The HubSpot adapter
  (`hubspot.ts`, #65) finds the guest's contact by phone (read back as E.164) or by the
  `zalo_user_id` property it creates on first need, links to the contact's open deal, and
  otherwise creates the contact if there is none, then an unassigned deal associated with it;
  `hubspot.test.ts` replays its calls against recorded HubSpot exchanges. Outcomes arrive by
  the CRM's webhook
  (`/webhooks/crm/mock`, signed with `MOCK_CRM_WEBHOOK_SECRET`; `/webhooks/crm/hubspot`, #66,
  signed v3 with `HUBSPOT_APP_CLIENT_SECRET` over `HUBSPOT_WEBHOOK_URL`; each absent where unset).
  The kind's reader (`crmWebhookFor`) returns the CRM accounts its notice names and their changed
  leads; the sync's `noticesReceived` finds the offices on each account (the mock's account is
  the office; HubSpot's is the portal id the adapter's `account` reports, kept on
  `inbox_crm_connection.accountId` after the token is saved, or asked lazily) and only theirs
  are touched (ADR 0008). With the account the adapter reports where its leads open in the CRM's
  web app (`leadUrlPrefix`: HubSpot's deal record on the portal's own `uiDomain`, which differs by
  data centre; null for the mock), and the store builds the open thread's `crm.leadUrl` from it
  and the lead id, so "In CRM" links to the deal (CRM 10). Opening a linked thread with no
  address yet asks the CRM again in the background, once per office per instance every ten
  minutes (`scheduleMissingLeadAddress`). On a notice, the sync's
  `outcomesChanged` asks the adapter for the changed leads' outcomes and caches them on the link,
  observed when Nhịp first heard them (`observeOutcome`). The thread summary carries the link, so
  the queue rule (`isResolved`, `inQueue`) and the nav count read it on the client. Home still
  shows "connect your CRM" where closings and lost will be (#68); it becomes a neutral "No CRM"
  chip (PRODUCT.md, 2026-10-04).
- **Home** (ADR 0002): `modules/home/lib/funnel.ts` resolves the office and calls
  `store.funnel(viewer, { since, timeZone })`, one SQL query over Answers. The window is 30
  local days in the office's time zone (`modules/home/lib/window.ts`, Asia/Ho_Chi_Minh
  until offices carry their own); leads by day and the response-time buckets are counted
  from the same rows. Stages, response time and the cohort are defined in CONTEXT.md,
  "Funnel". **Waiting now** on Home reads the inbox's own list query, so it lists what the
  operator can open, in the queue's order. The sidebar's Your-turn count, the tab title's
  "(n)" (put in front of the page's own title, "(n) Home – Nhịp", #212) and the guest toasts
  read that same list on every page of the app shell (#136): the toasts need the guests'
  names, so one poll serves all three.

## Apps and packages

`apps/saas` is the only app that ships. It is a supastarter kit app: Next.js App Router,
Better Auth, Prisma, oRPC. Port 3010 in dev.

```text
apps/saas             The product. Deployed to Vercel (root apps/saas).
packages/auth         Better Auth config, invitation-only plugin, offboarding, roles
packages/database     Prisma schema + client; inbox/ is the inbox store (ADR 0012)
packages/api          Kit oRPC procedures (admin lists, organizations, users, ...)
packages/i18n         en + vi catalogs; Nhịp copy is inbox.* in translations/{en,vi}
packages/ui           Shared components (Base UI wrapped), theme
packages/mail         Invitation and auth emails, and the kit's welcome (no other email)
```

The kit apps `apps/marketing`, `apps/docs` and `apps/mail-preview` are unused. `apps/saas`
still carries kit modules Nhịp does not build on (payments, onboarding) and depends on
`packages/payments`, `notifications`, `storage` (office logos) and `permissions` through the
kit. Kit screens Nhịp keeps but does not show yet are switched off in one place,
`modules/shared/lib/kit-screens.ts` (off means a 404 and no link): Billing with the plan
picker and checkout return (ADR 0014, an office pays per seat, not built), the start page
and the AI chat demo. An office's own URL redirects to the Inbox; its kit start page, with
sample revenue and churn, stays in the tree unrouted.

Nhịp's own code in `apps/saas`:

| Path                                              | What                                                   |
| ------------------------------------------------- | ------------------------------------------------------ |
| `modules/inbox/components/`                       | Inbox: list, thread, reply box, send bar               |
| `modules/inbox/lib/inbox.ts`                      | Ingest, approve and send, regenerate draft             |
| `modules/inbox/lib/{extract,draft,crib}.ts`       | One-shot: extract, template reply, operator note       |
| `modules/inbox/lib/queue.ts`                      | Your turn, quiet, order, counts (ADR 0004)             |
| `modules/inbox/lib/drafts/`                       | Model adapter, prompts, guardrails                     |
| `modules/inbox/lib/pipes/`                        | Pipe adapters, webhook path, Zalo connect and tokens   |
| `modules/inbox/lib/{config,runtime}.ts`           | Validated env, runtime singleton (store + config)      |
| `modules/inbox/lib/{require-session,office}.ts`   | 401/403 gate, office from membership                   |
| `modules/home/`                                   | Home: funnel, leads by day, waiting now, response time |
| `modules/admin/component/organizations/`          | Admin area: offices, Connections, members, invites     |
| `modules/shared/lib/{error-tracking,scrub}.ts`    | Error tracking, scrubbed of personal data              |
| `modules/shared/lib/{walk-nav,platform-admin}.ts` | Sidebar rows, where the platform admin lands           |
| `app/api/conversations/**`                        | List, detail, approve, draft, owner, Your-turn count   |
| `app/api/office/**`                               | The operator's role; the office's agents (reassign)    |
| `app/api/pipes/**`                                | Connections, status, disconnect, Zalo connect/callback |
| `app/webhooks/{whatsapp,zalo}/route.ts`           | Inbound                                                |
| `app/dev/inbound/route.ts`                        | Local fake inbound; 404 in production                  |

The inbox and pipe routes are plain route handlers outside oRPC and outside the
`(authenticated)` layout, so each checks the session itself. Path aliases (`@inbox/*`,
`@home/*`, `@shared/*`, ...) are listed in [AGENTS.md](./AGENTS.md).

## Tenancy and roles

- **Office = kit organization** (ADR 0008). Every thread, pipe connection and member
  belongs to one; deleting it cascades to its threads and pipes (ADR 0012).
- **One operator, one office** (ADR 0010). `resolveOffice` reads the membership table on
  every request: none is `403 no_office`, more than one `403 ambiguous_office`. The
  session's active organization is never consulted. Accepting a second office's
  invitation is refused in an auth hook (`ONE_OFFICE_PER_OPERATOR`).
- **Platform admin** is `user.role` containing `admin` (`packages/auth/lib/roles.ts`). The
  kit makes an office's creator its owner; that membership is inert (ADR 0015 amendment):
  `resolveOffice` refuses the platform admin first (`403 platform_admin`), and the Inbox
  and Home pages redirect them to `/admin/organizations`. Their sidebar has the admin area
  only.
- **Where people land**: operators on `/{locale}/inbox`; the platform admin on
  `/{locale}/admin/organizations`.
- **Office setup** today is two steps in the admin area: create the organization, then on
  its page invite members (`InviteMemberForm`) and connect pipes. ADR 0018's single step is
  not built.
- **Office settings are managers only** (#212): each page under
  `/{locale}/{office slug}/settings/` (General, Team, Billing) first calls
  `requireOfficeManager(slug)` (`modules/organizations/lib/require-office-manager.ts`), which
  answers the not-found page (404) to anyone without `organization.manage` before the page reads
  anything of its own. It is not in a layout, whose check wouldn't re-run between its child
  pages, nor in `proxy.ts`; server actions and API routes keep their own checks.
- **Team** (#82): a manager's user menu links to the kit's members page,
  `/{locale}/{office slug}/settings/members` (`/api/office` returns the slug). The page is
  managers only (`requireOfficeManager`; anyone else gets a 404) and hides the platform admin's
  row and the manager's own Leave and role. The role select offers Agent (`member`) and
  Manager (`admin`) everywhere, the admin area included; an auth before-hook refuses `owner`
  (alone, in a comma list or an array) in `invite-member` and `update-member-role` to anyone
  but the platform admin. Better Auth alone refuses `owner` from a kit `admin` but grants it
  from a manager who holds `owner`; it refuses an agent's invite, role change and removal itself.
- **Assigning leads** (ADR 0022, replacing ADR 0015's pool): a thread starts Unassigned
  (`ownerId` null). The viewer is `{ userId, officeId, role }`: an **agent** sees only
  their own threads (`visibleTo`, `visibleSql`); a **manager** (a kit `owner` or `admin`
  member, mapped in `resolveOffice`) sees every thread and assigns or reassigns through
  `/api/conversations/:id/owner` (`setOwner`: to a member of the office, or back to
  Unassigned; the last call wins). A manager whose approved reply is written on an
  Unassigned thread claims it, inside `beginAnswer`'s transaction and only while it is
  still unowned; a reply sent from the vendor's own app, or the auto-reply (ADR 0021),
  claims nothing. `/api/office` returns the role (and the office's slug, for Team) and `/api/office/agents` the people a
  thread can go to. An owner whose account ends leaves their threads Unassigned
  (`onDelete: SetNull`). Spec: `tests/assign.spec.ts`.
- **Offboarding** (ADR 0013): when a membership ends, the account is deleted in the same
  request (`packages/auth/lib/offboarding.ts`), the platform admin excepted. `Answer`
  keeps `operatorName`.

## Auth

Better Auth 1.6 in `packages/auth/auth.ts`, Prisma adapter, same database.

- **Invitation only**: `enableSignup: false`, the kit's invitation-only plugin, and
  `allowUserToCreateOrganization` only for the platform admin. An invitee who signs up
  from the link is signed in with a verified email. Magic link, social sign-in, passkeys
  and 2FA stay enabled for existing accounts.
- **Base URL** is `NEXT_PUBLIC_SAAS_URL`; it is the trusted origin. Startup validation
  (`modules/inbox/lib/config.ts`, run from `instrumentation.ts`) refuses a bad config in
  production.
- **Rate limits**: Better Auth's, with `storage: "database"` (the `rateLimit` table, shared
  across serverless instances), keyed on `x-forwarded-for`; plus a Vercel Firewall rule of
  300 requests/min per IP on `/api/` and `/webhooks/` (project setting, see AGENTS.md).
- **testUtils** exist only in the E2E suite's own auth instance
  (`apps/saas/tests/support/test-auth.ts`), built from the exported `authOptions`; the app
  never loads it.

## Pipes

One **pipe adapter** per pipe (`modules/inbox/lib/pipes/index.ts`) owns verify, parse, send
window and send. `pipes/webhook.ts` is the single inbound path for both webhook routes.

- **Inbound**: WhatsApp verifies `X-Hub-Signature-256` with `WHATSAPP_APP_SECRET`; Zalo
  verifies `X-ZEvent-Signature` with `ZALO_OA_SECRET_KEY`. A missing secret is 403. Each
  event's endpoint (the WhatsApp phone number id or Zalo OA id) is looked up in
  `PipeConnection`; the office holding it gets the thread, and an event on an endpoint no
  office holds is dropped. Each message records its endpoint (`Message.pipeExternalId`),
  and a reply goes out from the endpoint the guest last wrote to.
- **Pipe connections** (ADR 0017): the platform admin manages them per office in Admin →
  Organizations → an office → Connections. **Zalo** connects by OAuth with PKCE
  (`/api/pipes/zalo/connect` → Zalo consent → `/api/pipes/zalo/callback`); an OA held by
  another office is refused. Each OA's tokens sit in `PipeCredential`, encrypted
  AES-256-GCM with `PIPE_SECRETS_KEY` (env only). A refresh runs under `SELECT … FOR
UPDATE` and writes the new pair in the same transaction. **WhatsApp** is not yet
  per-connection: one number per deployment from env (`WHATSAPP_ACCESS_TOKEN`,
  `WHATSAPP_PHONE_NUMBER_ID`), mapped to an office with `pnpm --filter saas pipe:connect`.
- **Live vs mock**: `SEND_MODE` is the deployment switch; only exactly `live` reaches a
  vendor. In a live deployment a send goes out only from a connected endpoint the thread's
  office holds; anything else is refused, never mocked (`409 pipe_not_connected`). Mock
  deployments mock every send.
- **Disconnected**: a failed Zalo refresh marks the credential disconnected and gives every
  platform admin a bell row naming the pipe and the office (no email, ADR 0017 amended).
  Guests' messages still arrive; replies from that OA are refused (`409 pipe_disconnected`)
  and the inbox shows why (`/api/pipes/status`); other endpoints are unaffected. Connections shows "Needs reconnect". **Disconnecting** releases the
  endpoint: no more sends, no more filing; its threads stay.
- **Approve and send** (ADRs 0006, 0011): the request names the inbound and the exact text.
  The `Answer` row is written in `sending` before the vendor call (unique on `inboundId`);
  a vendor refusal is `failed` and may be approved again, anything uncertain is `unknown`
  and refused (`409 delivery_unknown`) until a person reconciles it. Other refusals:
  `409 stale_target`, `400 inbound_required`, `400 empty_reply`. The one exception to
  `stale_target` (ADR 0024, #252): a request with `edited: true` naming an earlier guest message
  of the open turn (no Answer of its own, no human reply after it) is the agent's kept edit, and
  answers the latest guest message.
- **Webhook delivery log** (ADR 0017): `pipes/webhook.ts` records every incoming webhook
  (`recordWebhookDelivery`: pipe, outcome `processed`, `refused` or `failed`, the endpoints
  and offices it touched, how many messages were filed or dropped, the vendor's message
  ids), never a message's text or the guest's id. The platform admin reads it in
  Admin → Webhooks. Deliveries are kept 30 days, pruned without a scheduler by about one
  delivery in a hundred. Spec: `tests/webhooks.spec.ts`.

## Data

One Postgres (`DATABASE_URL`), one Prisma schema (`packages/database/prisma/schema.prisma`)
holding the kit's tables and the inbox's `inbox_*` tables: conversation, message,
translation, translation_failure, qualification, draft, paperwork, answer, pipe_connection,
pipe_credential, webhook_delivery.

- **The store is the only writer** of `inbox_*`: `createInboxStore(db)` in
  `packages/database/inbox/store.ts`, zod vocabularies in `schema.ts`, domain types in
  `types.ts`. Routes call its methods, never Prisma directly.
- **Thread identity** is (office, pipe, guest), the unique key inbound finds a thread by; the
  id is opaque (a `cuid()`; older threads were re-keyed to UUIDs) and never names the guest
  (ADR 0010, amended by #141). The thread keeps the guest's phone or Zalo id in `guestId`; no
  Answer copies it, and vendor message ids are stored as keyed hashes
  (`packages/database/inbox/vendor-id.ts`). A CRM link's `leadName`, the mock CRM's leads and
  message text can still hold it; guest deletion clears those (ADR 0020, #138).
- **The office line is held by the database** (#95). Every office-owned row carries
  `officeId`, and composite foreign keys to `(id, officeId)` keep it equal to its thread's
  (or its message's); every store method names its office and filters by it in the query.
  `Answer.operatorId` is set-null so a send's record outlives its sender (ADR 0013).
- **Schema changes**: dev uses `prisma db push`. Hosted environments use `prisma migrate`
  from the `0_init` baseline in `prisma/migrations/`. After editing the schema, run
  `pnpm --filter @repo/database migrate:new <name>`, which replays the migrations into a
  throwaway database and writes the diff. `migrate:check` fails when the schema has changes
  no migration covers; CI runs it. `migrate:deploy` applies them. Hosted environments
  migrate on build: `apps/saas/scripts/vercel-build.sh` runs `prisma migrate deploy` against
  the direct (non-pooled) URL before building, with a 5s lock timeout
  (`packages/database/scripts/migrate-deploy.sh`), and a failed migration fails the build, so
  the previous deployment keeps serving. CI lints the migrations a PR adds with Squawk (#98). Migrations are additive and stay compatible with the
  release before (ADR 0016), so applying one ahead of its code is safe; AGENTS.md
  ("Migrations") has the expand/contract rule and its one recorded exception (#95), and
  `migrate:baseline` for giving a pushed dev database a migration history.
- **Connections** (#98): `packages/database/prisma/client.ts` builds the app's `pg` pool
  (10s connect timeout, attached to Vercel's Fluid compute with `attachDatabasePool`) and hands
  it to Prisma's adapter. Hosted, the app connects through Neon's pooler as `nhip_app`, whose
  role carries the server timeouts; migrations run as the owner (AGENTS.md, "Neon").
- **Tests** use `supastarter_test` (Vitest) and `supastarter_e2e` (Playwright) on the same
  server as dev.

## Environments and delivery

ADR 0016 and its amendment. One Vercel project `nhip`, one Neon project, both in Singapore.

```text
 dev       your machine   native Postgres, seed data, SEND_MODE=mock, /dev/inbound
 staging   main           Vercel Preview on main → https://nhip-staging.vercel.app
                          Neon branch "staging", SEND_MODE=live, test identities
 prod      production     Vercel Production, Neon branch "production"
```

- **CI** (`.github/workflows/ci.yml`) on every PR and push to `main`: lint, format check,
  type check, Vitest, `migrate:check`, `seed:check`, the migration lint (PRs); then an E2E job that builds
  production and runs Playwright over HTTPS through a local proxy
  (`tests/support/https-proxy.mjs`), against a Postgres service with `SEND_MODE=mock` and
  no retries.
- **Staging** deploys when `main` builds on Vercel. The project's Ignored Build Step builds
  only `main` and `production`; there are no per-PR previews. Staging env vars are scoped
  to Preview on `main`. The Neon `staging` branch is never seeded.
- **Staging smoke** (`.github/workflows/staging-smoke.yml`): on each successful Preview
  deployment, `pnpm --filter saas smoke` (`playwright.smoke.config.ts`, `tests/smoke/`)
  checks read-only that pages load, signed-out APIs refuse and webhooks fail closed.
- **Production smoke** (`.github/workflows/production-smoke.yml`, #113): the same suite as a
  Vercel Deployment Check. When a production deployment is built, Vercel's
  `vercel.deployment.ready` dispatch runs the suite against that deployment's own URL. Vercel
  gives the deployment the production domain only once this check passes, along with Vercel's
  Lint and TypeCheck.
- **Prod** builds from the `production` branch. Ruleset 24113338 ("production: releases
  only") blocks updates, non-fast-forward pushes and deletion; its one bypass is deploy keys.
  The release workflow (`.github/workflows/release.yml`, #112) is the only holder of a deploy
  key: on a published GitHub Release that Eyal approves, it fast-forwards `production` to a
  commit staging deployed and smoked. Vercel's build runs prod migrations first
  (`build:vercel`). The key itself is one of Eyal's setup steps
  (`docs/setup-checklist.md`). The production
  Neon branch is empty (no tables, no migration history); the first release migrates it
  from `0_init`. There are no Production-scope env vars yet (#99). No release has shipped.

## Observability and personal data

Errors go to the platform's logs, and to **PostHog Cloud** when `NEXT_PUBLIC_POSTHOG_KEY` is
set (it is not in dev, E2E or CI, so they send nothing).

- **Server** (`modules/shared/lib/error-tracking.ts`): unhandled request errors only, under
  one anonymous id, no geo lookup, each event sent at once (serverless).
- **Browser** (`modules/shared/components/ErrorTracking.tsx`): uncaught errors only, rebuilt
  from an allowlist. No session replay (it would record guests' messages), no autocapture,
  pageviews, feature flags or person profiles, nothing stored on the device; the SDK is
  bundled, not loaded from PostHog's CDN.
- **Scrubbing** (`modules/shared/lib/scrub.ts`): message text, names and phone numbers are
  removed before anything leaves the app (PRODUCT.md, milestone 1).
- **Server logs** (#220): Vercel keeps them, so they are telemetry too. A failure is logged by
  what failed and the error's kind (`errorKind` in `scrub.ts`), never by the error's message,
  nor a thread's, message's or guest's id. A background job's label is a string literal naming
  the job (`nhip/background-label-is-literal`, in `pnpm lint`). An office's own ids may appear
  (its office id, Zalo OA id, WhatsApp number id): they say which connection to fix.

Hosting is in Singapore and the model providers are abroad, so guests' data leaves Vietnam;
the personal data protection duties (the cross-border transfer impact assessment filed with
A05) are on PRODUCT.md's go-live gate. What Eyal sets by hand for PostHog is in
[docs/setup-checklist.md](./docs/setup-checklist.md).

## Locale routing

- Interface locales are `en` and `vi` only (`packages/i18n/config.ts`,
  `modules/shared/lib/walk-locales.ts`). Guest languages (EN, VI, JA, KO, RU) are separate.
- **An office member's locale is the office language** (ADR 0025), set by the manager on the
  office's General tab (`inbox_office_setting.language`, English by default). The proxy reads no
  database, so it only hands the request's path and query on (`x-nhip-path`,
  `modules/i18n/lib/request-path.ts`); the authenticated layout reads the member's office
  language (`officeLanguageFor`) and sends a member on the other prefix to the same page in it
  (`followOfficeLanguage`, `modules/i18n/lib/office-locale.ts`). An open page follows a change
  read while it is open (`OfficeLocaleSync`: the open thread's poll returns the office language).
  Alerts, their links and the test alert are written in it too; the bell and the operator note
  follow the interface. The platform admin keeps their own language and the EN/VI toggle;
  members have neither the toggle nor the account settings' language select. Sign-in pages keep
  the cookie and their own switch: no office is known there.
- next-intl with `localePrefix: "always"` (`modules/i18n/routing.ts`). Pages live under
  `app/[locale]/…`; `/de/inbox` is not routable.
- `apps/saas/proxy.ts` runs next-intl's middleware and skips `api`, `webhooks`, `dev`,
  `image-proxy`, `_next`, `_vercel` and any path with a dot.
- `/` is a static `next.config.ts` redirect to `/en/inbox` (before the proxy, so English by
  design); `/inbox` goes to `/{locale}/inbox`; `/{locale}` goes to `/{locale}/inbox`.
- The `NEXT_LOCALE` cookie remembers the choice for unprefixed paths; cookie-only locale
  without a path prefix was tried and rejected. The platform admin's EN/VI toggle and the
  sign-in pages' switch change the path prefix.

## Testing

AGENTS.md, "What gets a test" and "Test quality", is the rule; in short:

- **E2E first**: what a person does is a scenario in
  [docs/e2e-scenarios.md](./docs/e2e-scenarios.md) and a Playwright spec in
  `apps/saas/tests`. Specs are written by the `test-author` agent
  (`.claude/agents/test-author.md`) from the scenario, without reading app source. Seeded
  sessions are minted once per run; the app's rate limit stays on.
- **Vitest** for what has no user in it: the store, the queue and funnel rules, parsers,
  Zalo token refresh, config validation.
- Every test names the scenario or rule it proves and was seen failing first.
