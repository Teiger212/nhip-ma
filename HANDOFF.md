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

| Path                                                                     | Why                                                |
| ------------------------------------------------------------------------ | -------------------------------------------------- |
| `apps/saas/app/[locale]/(authenticated)/(main)/(account)/inbox/page.tsx` | Inbox route                                        |
| `apps/saas/modules/inbox/components/Inbox.tsx`                           | Inbox client module (renders, does not decide)     |
| `apps/saas/modules/inbox/lib/queue.ts`                                   | Queue rules: Your turn, quiet, order, counts       |
| `apps/saas/modules/inbox/lib/{extract,draft,crib}.ts`                    | One-shot: extract, template reply, operator note   |
| `apps/saas/modules/inbox/lib/inbox.ts`                                   | Ingest, approve-and-send, regenerate draft         |
| `apps/saas/modules/inbox/lib/drafts/`                                    | Draft adapter (OpenAI-compatible or none), prompts |
| `apps/saas/modules/inbox/lib/{translate,background}.ts`                  | Per-message translation, background jobs           |
| `apps/saas/modules/inbox/lib/pipes/`                                     | Pipe adapters (WhatsApp, Zalo), mock/live seam     |
| `apps/saas/modules/inbox/lib/{config,runtime}.ts`                        | Validated config, runtime singleton                |
| `apps/saas/app/api/conversations/`                                       | List, detail, approve, draft (session-gated)       |
| `apps/saas/app/webhooks/{whatsapp,zalo}/route.ts`                        | Inbound (signature-verified, fail closed)          |
| `packages/database/inbox/`                                               | SQLite store, DDL, zod vocabulary                  |
| `packages/i18n/translations/{en,vi}/saas.json`                           | `inbox.*` copy                                     |
| `apps/saas/modules/shared/lib/walk-nav.ts`                               | Sidebar rows                                       |
| `apps/saas/proxy.ts`, `apps/saas/modules/i18n/routing.ts`                | Locale routing (`en`, `vi`)                        |
| `tooling/tailwind/theme.css`                                             | Palette (Flat: blue action, amber pending)         |

## Rules that hold

- Never auto-send. Approve and send is the only send path, and it claims the guest
  message it answers atomically before any vendor call. Reply-only: one send per inbound,
  and a thread is "Your turn" whenever the guest spoke last (ADRs 0004, 0006).
- Translation and AI follow-up drafts run behind the draft adapter (ADRs 0005, 0007).
  Without `DRAFT_API_KEY` there is no model: no translation, template drafts. A model
  draft that touches paperwork is dropped by the post-check and the template stands.
- The office is the tenant (ADR 0008). Threads are shared inside it and invisible outside
  it; there is no per-agent ownership. Webhooks file under the office that owns the pipe
  (`pnpm --filter saas pipe:connect`), and inbound on an unconnected pipe is dropped.
- Never message real guests or agents from a dev or demo environment. Never put customer
  data on a public link.
- The operator note never invents Vietnamese law.
- SaaS routes are locale-prefixed (`/en/...`, `/vi/...`); cookie-only locale was tried
  and rejected. The operator language switch offers `en` and `vi` only.
- User-facing strings need translations under `inbox.*`.
- `apps/marketing`, `apps/docs`, admin, and billing are unused kit scaffolding. Leave
  them unless asked. The kit organization is in use: it is the office, with its switcher
  hidden while one agency is one office.

## Before going live

### Accounts to create

Better Auth is a library and needs no account. These do. Two of them require the company
entity, so start those first.

| Service                                                | Used for                                                            | Needs the company entity                               |
| ------------------------------------------------------ | ------------------------------------------------------------------- | ------------------------------------------------------ |
| Meta developer app + WhatsApp Business                 | inbound webhook, outbound send (`WHATSAPP_*`)                       | Yes: Business Verification before real traffic         |
| Zalo Official Account + developer app                  | same for Zalo (`ZALO_OA_*`)                                         | Yes: OA verification requires a registered VN business |
| Attio workspace + API key                              | CRM adapter, closings and lost (ADR 0003)                           | No                                                     |
| OpenRouter account (or any OpenAI-compatible endpoint) | draft adapter: translation, follow-ups (`DRAFT_*`, ADRs 0005, 0007) | No; prepaid balance is the budget                      |
| Resend (or the mail provider in `.env.local.example`)  | magic link and verification emails                                  | No, but a verified sending domain                      |
| Google / GitHub OAuth apps                             | only if social login stays enabled                                  | No                                                     |

The office itself (ADR 0008) is created in-app, by seed or signup, not with any vendor.

### Checklist

- Set `WHATSAPP_APP_SECRET`, `WHATSAPP_VERIFY_TOKEN`, `WHATSAPP_ACCESS_TOKEN`,
  `WHATSAPP_PHONE_NUMBER_ID`, `ZALO_OA_ACCESS_TOKEN`, `ZALO_OA_SECRET_KEY`. Startup
  validation refuses `SEND_MODE=live` without them.
- Connect each pipe to its office so webhook-created threads have a tenant:
  `pnpm --filter saas pipe:connect -- --pipe whatsapp --external-id <phone_number_id>
--office <organization id>` (and the same for the Zalo OA id). Add `--adopt-unowned`
  once to give threads from before tenancy to that office.
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
