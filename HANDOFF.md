# Handoff

Read this if you are picking up Nhịp cold (any agent or LLM). Product and direction:
[PRODUCT.md](./PRODUCT.md). Repo shape: [ARCHITECTURE.md](./ARCHITECTURE.md). Setup,
gates, and conventions: [AGENTS.md](./AGENTS.md). This file is how to run it and where
things are.

## Repo

- GitHub: `Teiger212/nhip-ma`. Source of truth: `main`. Merge through PRs; CI gates every
  PR and push to `main` (see AGENTS.md).
- The audit that shaped the current code is `reports/2026-09-06-handoff-analysis.md`.

## Run locally

Setup, the four seeded logins (`walk@nhip.local` and `walk2@nhip.local`, the agents;
`manager@nhip.local`, the office's manager; `admin@nhip.local`, the platform admin) and the
test database are in [AGENTS.md](./AGENTS.md). `POST /dev/inbound`
injects an inbound locally (404 in production). Only the exact `SEND_MODE` value `live`
talks to a vendor, and live needs the webhook secrets set or inbound is refused.

Gates before a commit: `pnpm format`, `pnpm lint`, `pnpm type-check`, `pnpm --filter
saas test`. Do not commit untracked local scripts.

## Key paths

| Path                                                                     | Why                                                        |
| ------------------------------------------------------------------------ | ---------------------------------------------------------- |
| `apps/saas/app/[locale]/(authenticated)/(main)/(account)/inbox/page.tsx` | Inbox route                                                |
| `apps/saas/modules/inbox/components/Inbox.tsx`                           | Inbox client module (renders, does not decide)             |
| `apps/saas/modules/inbox/lib/queue.ts`                                   | Queue rules: Your turn, quiet, order, counts               |
| `apps/saas/app/[locale]/(authenticated)/(main)/(account)/home/page.tsx`  | Home route                                                 |
| `apps/saas/modules/home/`                                                | Home: funnel over Answers, response time, CRM gap          |
| `apps/saas/modules/inbox/lib/{extract,draft,crib}.ts`                    | One-shot: extract, template reply, operator note           |
| `apps/saas/modules/inbox/lib/inbox.ts`                                   | Ingest, approve-and-send, regenerate draft                 |
| `apps/saas/modules/inbox/lib/drafts/`                                    | Model layer (OpenRouter, E2E stub, or none), caps, prompts |
| `apps/saas/modules/inbox/lib/{translate,background}.ts`                  | Per-message translation, background jobs                   |
| `apps/saas/modules/inbox/lib/pipes/`                                     | Pipe adapters (WhatsApp, Zalo), mock/live seam             |
| `apps/saas/modules/inbox/lib/{config,runtime}.ts`                        | Validated config, runtime singleton                        |
| `apps/saas/app/api/conversations/`                                       | List, detail, approve, draft (session-gated)               |
| `apps/saas/app/webhooks/{whatsapp,zalo}/route.ts`                        | Inbound (signature-verified, fail closed)                  |
| `packages/database/inbox/`                                               | Prisma inbox store, zod vocabulary, test helpers           |
| `packages/i18n/translations/{en,vi}/saas.json`                           | `inbox.*` copy                                             |
| `apps/saas/modules/shared/lib/walk-nav.ts`                               | Sidebar rows                                               |
| `apps/saas/proxy.ts`, `apps/saas/modules/i18n/routing.ts`                | Locale routing (`en`, `vi`)                                |
| `tooling/tailwind/theme.css`                                             | Palette (Flat: blue action, amber pending)                 |

## Rules that hold

- Never auto-send. Approve and send is the only send path. It names the guest message it
  answers and the exact text, and writes the Answer before any vendor call (ADR 0011).
  Reply-only: one Answer per inbound; a thread is "Your turn" whenever the guest's latest
  message has no Answer (ADRs 0004, 0006). The app never retries an Answer of unknown
  outcome; a person checks the vendor first.
- Home's funnel is counted from Answers inside the store (ADRs 0002, 0011); engaged means a
  `sent` Answer, and the stages, response time and the 30-day window are defined in
  CONTEXT.md. Closings and lost only
  ever come from the CRM adapter (ADR 0003); until one is connected they say so.
- Translation and AI suggested replies run through the model layer (ADRs 0005, 0007, 0024):
  OpenRouter only, zero-retention routing on every request, a model per task (`DRAFT_MODEL`,
  `TRANSLATE_MODEL`, both defaulting to Haiku 5.5), daily caps per office, 20 s and one retry.
  Without `DRAFT_API_KEY` there is no model: no translation, template drafts. A model draft
  is JSON with the reply and the same reply in the office language (#251); one that states a
  price, an availability, a viewing time or a legal answer, or a number the guest didn't write,
  is dropped by the post-check and the template stands. E2E translates
  with the stub model (`MODEL_STUB=translate` in `.env.e2e`).
- The office is the tenant (ADR 0008) and Nhịp assigns it (ADR 0010): one operator, one
  office, read from the membership table on every request, never from the session's
  active organization. Threads are one per guest per
  office, shared inside it and invisible outside it; deleting an office deletes its
  threads (ADR 0012), and an operator whose membership ends loses the account while their
  Answers keep their name (ADR 0013). Pipe mapping and the send refusal are in
  ARCHITECTURE.md.
- Never message real guests or agents from a dev or demo environment. Never put customer
  data on a public link.
- The operator note never invents Vietnamese law.
- SaaS routes are locale-prefixed (`/en/...`, `/vi/...`); cookie-only locale was tried
  and rejected. The operator language switch offers `en` and `vi` only.
- User-facing strings need translations under `inbox.*`.
- `apps/marketing`, `apps/docs` and billing are unused kit scaffolding; leave them unless
  asked. The admin area is the platform admin's (offices, pipe connections, webhooks). The kit organization is in use as the office, its switcher hidden
  while one agency is one office.

## Before going live

### Accounts to create

Better Auth is a library and needs no account. These do; start the two that require the
company entity first.

| Service                                               | Used for                                                                         | Needs the company entity                               |
| ----------------------------------------------------- | -------------------------------------------------------------------------------- | ------------------------------------------------------ |
| Meta developer app + WhatsApp Business                | inbound webhook, outbound send (`WHATSAPP_*`)                                    | Yes: Business Verification before real traffic         |
| Zalo Official Account + developer app                 | same for Zalo (`ZALO_OA_*`)                                                      | Yes: OA verification requires a registered VN business |
| The agency's own CRM access, if any (intake, #128)    | CRM adapter, closings and lost (ADR 0003)                                        | No                                                     |
| OpenRouter account                                    | model layer: translation, suggested replies (`DRAFT_*`, `TRANSLATE_*`, ADR 0024) | No; prepaid balance is the budget                      |
| Resend (or the mail provider in `.env.local.example`) | magic link and verification emails                                               | No, but a verified sending domain                      |
| Google / GitHub OAuth apps                            | only if social login stays enabled                                               | No                                                     |

The office itself (ADR 0008) is created in the admin area (sign-up is closed, ADR 0010), not with any vendor.

### Checklist

Everything to fill in or verify by hand (vendor apps, Vercel values per environment, the
PostHog privacy setting, domain and DMARC, Vietnam's data protection filing) is in
[docs/setup-checklist.md](docs/setup-checklist.md). In short:

- Pipes are connected per office in the admin area (ADR 0017); Nhịp's own vendor apps are
  env vars (`WHATSAPP_*`, `ZALO_APP_ID`, `ZALO_APP_SECRET`, `ZALO_OA_SECRET_KEY`), each pipe
  whole or not at all, and `PIPE_SECRETS_KEY` encrypts stored tokens.
- The seed's logins (`walk@nhip.local`, `admin@nhip.local`) never go near a shared
  database; the first platform admin comes from `pnpm --filter @repo/scripts create:user`.
- Auth: a fresh `BETTER_AUTH_SECRET`; `NEXT_PUBLIC_SAAS_URL` is the public https origin;
  rate-limit counters live in the database (`rateLimit`), plus the Vercel Firewall rule.
- Hosted schemas change only through `prisma migrate` (`0_init` is the baseline; see
  ARCHITECTURE.md for how staging is migrated).
