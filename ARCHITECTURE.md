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
packages/database  Auth schema (Prisma/Postgres) + inbox SQLite store
```

Other `apps/*` and `packages/*` directories exist. Treat them as unused unless a change is explicitly asked for.

SaaS app aliases (`apps/saas/tsconfig.json`) include `@inbox/*` → `./modules/inbox/*`, plus `@i18n/*`, `@shared/*`, `@auth/*`, and the other module aliases.

## Locale routing

SaaS uses next-intl with `localePrefix: "always"` in `apps/saas/modules/i18n/routing.ts`. `apps/saas/proxy.ts` runs `createMiddleware` and excludes `api`, `webhooks`, `dev`, `image-proxy`, and `_next`.

Pages live under `apps/saas/app/[locale]/…`. The inbox page is:

`apps/saas/app/[locale]/(authenticated)/(main)/(account)/inbox/page.tsx`

`NextIntlClientProvider` is keyed by `locale` in `apps/saas/app/[locale]/layout.tsx`. The walk language toggle (`WalkLocaleToggle`) offers **EN** / **VI** only and navigates `/en/inbox` ↔ `/vi/inbox`. Cookie `NEXT_LOCALE` remembers preference for unprefixed paths such as `/inbox`. Bare `/` is a static `next.config.ts` redirect to `/en/inbox`; it runs before the proxy, so it is English by design. Cookie-only locale without a path prefix is rejected.

`packages/i18n` still lists `de`, `es`, and `fr` for the rest of the tree. SaaS routing (`routing.ts`) is limited to the walk locales `en` and `vi`, so `/de/inbox` is not routable and the settings language form offers only EN / VI. Inbox copy is `inbox.*` in `packages/i18n/translations/{en,vi}/saas.json`. Guest-facing draft language can be EN, VI, JA, KO, or RU. Operator chrome this walk is EN + VI.

## Auth vs inbox data

Two stores:

| Store           | Where                                                                                                        | What                                          |
| --------------- | ------------------------------------------------------------------------------------------------------------ | --------------------------------------------- |
| Auth / sessions | Postgres via `DATABASE_URL` (local compose is PostgreSQL 16 on 5432; example database name is `supastarter`) | Better Auth users and sessions                |
| Inbox threads   | SQLite `data/nhip.db` via `@repo/database/inbox`                                                             | Conversations, messages, extract, draft, send |

A Postgres `DATABASE_URL` is ignored by the inbox store unless it is a `file:` URL. Default SQLite path is `data/nhip.db` at the repo root (`packages/database/inbox/sqlite-path.ts`).

The only inbox schema is the hand-written DDL in `packages/database/inbox/ensure-schema.ts` (WAL, `busy_timeout`, additive column migrations). There are no Prisma or Drizzle inbox models; `schema.prisma` is Better Auth only. Inbox types live in `packages/database/inbox/types.ts`: `Pipe`, `Conversation`, `Message`, `Qualification` (`rentOrBuy` split from move-in `timeframe`), `Draft` + crib, `Paperwork`, `OneShot`, `SendResult`, `InboxViewer`. Threads are not stored on User / Org / Plan / Subscription.

`Conversation.ownerUserId` scopes threads to a Better Auth user. Route handlers pass the session user as the viewer; a thread with `ownerUserId = NULL` (seeded walk threads) is visible to every signed-in operator, an owned thread only to its owner. Webhook-created threads take `INBOX_OWNER_USER_ID` when set. Dropping the `IS NULL` fallback in the store makes isolation strict once every writer sets an owner.

Organizations are not required (`requireOrganization` is false). `hideOrganization` hides the org switcher.

## Inbox modules

| Path                                                       | Role                                |
| ---------------------------------------------------------- | ----------------------------------- |
| `apps/saas/modules/inbox/components/Inbox.tsx`             | List + detail UI                    |
| `apps/saas/modules/inbox/lib/extract.ts`                   | One-shot extract from inbound       |
| `apps/saas/modules/inbox/lib/draft.ts`                     | Reply + operator crib               |
| `apps/saas/modules/inbox/lib/runtime.ts`                   | Store + `SEND_MODE`                 |
| `apps/saas/app/api/conversations`                          | List / detail (session required)    |
| `apps/saas/app/api/conversations/[id]/approve`             | Approve and send (session required) |
| `apps/saas/modules/inbox/lib/require-session.ts`           | 401 gate for inbox routes           |
| `apps/saas/modules/shared/components/WalkLocaleToggle.tsx` | EN / VI path switch                 |
| `apps/saas/modules/shared/components/UserMenu.tsx`         | Color mode + language               |

Nav furniture: **Home** and **International** are disabled placeholders. **Inbox** is the only working job. Account settings stays as existing chrome.

## Send

Default `SEND_MODE=mock` (`.env.local.example`). Only the exact value `live` talks to WhatsApp or Zalo (`resolveSendMode` in `runtime.ts`). Local development stays mock.

Webhook routes exist (`/webhooks/zalo`, `/webhooks/whatsapp`). `POST /dev/inbound` is local simulation only, not in the UI, and returns 404 when `NODE_ENV=production`.

Approve and send is a human action. Never auto-send. The guest still sees the agency number.

Approve is idempotent under concurrency: `approveAndSend` claims the thread with an atomic `UPDATE … WHERE sentAt IS NULL` before any network call, releases the claim if transmit fails, and a unique index on `Send.conversationId` backstops it. Vendor error bodies are logged server-side, not returned to the caller.

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
