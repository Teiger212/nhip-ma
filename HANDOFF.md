# Handoff

Read this if you are picking up Nhịp cold (any agent or LLM). What the product is and
where it is going: [PRODUCT.md](./PRODUCT.md). How the repo is shaped:
[ARCHITECTURE.md](./ARCHITECTURE.md). Setup, gates, and conventions:
[AGENTS.md](./AGENTS.md). This file is only how to run it and where things are.

## Repo

- GitHub: `Teiger212/nhip-ma`. Source of truth: `main`.
- CI (`.github/workflows/ci.yml`) runs lint, format:check, type-check, and tests on every
  PR and push to `main`. Merge through PRs.
- The audit that shaped the current code is `reports/2026-09-06-handoff-analysis.md`.

## Run locally

```bash
pnpm install
cp .env.local.example .env.local
brew services start postgresql@16   # or: docker compose up -d postgres
pnpm --filter @repo/database generate
pnpm --filter @repo/database push
pnpm seed
pnpm --filter saas dev
```

Open http://localhost:3010/en/inbox or http://localhost:3010/vi/inbox. Sign in as
`walk@nhip.local` / `walkthrough` (created by `pnpm seed` when `DATABASE_URL` is
Postgres). There is no auth bypass.

`pnpm seed` writes four invented threads (Minji, Yuki, Alexei, Thảo) to `data/nhip.db`
once. Delete the file for a fresh set. `POST /dev/inbound` injects an inbound locally
(404 in production). Default `SEND_MODE=mock`; only the exact value `live` talks to a
vendor, and live needs the webhook secrets set or inbound is refused.

Gates before a commit: `pnpm format`, `pnpm lint`, `pnpm type-check`, `pnpm --filter
saas test`. Do not commit untracked local scripts or `data/`.

## Key paths

| Path                                                                     | Why                                               |
| ------------------------------------------------------------------------ | ------------------------------------------------- |
| `apps/saas/app/[locale]/(authenticated)/(main)/(account)/inbox/page.tsx` | Inbox route                                       |
| `apps/saas/modules/inbox/components/Inbox.tsx`                           | Inbox client module (renders, does not decide)    |
| `apps/saas/modules/inbox/lib/queue.ts`                                   | Queue rules: views, order, counts, next selection |
| `apps/saas/modules/inbox/lib/{extract,draft,crib}.ts`                    | One-shot: extract, guest draft, operator note     |
| `apps/saas/modules/inbox/lib/inbox.ts`                                   | Ingest and approve-and-send                       |
| `apps/saas/modules/inbox/lib/pipes/`                                     | Pipe adapters (WhatsApp, Zalo), mock/live seam    |
| `apps/saas/modules/inbox/lib/{config,runtime}.ts`                        | Validated config, runtime singleton               |
| `apps/saas/app/api/conversations/`                                       | List, detail, approve (session-gated)             |
| `apps/saas/app/webhooks/{whatsapp,zalo}/route.ts`                        | Inbound (signature-verified, fail closed)         |
| `packages/database/inbox/`                                               | SQLite store, DDL, zod vocabulary                 |
| `packages/i18n/translations/{en,vi}/saas.json`                           | `inbox.*` copy                                    |
| `apps/saas/modules/shared/lib/walk-nav.ts`                               | Sidebar rows                                      |
| `apps/saas/proxy.ts`, `apps/saas/modules/i18n/routing.ts`                | Locale routing (`en`, `vi`)                       |
| `tooling/tailwind/theme.css`                                             | Palette (Flat: blue action, amber pending)        |

## Rules that hold

- Never auto-send. Approve and send is the only send path, and it claims the message
  atomically before any vendor call.
- Never message real guests or agents from a dev or demo environment. Never put customer
  data on a public link.
- The operator note never invents Vietnamese law.
- SaaS routes are locale-prefixed (`/en/...`, `/vi/...`); cookie-only locale was tried
  and rejected. The operator language switch offers `en` and `vi` only.
- User-facing strings need translations under `inbox.*`.
- `apps/marketing`, `apps/docs`, admin, billing, and organizations are unused kit
  scaffolding. Leave them unless asked.

## Before going live

- Set `WHATSAPP_APP_SECRET`, `WHATSAPP_VERIFY_TOKEN`, `WHATSAPP_ACCESS_TOKEN`,
  `WHATSAPP_PHONE_NUMBER_ID`, `ZALO_OA_ACCESS_TOKEN`, `ZALO_OA_SECRET_KEY`. Startup
  validation refuses `SEND_MODE=live` without them.
- Set `INBOX_OWNER_USER_ID` (or another owner source) so webhook-created threads are
  scoped to an operator.
- Remove `walk@nhip.local` from any shared database.
- Auth (Better Auth 1.6): generate `BETTER_AUTH_SECRET` with `openssl rand -base64 32`;
  `NEXT_PUBLIC_SAAS_URL` must be the public https origin (it is the auth base URL and the
  only trusted origin); leave `AUTH_TRUSTED_ORIGINS` and `BETTER_AUTH_URL` unset. Rate
  limiting is on by default with a memory store, which is right for one process; behind a
  reverse proxy, set `advanced.ipAddress.ipAddressHeaders` and `trustedProxies` in
  `packages/auth/auth.ts` so limits key on the client IP. Only configure the social
  providers the office will use; unconfigured ones are not offered.
- Run on one long-lived Node process with a real disk. The inbox store is SQLite and does
  not run on serverless functions.
