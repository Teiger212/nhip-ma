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

- **Drafts and translation** go through one model adapter (`modules/inbox/lib/drafts/`,
  ADRs 0005, 0007): `openai-compatible` when `DRAFT_API_KEY` is set (plain `fetch` to
  `/chat/completions`, `DRAFT_MODEL` required, `DRAFT_BASE_URL` defaults to OpenRouter),
  otherwise `none`: no translation, template drafts. Guest text is framed as data in the
  prompt, and `drafts/guardrails.ts` drops a draft that touches paperwork or ownership.
- **Translation** runs at ingest and when a thread is opened (the detail route, for the
  operator's language), never from the list poll. A failed call is recorded per message and
  language (`inbox_translation_failure`) and retried no sooner than 10 minutes later, at most
  5 times (`translationRetryDue` in `translate.ts`), so an outage costs no repeated model calls.
- **Inbox reads** come in three shapes (`modules/inbox/lib/inbox-queries.ts`): the list is
  `ConversationSummary` rows from one SQL query (`listConversationSummaries`: who, pipe,
  owner, turn, the last guest message as preview), the open thread is the whole
  `Conversation` from `/api/conversations/:id`, and the Your-turn count is a SQL count
  (`countYourTurn`). All three share one visibility rule and one Your-turn rule, and live
  under one TanStack Query key, so a send or reassignment refreshes them together.
- **Background work** (`background.ts`) runs on Next.js `after()` inside a request, so the
  platform keeps it alive after the response (ADR 0016). Tests call `settleBackgroundWork()`.
- **CRM seam** (ADR 0003, spec #59), `modules/inbox/lib/crm/`: one `CrmAdapter` per CRM kind
  (`crmAdapterFor`; only the mock so far), pure rules (`rules.ts`, `phone.ts`), and the CRM
  sync module (`sync.ts`), which owns a thread's link to its lead and persists through the
  store. After a guest's message on a thread with no lead, `afterGuestInbound` runs the sync's
  `newGuest` in the background; the thread's `inbox_crm_link` row is the claim, so concurrent
  first messages make one lead. Home still shows "connect your CRM" where closings and lost
  will be (#68).
- **Home** (ADR 0002): `modules/home/lib/funnel.ts` resolves the office and calls
  `store.funnel(viewer, { since, timeZone })`, one SQL query over Answers. The window is 30
  local days in the office's time zone (`modules/home/lib/window.ts`, Asia/Ho_Chi_Minh
  until offices carry their own); leads by day and the response-time buckets are counted
  from the same rows. Stages, response time and the cohort are defined in CONTEXT.md,
  "Funnel". **Waiting now** on Home reads the inbox's own list query, so it lists what the
  operator can open, in the queue's order. The sidebar's Your-turn count reads that same list
  on Inbox and Home, and elsewhere polls `/api/conversations/your-turn`, which returns only
  the number.

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
packages/mail         Invitation and auth emails; the pipe-disconnected alert
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
- **Pool then owner** (ADR 0015): a thread starts in the office's pool (`ownerId` null).
  The first agent whose approved reply is written claims it, inside `beginAnswer`'s
  transaction and only while it is still unowned, so two agents answering at once end with
  one owner; a reply sent from the vendor's own app claims nothing. The viewer is
  `{ userId, officeId, role }`: an **agent** sees the pool and their own threads; a
  **manager** (a kit `owner` or `admin` member, mapped in `resolveOffice`) sees every thread
  and reassigns through `/api/conversations/:id/owner` (`setOwner`: to a member of the
  office, or back to the pool). `/api/office` returns the role and `/api/office/agents` the
  people a thread can go to. An owner whose account ends leaves their threads to the pool
  (`onDelete: SetNull`). Spec: `tests/pool-owner.spec.ts`.
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
- **Disconnected**: a failed Zalo refresh marks the credential disconnected and emails every
  platform admin. Guests' messages still arrive; replies from that OA are refused
  (`409 pipe_disconnected`) and the inbox shows why (`/api/pipes/status`); other endpoints
  are unaffected. Connections shows "Needs reconnect". **Disconnecting** releases the
  endpoint: no more sends, no more filing; its threads stay.
- **Approve and send** (ADRs 0006, 0011): the request names the inbound and the exact text.
  The `Answer` row is written in `sending` before the vendor call (unique on `inboundId`);
  a vendor refusal is `failed` and may be approved again, anything uncertain is `unknown`
  and refused (`409 delivery_unknown`) until a person reconciles it. Other refusals:
  `409 stale_target`, `400 inbound_required`, `400 empty_reply`.
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
- **Thread identity** is (office, pipe, guest); the id keeps the `office:pipe:guest` shape.
  `Answer.operatorId` is set-null so a send's record outlives its sender (ADR 0013).
- **Schema changes**: dev uses `prisma db push`. Hosted environments use `prisma migrate`
  from the `0_init` baseline in `prisma/migrations/`. After editing the schema, run
  `pnpm --filter @repo/database migrate:new <name>`, which replays the migrations into a
  throwaway database and writes the diff. `migrate:check` fails when the schema has changes
  no migration covers; CI runs it. `migrate:deploy` applies them. Hosted environments
  migrate on build: `apps/saas/scripts/vercel-build.sh` runs `prisma migrate deploy` against
  the direct (non-pooled) URL before building, and a failed migration fails the build, so the
  previous deployment keeps serving. Migrations are additive and stay compatible with the
  release before (ADR 0016), so applying one ahead of its code is safe.
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
  type check, Vitest, `migrate:check`, `seed:check`; then an E2E job that builds
  production and runs Playwright over HTTPS through a local proxy
  (`tests/support/https-proxy.mjs`), against a Postgres service with `SEND_MODE=mock` and
  no retries.
- **Staging** deploys when `main` builds on Vercel. The project's Ignored Build Step builds
  only `main` and `production`; there are no per-PR previews. Staging env vars are scoped
  to Preview on `main`. The Neon `staging` branch is never seeded.
- **Staging smoke** (`.github/workflows/staging-smoke.yml`): on each successful Preview
  deployment, `pnpm --filter saas smoke` (`playwright.smoke.config.ts`, `tests/smoke/`)
  checks read-only that pages load, signed-out APIs refuse and webhooks fail closed.
- **Prod** builds from the `production` branch, which a GitHub ruleset locks against
  pushes and deletion. The release workflow that moves it to a commit staging ran, and
  runs prod migrations first, is planned for PRODUCT.md milestone 6. No release has
  shipped.

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

Hosting is in Singapore and the model providers are abroad, so guests' data leaves Vietnam;
the personal data protection duties (the cross-border transfer impact assessment filed with
A05) are on PRODUCT.md's go-live gate. What Eyal sets by hand for PostHog is in
[docs/setup-checklist.md](./docs/setup-checklist.md).

## Locale routing

- Operator locales are `en` and `vi` only (`packages/i18n/config.ts`,
  `modules/shared/lib/walk-locales.ts`). Guest languages (EN, VI, JA, KO, RU) are separate.
- next-intl with `localePrefix: "always"` (`modules/i18n/routing.ts`). Pages live under
  `app/[locale]/…`; `/de/inbox` is not routable.
- `apps/saas/proxy.ts` runs next-intl's middleware and skips `api`, `webhooks`, `dev`,
  `image-proxy`, `_next`, `_vercel` and any path with a dot.
- `/` is a static `next.config.ts` redirect to `/en/inbox` (before the proxy, so English by
  design); `/inbox` goes to `/{locale}/inbox`; `/{locale}` goes to `/{locale}/inbox`.
- The `NEXT_LOCALE` cookie remembers the choice for unprefixed paths; cookie-only locale
  without a path prefix was tried and rejected. The EN/VI toggle switches the path prefix.

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
