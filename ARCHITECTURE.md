# Architecture

How this repo is shaped for Nhịp. Inbox triage is the current surface. Shared UI comes from `packages/ui` and existing tokens. There is no separate brand lock or design-system lock.

## What the product uses

The working product lives in `apps/saas` on port **3010**. Locale-prefixed inbox routes are required:

- `/en/inbox`
- `/vi/inbox`
- `/` → `/en/inbox`
- `/inbox` → `/{locale}/inbox`

Do not build or ship `apps/marketing`, `apps/docs`, `apps/mail-preview`, or admin. Those apps remain in the tree as kit scaffolding; they are out of scope.

## Apps and packages

```text
apps/saas          Authenticated product. The only app that ships.
packages/ui        Shared chrome (sidebar, menus, buttons, theme)
packages/i18n      Locale catalog and `inbox.*` copy
packages/database  Prisma schema: auth (kit) and inbox (ADR 0012), one Postgres
```

Other `apps/*` and `packages/*` directories exist. Treat them as unused unless a change is explicitly asked for.

SaaS app aliases (`apps/saas/tsconfig.json`) include `@inbox/*` → `./modules/inbox/*`, plus `@i18n/*`, `@shared/*`, `@auth/*`, and the other module aliases.

## Locale routing

SaaS uses next-intl with `localePrefix: "always"` in `apps/saas/modules/i18n/routing.ts`. `apps/saas/proxy.ts` runs `createMiddleware` and excludes `api`, `webhooks`, `dev`, `image-proxy`, and `_next`.

Pages live under `apps/saas/app/[locale]/…`. The inbox page is:

`apps/saas/app/[locale]/(authenticated)/(main)/(account)/inbox/page.tsx`

`NextIntlClientProvider` is keyed by `locale` in `apps/saas/app/[locale]/layout.tsx`. The walk language toggle (`WalkLocaleToggle`) offers **EN** / **VI** only and navigates `/en/inbox` ↔ `/vi/inbox`. Cookie `NEXT_LOCALE` remembers preference for unprefixed paths such as `/inbox`. Bare `/` is a static `next.config.ts` redirect to `/en/inbox`; it runs before the proxy, so it is English by design. Cookie-only locale without a path prefix is rejected.

`packages/i18n` still lists `de`, `es`, and `fr` for the rest of the tree. SaaS routing (`routing.ts`) is limited to the operator locales `en` and `vi`, so `/de/inbox` is not routable and the settings language form offers only EN / VI. Inbox copy is `inbox.*` in `packages/i18n/translations/{en,vi}/saas.json`. Guest-facing draft language can be EN, VI, JA, KO, or RU. Operator chrome is EN + VI.

## Auth and inbox data

One database, two owners:

| Store           | Where                                                                                                        | What                                             |
| --------------- | ------------------------------------------------------------------------------------------------------------ | ------------------------------------------------ |
| Auth / sessions | Postgres via `DATABASE_URL` (local compose is PostgreSQL 16 on 5432; example database name is `supastarter`) | Better Auth users and sessions                   |
| Inbox threads   | The same Postgres, `inbox_*` tables via `@repo/database/inbox`                                               | Conversations, messages, extract, draft, Answers |

The inbox models live in `schema.prisma` next to the kit's (ADR 0012). `Conversation.officeId` and `PipeConnection.officeId` reference `Organization` with cascade delete, `Answer.operatorId` references `User` with set-null. Schema changes go through `prisma db push` in development; production baselines with `prisma migrate` before the first deploy. The store (`createInboxStore(db)`) is the only writer of these tables; routes call its methods and never touch Prisma directly. Tests run against `supastarter_test` (`packages/database/inbox/testing.ts`). Inbox types live in `packages/database/inbox/types.ts`: `Pipe`, `Conversation`, `Message`, `Qualification` (`rentOrBuy` split from move-in `timeframe`), `Draft` + crib, `Paperwork`, `OneShot`, `SendResult`, `InboxViewer`; the funnel vocabulary (`Funnel`, `ResponseTime`) is zod in `schema.ts` and `store.funnel(viewer, { since })` counts it in SQL inside the office (ADR 0002 over ADR 0011). Threads are not stored on User / Org / Plan / Subscription.

The office is the tenant (ADR 0008) and it is the kit organization; Nhịp assigns it and one operator belongs to exactly one (ADR 0010). `Conversation.officeId` is the organization id and a thread's identity is (office, pipe, guest), so the same guest at two offices is two threads; the store lists and reads strictly by office, so a thread is visible only inside its office and shared by every agent in it. `requireInboxSession` reads the operator's memberships on every request: none is 403 `no_office`, more than one is 403 `ambiguous_office`; the session's active organization is never consulted. Webhook-created threads take the office that owns the pipe the message arrived on (`PipeConnection`: pipe + vendor id of the number or OA → office, set with `pnpm --filter saas pipe:connect`); inbound on an unconnected pipe is dropped, and each message records the endpoint it travelled through (`Message.pipeExternalId`). A reply goes out on the number the guest last wrote to; with process-wide credentials, a thread on any other number is refused with 409 `pipe_not_configured`. `POST /dev/inbound` files under the signed-in operator's office. Every thread has an office from birth; there is no unowned state (ADR 0012).

Sign-up is invitation only (`enableSignup: false`, the kit's invitation-only plugin), operators cannot create organizations, and accepting a second office's invitation is refused in an auth hook. The seed creates the walk office (`walk-office`, fixed id) with `admin@nhip.local` (role `admin`) as owner and `walk@nhip.local` as member. `hideOrganization` keeps the switcher hidden; `requireOrganization` stays false because the inbox resolves the office itself.

## Inbox modules

| Path                                                       | Role                                |
| ---------------------------------------------------------- | ----------------------------------- |
| `apps/saas/modules/inbox/components/`                      | Inbox shell, list, thread, reply    |
| `apps/saas/modules/inbox/lib/extract.ts`                   | One-shot extract from inbound       |
| `apps/saas/modules/inbox/lib/draft.ts`                     | Template replies (first, follow-up) |
| `apps/saas/modules/inbox/lib/queue.ts`                     | Your turn, quiet, view order        |
| `apps/saas/modules/inbox/lib/drafts/`                      | Draft adapter: Anthropic or none    |
| `apps/saas/modules/inbox/lib/translate.ts`                 | Guest message translation (async)   |
| `apps/saas/modules/inbox/lib/runtime.ts`                   | Store + config + draft adapter      |
| `apps/saas/app/api/conversations`                          | List / detail (session required)    |
| `apps/saas/app/api/conversations/[id]/approve`             | Approve and send (session required) |
| `apps/saas/app/api/conversations/[id]/draft`               | Regenerate suggestion (never sends) |
| `apps/saas/modules/inbox/lib/require-session.ts`           | 401 / 403 gate for route handlers   |
| `apps/saas/modules/inbox/lib/office.ts`                    | Resolves the office from membership |
| `apps/saas/modules/home/lib/funnel.ts`                     | Home's read: office + store.funnel  |
| `apps/saas/modules/home/components/Home.tsx`               | Home: funnel, response time, CRM    |
| `apps/saas/modules/shared/components/WalkLocaleToggle.tsx` | EN / VI path switch                 |
| `apps/saas/modules/shared/components/UserMenu.tsx`         | Color mode + language               |

Nav: **Inbox** is the agent's job; **Home** (`/home`) is the numbers screen (ADR 0001), currently the funnel's shape with "connect your CRM" where closings and lost will be (ADR 0002); **International** stays a disabled placeholder. `/` still lands on the inbox. Account settings stays as existing chrome.

## Send

Default `SEND_MODE=mock` (`.env.local.example`). Only the exact value `live` talks to WhatsApp or Zalo (`resolveSendMode` in `runtime.ts`). Local development stays mock.

Webhook routes exist (`/webhooks/zalo`, `/webhooks/whatsapp`). `POST /dev/inbound` is local simulation only, not in the UI, and returns 404 when `NODE_ENV=production`.

Approve and send is a human action. Never auto-send. The guest still sees the agency number.

Reply-only (ADR 0006) and the Answer (ADR 0011): every send answers exactly one guest message, and the `Answer` row is that send's record from the moment the operator approves it. `POST /api/conversations/[id]/approve` takes the inbound id and the exact text; a stale target is `409 stale_target`, an empty reply `400 empty_reply`. `approveAndSend` writes the Answer in status `sending` before any vendor call (the unique index on `Answer.inboundId` refuses a concurrent approval), then calls the vendor: a `SendError` (vendor refused, or missing credentials) marks it `failed` and the operator may approve again on the same row; any other error marks it `unknown`, as does a vendor success whose record failed, and an unknown Answer is refused with `409 delivery_unknown` until a person reconciles it. The store derives `Conversation.unansweredInboundId` from the Answers, not from message order: the guest's latest message is Your turn (ADR 0004) unless an Answer in flight, sent or unknown exists for it or the agent replied from the OA app after it, so a guest message arriving mid-send stays in the queue. `sentAt` is only "last office send", not terminal. Vendor error bodies are logged server-side, not returned to the caller.

## Drafting and translation

The draft adapter (`modules/inbox/lib/drafts/`, ADR 0005) is the one seam to a model, and it is vendor-neutral: `openai-compatible` when `DRAFT_API_KEY` is set (`DRAFT_MODEL` required, `DRAFT_BASE_URL` defaults to OpenRouter, so any vendor or a local Ollama is a config change), otherwise `none`. It is a plain `fetch` to `/chat/completions` with a zod-checked response, no vendor SDK. The first reply is always the template. When a guest writes back after a send, the follow-up template goes into the reply box at once and a model draft from the whole conversation replaces it in the background; `POST /api/conversations/[id]/draft` asks for a fresh one. Guest text is framed as data in the prompt, and `drafts/guardrails.ts` drops any draft that touches paperwork or ownership so the template stands.

Every guest message is translated into `en` and `vi` at ingest (ADR 0007), through the same adapter, in the background (`background.ts` tracks jobs; tests call `settleBackgroundWork()`). Translations are stored per message per operator language (`Translation` table) and shown under the original; `GET /api/conversations?locale=` backfills whatever that locale is missing. The client polls every 10 seconds, which is how new inbounds, translations, and model drafts arrive.

Inbound webhooks fail closed. WhatsApp verifies `X-Hub-Signature-256` with `WHATSAPP_APP_SECRET`; Zalo verifies `X-ZEvent-Signature` (`sha256(appId + body + timestamp + OA secret)`) with `ZALO_OA_SECRET_KEY`. With either secret unset the route returns 403.

## Theme

`@repo/ui` `ThemeProvider` / `useTheme` wrap `@teispace/next-themes`. Layouts inject `getThemeScript()` in `<head>` and pass `noScript` so the FOUC script is not a client-rendered `<script>` (React 19). Color mode is system / light / dark.

## Hard boundaries

- No marketing, admin, billing, or org product work.
- No auto-send.
- No real guests. Invented threads only.
- Never message real guests, agents, or Hạnh.
- Never put customer data on a public Share link.
- Do not invent a new product shape or rebuild old cockpits unless asked.
