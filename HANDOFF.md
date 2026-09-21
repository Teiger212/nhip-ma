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

Open http://localhost:3010/en/inbox or http://localhost:3010/vi/inbox. Two logins, both
created by `pnpm seed` when `DATABASE_URL` is Postgres, password `walkthrough`:
`walk@nhip.local` is the agent (a member of the walk office, sees Inbox and Home) and
`admin@nhip.local` is the platform admin (owner of the walk office, also sees the kit's
admin area where offices are created and agents invited). There is no auth bypass, and
public sign-up is closed (ADR 0010).

`pnpm seed` writes four invented threads (Minji, Yuki, Alexei, Thảo) into the walk office
once. Delete that office's threads in the database for a fresh set. `POST /dev/inbound`
injects an inbound locally (404 in production). Default `SEND_MODE=mock`; only the exact
value `live` talks to a vendor, and live needs the webhook secrets set or inbound is
refused.

Tests need a second database on the same server, `supastarter_test` by default
(`TEST_DATABASE_URL` overrides it). The vitest global setup creates it and pushes the
schema; every store test truncates the inbox tables before it runs. A schema change that
would lose data there is not accepted silently: `dropdb supastarter_test` and run again.

Gates before a commit: `pnpm format`, `pnpm lint`, `pnpm type-check`, `pnpm --filter
saas test`. Do not commit untracked local scripts.

## Key paths

| Path                                                                     | Why                                                |
| ------------------------------------------------------------------------ | -------------------------------------------------- |
| `apps/saas/app/[locale]/(authenticated)/(main)/(account)/inbox/page.tsx` | Inbox route                                        |
| `apps/saas/modules/inbox/components/Inbox.tsx`                           | Inbox client module (renders, does not decide)     |
| `apps/saas/modules/inbox/lib/queue.ts`                                   | Queue rules: Your turn, quiet, order, counts       |
| `apps/saas/app/[locale]/(authenticated)/(main)/(account)/home/page.tsx`  | Home route                                         |
| `apps/saas/modules/home/`                                                | Home: funnel over Answers, response time, CRM gap  |
| `apps/saas/modules/inbox/lib/{extract,draft,crib}.ts`                    | One-shot: extract, template reply, operator note   |
| `apps/saas/modules/inbox/lib/inbox.ts`                                   | Ingest, approve-and-send, regenerate draft         |
| `apps/saas/modules/inbox/lib/drafts/`                                    | Draft adapter (OpenAI-compatible or none), prompts |
| `apps/saas/modules/inbox/lib/{translate,background}.ts`                  | Per-message translation, background jobs           |
| `apps/saas/modules/inbox/lib/pipes/`                                     | Pipe adapters (WhatsApp, Zalo), mock/live seam     |
| `apps/saas/modules/inbox/lib/{config,runtime}.ts`                        | Validated config, runtime singleton                |
| `apps/saas/app/api/conversations/`                                       | List, detail, approve, draft (session-gated)       |
| `apps/saas/app/webhooks/{whatsapp,zalo}/route.ts`                        | Inbound (signature-verified, fail closed)          |
| `packages/database/inbox/`                                               | Prisma inbox store, zod vocabulary, test helpers   |
| `packages/i18n/translations/{en,vi}/saas.json`                           | `inbox.*` copy                                     |
| `apps/saas/modules/shared/lib/walk-nav.ts`                               | Sidebar rows                                       |
| `apps/saas/proxy.ts`, `apps/saas/modules/i18n/routing.ts`                | Locale routing (`en`, `vi`)                        |
| `tooling/tailwind/theme.css`                                             | Palette (Flat: blue action, amber pending)         |

## Rules that hold

- Never auto-send. Approve and send is the only send path. It names the guest message it
  answers and the exact text, and writes the Answer before any vendor call (ADR 0011).
  Reply-only: one Answer per inbound; a thread is "Your turn" whenever the guest's latest
  message has no Answer (ADRs 0004, 0006). An Answer of unknown outcome is never retried
  by the app; a person checks the vendor first.
- Home's funnel is counted from Answers inside the store, for guests whose first message
  landed in the last 30 days: engaged is a `sent` Answer, in conversation a guest message
  after it, response time first inbound to first `sentAt` (ADRs 0002, 0011). Closings and
  lost only ever come from the CRM adapter (ADR 0003); until one is connected they say so.
- Translation and AI follow-up drafts run behind the draft adapter (ADRs 0005, 0007).
  Without `DRAFT_API_KEY` there is no model: no translation, template drafts. A model
  draft that touches paperwork is dropped by the post-check and the template stands.
- The office is the tenant (ADR 0008) and Nhịp assigns it (ADR 0010): one operator, one
  office, read from the membership table on every request, never from the session's
  active organization. Threads are one per guest per office, shared inside it and
  invisible outside it. Webhooks file under the office that owns the pipe
  (`pnpm --filter saas pipe:connect`), inbound on an unconnected pipe is dropped, and a
  reply is refused when the thread's number is not the one the credentials belong to.
  Every thread has an office from birth and the inbox tables live in the same Postgres
  as the office (ADR 0012); deleting an office deletes its threads.
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
- Set `ZALO_OA_ID` to the OA the Zalo token belongs to, so replies on any other OA are
  refused rather than sent from the wrong identity.
- Remove `walk@nhip.local` and `admin@nhip.local` from any shared database; create the
  real platform admin by setting `role = "admin"` on your own user, then create the
  office and invite agents from `/admin/organizations`.
- Auth (Better Auth 1.6): generate `BETTER_AUTH_SECRET` with `openssl rand -base64 32`;
  `NEXT_PUBLIC_SAAS_URL` must be the public https origin (it is the auth base URL and the
  only trusted origin); leave `AUTH_TRUSTED_ORIGINS` and `BETTER_AUTH_URL` unset. Rate
  limiting is on by default with a memory store, which is right for one process; behind a
  reverse proxy, set `advanced.ipAddress.ipAddressHeaders` and `trustedProxies` in
  `packages/auth/auth.ts` so limits key on the client IP. Only configure the social
  providers the office will use; unconfigured ones are not offered.
- Before the first production deploy, baseline the schema with `prisma migrate` (ADR 0012
  keeps `db push` for development only) and point `DATABASE_URL` at the production
  Postgres. The inbox and the auth tables live in the same database.
