# Handoff

Read this if you are picking up Nhịp cold (any agent or LLM). Then read [PRODUCT.md](./PRODUCT.md), [ARCHITECTURE.md](./ARCHITECTURE.md), and [AGENTS.md](./AGENTS.md).

## Intention

Nhịp (pulse of the first reply) helps Hà Nội real-estate agents answer expat and luxury inbound fast. Lead in → useful first reply in the guest’s language → no promises Vietnamese law will not allow → foreigner paperwork flagged → human **Approve and send** → send on the same pipe. Guest still sees the agency number. Never auto-send. All-hours first reply, not night-only.

Not mass-market brokerage. Not a rental operator. Not Hạnh. Working name only; not a brand lock.

## In scope this walk

- Inbox triage in `apps/saas` on port 3010.
- Invented threads in `data/nhip.db`.
- `SEND_MODE=mock`.
- Locale-prefixed routes: `/en/inbox`, `/vi/inbox`. Walk chrome language is EN + VI only.
- Human approve-and-send. Extract, operator note, reply draft.
- Existing chrome: `AppWrapper`, `NavBar`, user menu. Inbox is the only working nav job. Home and International stay disabled placeholders.

## Out of scope this walk

- Marketing, docs, mail-preview, admin, billing, orgs as product features.
- Live WhatsApp / Zalo send.
- Real guests, real agents, Hạnh’s tools, or customer data on a public Share link.
- Cookie-only locale (no path prefix). That was tried and rejected. Keep `/en/inbox` and `/vi/inbox`.
- Inventing a new product shape, brand lock, or design-system lock. Inbox triage is the current surface. Tokens and primitives come from `packages/ui`.
- Rebuilding old cockpits unless someone asks.

## Repo and PR

- GitHub: `Teiger212/nhip-ma`
- Working branch: `cursor/beautify-nhip-inbox-a018`
- PR: https://github.com/Teiger212/nhip-ma/pull/8 against `main`
- Do not merge this PR. The coordinator merges after review.
- Do not open a second PR for this walk unless asked.

Tip of this branch when these docs landed is whatever `git log -1 --oneline` shows on `cursor/beautify-nhip-inbox-a018`. Recent product/UI commits on the branch include locale-prefixed inbox routes, beautify (type, olive tokens, list/detail, sticky **Approve and send** + **Edit reply**), rent/buy i18n, pointer cursors (language toggle, sidebar rail, color mode), full mobile **Nhịp** wordmark, and the React 19 theme-script fix (`@teispace/next-themes`).

## Run locally

```bash
pnpm install
cp .env.local.example .env.local
docker compose up -d postgres
pnpm --filter @repo/database generate
pnpm --filter @repo/database push
pnpm seed
pnpm --filter saas dev
```

Open http://localhost:3010/en/inbox or http://localhost:3010/vi/inbox.

Walk login: `walk@nhip.local` / `walkthrough`. Optional `WALK_BYPASS_AUTH=1` then `GET /api/walk-bypass` (local/tunnel only; 403 in production).

Gates: `pnpm format`, `pnpm lint`, `pnpm type-check`, then relevant `pnpm --filter saas test`. See [AGENTS.md](./AGENTS.md).

Do not commit untracked local junk (`walkthrough-results/`, ad-hoc Playwright inbox specs).

## Key paths

| Path                                                                     | Why                                   |
| ------------------------------------------------------------------------ | ------------------------------------- |
| `apps/saas/app/[locale]/(authenticated)/(main)/(account)/inbox/page.tsx` | Inbox route                           |
| `apps/saas/modules/inbox/components/Inbox.tsx`                           | List + detail                         |
| `apps/saas/modules/inbox/lib/`                                           | Extract, draft, seed, approve runtime |
| `apps/saas/app/api/conversations/`                                       | List, detail, approve                 |
| `packages/database/inbox/`                                               | SQLite store                          |
| `packages/i18n/translations/{en,vi}/saas.json`                           | `inbox.*` copy                        |
| `apps/saas/modules/i18n/routing.ts`                                      | `localePrefix: "always"`              |
| `apps/saas/proxy.ts`                                                     | next-intl middleware                  |
| `apps/saas/modules/shared/components/WalkLocaleToggle.tsx`               | EN / VI                               |
| `apps/saas/modules/shared/components/UserMenu.tsx`                       | Color mode + language                 |
| `packages/ui/components/color-mode-toggle.tsx`                           | System / light / dark                 |
| `packages/ui/components/sidebar.tsx`                                     | Sidebar rail (pointer, collapse only) |

## i18n rules

- SaaS routes are locale-prefixed. Cookie `NEXT_LOCALE` may remember preference. Do not ship cookie-only locale.
- Walk toggle: `en` and `vi` only (`WalkLocaleToggle`). Vietnamese is `vi`.
- User-facing strings need translations. Inbox keys stay under `inbox.*`.
- EN walk copy uses sentence case for chips (`Needs approval`, `Sent`). Crib label is **Operator note**. Rent/buy extract values are **Rent** / **Buy** in EN.

## Hard constraints

- Never send to real guests, agents, or Hạnh. Never log into her tools.
- Never put customer data on a public Share link.
- Never auto-send.
- Do not invent product shape or rebuild old cockpits unless asked.
- Do not treat Home, International, Reports, billing, or orgs as the working job.

## Recent UI on PR #8

- Beautify: Be Vietnam Pro + IBM Plex Mono, olive tokens, squircle initials, compact flags, no card chrome on extract / crib / reply, search `h-12`, desktop list locked at `22rem`.
- Sticky detail bar: **Approve and send** + **Edit reply** (scrolls/focuses `#inbox-reply`). Idle “Not sent” is `sr-only`.
- Locale prefixes restored after a rejected cookie-only revert.
- Pointer cursors on language toggle, sidebar rail, and color-mode options. No resize cursor. Mobile header shows full **Nhịp**.
- Theme FOUC script moved out of the React 19 client tree.

## Next steps / open questions

Grounded in this tree only. Not a product roadmap.

1. **PR #8 review and merge.** Coordinator merges. Do not merge from this walk. Address review comments on the same branch.
2. **Keep locale prefixes.** A cookie-only revert already landed and was rejected. Do not do that again.
3. **Walk stays mock + invented.** `SEND_MODE=live` exists in code. Do not turn it on for this walk. Do not point webhooks at real guests.
4. **Unused apps stay unused.** `apps/marketing`, `apps/docs`, admin, and org chrome are still in the monorepo. Leave them unless asked.
5. **i18n catalog vs walk toggle.** `de` / `es` / `fr` remain in `packages/i18n/config.ts`. The walk selector must stay EN + VI.
6. **No CI story to invent.** There are no GitHub Actions workflows required by this handoff. Inbox unit tests are `pnpm --filter saas test` under `apps/saas/modules/inbox`.
