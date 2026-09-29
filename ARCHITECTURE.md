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
                     Inbox (operator) ── polls /api/conversations every 10 s
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
- **Background work** (`background.ts`) runs on Next.js `after()` inside a request, so the
  platform keeps it alive after the response (ADR 0016). Tests call `settleBackgroundWork()`.
- **CRM seam** (ADR 0003): not on `main`. Home shows "connect your CRM" where closings and
  lost will be. The adapter, its mock and the linking UI are on the unmerged `feat/crm-seam`
  branch (PRODUCT.md, milestone 5).
- **Home** (ADR 0002): `modules/home/lib/funnel.ts` resolves the office and calls
  `store.funnel(viewer, { since })`, one SQL query over Answers. Stages, response time and
  the 30-day cohort are defined in CONTEXT.md, "Funnel".

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
still carries kit modules Nhịp does not build on (payments, onboarding, the AI chatbot
page) and depends on `packages/payments`, `notifications`, `storage` (office logos) and
`permissions` through the kit; billing is ADR 0014 territory in PRODUCT.md and not built.

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
| `modules/home/`                                   | Home: funnel, response time, CRM gap                   |
| `modules/admin/component/organizations/`          | Admin area: offices, Connections, members, invites     |
| `modules/shared/lib/{walk-nav,platform-admin}.ts` | Sidebar rows, where the platform admin lands           |
| `app/api/conversations/**`                        | List, detail, approve, draft (session-gated)           |
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
- **Pool then owner** (ADR 0015) is **not built**: `Conversation` has no owner, the viewer
  is `{ userId, officeId }`, and every operator in an office sees every thread. Managers
  (kit `owner`/`admin` members), reassignment and a seeded manager login are planned for
  PRODUCT.md milestone 2.
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
- **Webhook delivery log**: in progress on the unmerged `feat/webhook-log` branch
  (PRODUCT.md, "Advanced MVP"); nothing on `main` records deliveries.

## Data

One Postgres (`DATABASE_URL`), one Prisma schema (`packages/database/prisma/schema.prisma`)
holding the kit's tables and the inbox's `inbox_*` tables: conversation, message,
translation, qualification, draft, paperwork, answer, pipe_connection, pipe_credential.

- **The store is the only writer** of `inbox_*`: `createInboxStore(db)` in
  `packages/database/inbox/store.ts`, zod vocabularies in `schema.ts`, domain types in
  `types.ts`. Routes call its methods, never Prisma directly.
- **Thread identity** is (office, pipe, guest); the id keeps the `office:pipe:guest` shape.
  `Answer.operatorId` is set-null so a send's record outlives its sender (ADR 0013).
- **Schema changes**: dev uses `prisma db push`. Hosted environments use `prisma migrate`
  from the `0_init` baseline in `prisma/migrations/`. After editing the schema, run
  `pnpm --filter @repo/database migrate:new <name>`, which replays the migrations into a
  throwaway database and writes the diff. `migrate:check` fails when the schema has changes
  no migration covers; CI runs it. `migrate:deploy` applies them; nothing in CI or the
  Vercel build runs it on `main` today.
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

On `main`, errors go to the platform's logs only. Error tracking on PostHog Cloud, scrubbed
of guests' personal data before anything leaves the app, is open as PR #41
(`feat/error-tracking`, PRODUCT.md milestone 1). Hosting is in Singapore, so guests' data
leaves Vietnam; that PR's PRODUCT.md change adds Vietnam's personal data protection duties
to the go-live gate. Treat both as not yet decided on `main`.

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
