# Nhịp handoff analysis (2026-09-06)

Technical audit of `main` @ 81c4661 after PR #8. Four-layer process: gates → maps → reviews (incl. OpenReview emulation) → adversarial verification.

## Context

The handoff is `HANDOFF.md` (+ `PRODUCT.md`, `ARCHITECTURE.md`, `AGENTS.md`, `README.md`) on `origin/main` at `81c4661`. It was not in the local checkout because the local branch was the pre-squash PR #8 branch; I checked out `main` and fast-forwarded. Code on both is identical; only docs differed.

What the handoff describes: a Supastarter Next.js 16 monorepo where `apps/saas` hosts the Nhịp inbox walk on port 3010. Locale-prefixed routes (`/en/inbox`, `/vi/inbox`), Better Auth on Postgres, inbox threads in SQLite `data/nhip.db`, `SEND_MODE=mock`, hard rule "never auto-send". Four invented threads. Out of scope: marketing, admin, billing, orgs, live send, real guests.

### How the analysis was run (layered, 4 stages)

| Layer       | What                                                                                                                                                                                                                             | Who            |
| ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------- |
| 0 Gates     | `pnpm lint`, `type-check`, `format:check`, `pnpm --filter saas test` on main                                                                                                                                                     | me             |
| 1 Maps      | 3 read-only Explore agents: inbox runtime + send path; routing/auth/chrome; data layer/seed/tests/deps                                                                                                                           | Explore        |
| 2 Reviews   | OpenReview emulation (its exact system prompt, its built-in skills + repo skills, PR #8 diff, Sonnet), security red-team (attacker + future-live-operator model), Next/React correctness review against the bundled Next 16 docs | 3 fresh agents |
| 3 Verify    | One fresh adversarial verifier told to disprove the 14 verdict-driving claims, with empirical repros where side-effect-free                                                                                                      | Opus           |
| 4 Synthesis | This document                                                                                                                                                                                                                    | me             |

Gate results on main: lint clean, type-check clean (19/19 tasks), 83/83 saas unit tests pass. `format:check` fails only on untracked local files (`.cursor/`, `.claude/settings.local.json`).

### OpenReview (vercel-labs/openreview): what it is and how it was used

It is a GitHub App + Vercel Workflow + Vercel Sandbox bot. On `@openreview` in a PR comment it clones the PR branch into a sandbox, installs deps, runs a Claude Sonnet 4.6 agent (max 20 steps, 200k token cap) with bash/readFile/writeFile/reply tools and progressive skill loading from `.agents/skills/`. Deploying it for real needs a GitHub App (private key, webhook secret, install) and an AI Gateway key; those are manual steps only you can do. I ran it faithfully instead: same system prompt, same skills, same diff, same model tier, locally.

What that produced: 1 major, 6 minor, 2 nit on PR #8, all real, none blocking. What it structurally missed: every Tier A finding below. Those files predate PR #8, and a diff-scoped reviewer never opens them. Conclusion: OpenReview is worth deploying as a per-PR gate (there is no CI at all today), but it is not a substitute for a whole-tree audit.

## Verdict

The handoff is honest about scope and the walk works as described. The safety-critical invariant, "never auto-send", is the best-tested thing in the repo and holds in mock mode with two independent gates. The gaps cluster where a mid-build MVP would have stubs, but three of them sit directly on the send path and become real the day `SEND_MODE=live` is set. Fix Tier A before that day, decide Tier B now because it gets more expensive weekly, and treat Tier C as a pre-deploy checklist.

## Claims in the handoff that the code does not back

- "`ZALO_OA_SECRET_KEY`" is documented in `.env.local.example:94` and typed in `packages/database/inbox/types.ts:87` but never read. There is no Zalo signature verification.
- "Cookie `NEXT_LOCALE` can remember preference" (`ARCHITECTURE.md`) vs "`/` → `/en/inbox`" (same file, and `AGENTS.md`). Both are true statements about different paths; the root redirect in `next.config.ts:55-59` runs before `proxy.ts` (Next docs: headers → redirects → proxy) so `/` is locale-blind by design. Docs should say so in one sentence.
- "Walk chrome language is EN + VI only" is true for the toggles, not for the routes. `/de/inbox`, `/es/inbox`, `/fr/inbox` render a fully translated inbox, and `UserLanguageForm.tsx:56-59` offers all five locales inside settings.
- `ARCHITECTURE.md` says `hideOrganization` hides the org switcher. True, but org routes and `/new-organization` remain live and `enableUsersToCreateOrganizations` is on.
- The Prisma models listed under "Data" in `README.md`/`ARCHITECTURE.md` are dead code. Nothing imports them; the live schema is the hand-written DDL in `packages/database/inbox/ensure-schema.ts`.

## Findings

Severity is graded for the stated stage (mock walk) and separately for live cutover. Verdicts are from Layer 3 unless noted.

### Tier A: live-cutover blockers (inert today, exploitable the day SEND_MODE=live)

**A1. Inbox API has no authentication at any layer.** CONFIRMED, reproduced.
`apps/saas/app/api/conversations/route.ts:6`, `[id]/route.ts:8`, `[id]/approve/route.ts:8`. No `getSession`. `proxy.ts:12` matcher excludes `api`. Next route ordering puts these static segments ahead of the Hono `[[...rest]]` catch-all, so `protectedProcedure` never runs. `approve.test.ts` calls the handlers with no auth mocking and passes, which proves it. `GET /api/conversations` returns every thread with `guestId` (the WhatsApp wa_id phone number), every message body, and extracted nationality/budget/location. The UI is gated by `(authenticated)/layout.tsx:26`; the API behind it is not. Under the documented Cloudflare-tunnel walk this is on the public internet, which collides with `PRODUCT.md`'s own "never put customer data on a public Share link" the moment a real thread lands.

**A2. Zalo webhook accepts anything.** CONFIRMED.
`apps/saas/app/webhooks/zalo/route.ts:17-30` parses and ingests with no signature check. GET echoes any `?challenge=` unauthenticated. Combined with A1: two unauthenticated POSTs let an attacker choose both recipient (`guestId` → `to`, `pipes.ts:253`) and text (`replyOverride` used verbatim, `inbox.ts:92-95`) and send as the agency's OA when live.

**A3. WhatsApp signature check fails open on empty secret.** CONFIRMED.
`pipes.ts:166` `if (!appSecret) return true;` and `.env.local.example:88` ships `WHATSAPP_APP_SECRET=` empty. The GET verify handshake in `whatsapp/route.ts:14` fails closed under the same missing-env condition, so this is an oversight, not policy. A forged inbound with a fresh `timestamp` also re-opens the 24h window gate (`pipes.ts:83`, `:25-33`).

**A4. Approve is a check-then-act race; a double tap sends twice.** CONFIRMED empirically.
`inbox.ts:66` reads `sentAt`, `:98` awaits `transmit()`, `:104` writes. Verifier ran two concurrent `approveAndSend` against a real better-sqlite3 store: both returned 200, two vendor calls, two `Send` rows, texts "draft reply" and "ATTACKER TEXT". No unique index on `Send.conversationId`/`Approval.conversationId` (`ensure-schema.ts:57-67`), no compare-and-swap. The client guard in `Inbox.tsx:376,603` is UI hygiene, not protection. In mock mode the window is microseconds; against `graph.facebook.com` it is a full round trip. This is the one Tier A item that is a product bug, not only a security bug: it breaks "human approves send" by sending what the human approved twice.

### Tier B: structural decisions with a shrinking window

**B1. No tenant column on any of the 7 inbox tables.** `ensure-schema.ts`. `listConversations()` returns everything. Adding `organizationId`/`userId` to a 4-thread demo DB is an afternoon; after real data and a query layer it is a migration project. Better Auth orgs are already wired everywhere except here.

**B2. Three inconsistent schemas for the same seven tables.** Prisma (`schema.prisma:284-357`, dead, `DateTime`, PG enums, no migrations dir), hand-written SQLite DDL (live, bare `TEXT`, ISO strings), Drizzle sqlite (`drizzle/schema/sqlite.ts:236-238`, dead, unix-second integers that would misread the real file). `packages/auth/package.json:8` `migrate` runs `@better-auth/cli@latest generate --output ../database/prisma/schema.prisma`, which overwrites the whole file including the hand-written block, and `dlx …@latest` bypasses `minimumReleaseAge`.

**B3. SQLite store is single-process, single-machine.** No WAL, no `busy_timeout` (`store.ts:161`, `ensure-schema.ts:71`); `upsertInbound` (`store.ts:235-296`) is the only writer not in a transaction; message ids are `COUNT(*)+1` (`store.ts:278,372`). DOWNGRADED: not exploitable in one process (better-sqlite3 is synchronous, no `await` between COUNT and INSERT). Two writers (`pnpm seed` during `next dev`) get `SQLITE_BUSY` or a PK collision. On Vercel: `serverExternalPackages` without `outputFileTracingIncludes`, `data/` gitignored, read-only FS → EROFS on first request; `/tmp` gives a fresh empty DB per instance and re-send risk.

**On the "single-file SQLite" question you raised with the verifier:** the inbox already is SQLite; only Better Auth needs Postgres (`schema.prisma:2`, `auth.ts:37`). Recommendation: keep the split. Postgres for auth (one compose container), SQLite for the inbox. Flipping Prisma to sqlite costs six enums and the Json column and makes the eventual Postgres move a data migration. Preconditions for shipping on SQLite: one long-lived process on a real disk (not Vercel functions), plus A4 and the B3 pragmas fixed first.

### Tier C: deliberate and documented, but needs a pre-deploy checklist

- **C1.** `walk@nhip.local` / `walkthrough` is a real credential account (`seed-walk-user.ts:26-44`, `emailVerified: true`), hardcoded in `walk-user.ts:3-5`, printed by `scripts/seed.ts:46-48`. `WALK_BYPASS_AUTH` gates only `/api/walk-bypass`, not `/login` with those creds. Only created when `DATABASE_URL` is Postgres, so exposure depends on where `pnpm seed` has ever run.
- **C2.** `GET /api/walk-bypass` mints a session on a GET and rewrites `origin` to defeat Better Auth's origin check (`walk-bypass.ts:12-18`). `.env.local` and `_start_dev.sh` currently have it on. Gate `value === "1" && NODE_ENV !== "production"` is strict; no open redirect (locale is validated, target is env-controlled).
- **C3.** `POST /dev/inbound` is `NODE_ENV`-gated only; open on any tunnelled dev server. Malformed `at` → `RangeError` → 500 (`store.ts:33-35`), DOWNGRADED to dev-only.
- **C4.** `session.freshAge: 0` (`auth.ts:46`) DOWNGRADED: skips freshness on exactly `/list-sessions`, `/unlink-account`, and password-less `/delete-user`. Narrow, cheap to restore.
- **C5.** Rate limiting: claim "none" REFUTED. Better Auth 1.6.29 enables it by default in production (`create-context.mjs:169-175`, sign-in/sign-up 3 per 10s). Real caveat: storage is in-memory per instance; no `secondaryStorage` configured.
- **C6.** Open signup (`enableSignup: true`, `invitationOnlyPlugin` inert, magic-link signup on). No doc says the product should be invite-only, so this is a config choice to make, not a bug. Vendor error bodies are echoed to unauthenticated callers (`approve/route.ts:25`). No CSP or security headers anywhere; the theme inline script would need a nonce before a CSP can exist.

### Tier D: ordinary MVP bugs (PR #8 and pre-existing)

- **D1.** Post-login bounce: `redirectAfterSignIn: "/inbox"` consumed via `@shared/hooks/router` (bprogress over `next/navigation`, not next-intl) in `LoginForm.tsx:78,102,126`, `OtpForm`, `SignupForm`, `ResetPasswordForm`, `SocialSigninButton`. Result is `/inbox` → proxy → `/{locale}/inbox`: an extra hop and flash, not a break. Same for `UserMenu.tsx:28,124` raw `next/link` to `/settings/general`. `localePrefixedPath()` already exists and is used correctly by walk-bypass.
- **D2.** `Inbox.tsx` reply clobber: the effect at `:362-373` depends on the whole `selected` object, so any refetch resets unsaved edits. Today refetch only happens on mount/approve/retry, so it is latent; it bites the moment polling or TanStack Query is added. Also `refresh` has `[selectedId]` in deps so every selection change refetches the full list, and there is no request-ordering guard.
- **D3.** `Inbox.tsx` fetches in `useEffect` with hand-rolled `fetch` instead of TanStack Query, which `AGENTS.md` mandates. Pre-existing. Hydration risk on relative timestamps is masked only because SSR renders the skeleton.
- **D4.** `key={locale}` remount on `ExtractFields` (`Inbox.tsx:574`, `:203`) is ceremony: nothing it "fixes" is memoized. `document.querySelector("#inbox-reply")` fallback is dead code.
- **D5.** `locale-path.ts:49` unguarded `decodeURIComponent` on the cookie header can 500 `/api/walk-bypass` on a malformed cookie.
- **D6.** `proxy.ts` matcher terms are not segment-anchored (`/devtools`, `/apidocs` would skip locale handling). Verified with node.
- **D7.** Locale list `(en|de|es|fr|vi)` hardcoded three times in `next.config.ts` instead of derived from `@repo/i18n`.
- **D8.** `tooling/tailwind/theme.css` is shared: marketing silently inherits the hue-128 palette and `--radius` 0.5rem. No token was renamed or removed; marketing does not break, it just no longer agrees with its own olive gradient. PR #8 also touched `apps/marketing` (theme provider import) despite the handoff marking it out of scope.
- **D9.** de/es/fr `inbox.*` copy is stale relative to the en/vi rewrite (e.g. `de.inbox.mock` is still "mock").
- **D10.** IBM Plex Mono lacks the `vietnamese` subset; `vi` medium dates in `<time>` will fall back for diacritics.

### Tier E: process, tests, hygiene

- **E1.** No CI at all: no `.github/`, no branch protection (private repo on free plan), PR #9 was closed and its commit pushed straight to main, 11 stale `cursor/*` remote branches. `turbo.json` has no `lint`/`format` task; `pnpm test` reaches 4 of 21 workspaces.
- **E2.** Zero tests for: any webhook route, `verifyWhatsAppSignature` (including its fail-open branch), the concurrent approve case (`approve.test.ts:91` is sequential), the standard login redirect, the SQLite store directly, the proxy matcher.
- **E3.** Playwright: no spec authenticates; `setup` project declared with no `*.setup.ts` (inert). Port-mismatch claim REFUTED: `next start` binds 3000 and the config targets 3000. Latent: `NEXT_PUBLIC_SAAS_URL=:3010` will break `trustedOrigins` for the first spec that logs in.
- **E4.** No env validation anywhere (no t3-env/zod). `.env.local.example:18` ships a literal `BETTER_AUTH_SECRET` people will copy. Three different env-loading paths (`dotenv -c`, `dotenv -e ../../.env` in `packages/database` pointing at a file that does not exist, and hand-loading in `next.config.ts`). `turbo.json` `globalEnv: ["*"]`.
- **E5.** Dependencies: `@teispace/next-themes` is a legitimate independent package (npm maintainer `iamkrishnaa`, org since 2021, ~12k weekly downloads, v3.0.2 published today and held by `minimumReleaseAge`). Not the repo owner, not a typosquat, but a single-maintainer package in the render path of every page and not API-compatible with `next-themes` (reverting means removing the head-script wiring). Dead catalog entries: `next-themes ^0.4.6`, `uuid ^14`. `@types/better-sqlite3 ^7` vs `better-sqlite3 ^12`. Two hash-pinned third-party prompt skills from `Leonxlnx/taste-skill` committed under `.agents/skills/` (no runtime coupling).
- **E6.** Untracked junk at repo root: `_start_dev.sh`, `boot-local.sh`, `start-saas-3010.sh`, `impeccable-install.sh`, `impeccable-gitignore-block.txt`, `.cursor/`. `data/nhip.db` and `.env.local` are correctly ignored.

### Claims I refuted or narrowed (for transparency)

- "Committed failing test in `walk-user.test.ts`": wrong. The mapper read the file before I switched branches; on main the function takes a locale and 83/83 pass.
- "No rate limiting": wrong, Better Auth defaults it on in production.
- "Playwright port mismatch": wrong, `next start` is 3000.
- "`@teispace/next-themes` scope matches the repo owner": wrong, unrelated maintainer.
- "Root redirect is a bug": documented choice; docs are merely loose.
- "Message-id COUNT+1 race": not reachable in one process.
- "Open redirect via NEXT_PUBLIC_SAAS_URL": closed; env-controlled, locale validated, `getSafeRedirectPath` tested.
- "XSS via message text": none, React text nodes only. No LLM in the inbox path at all; extract/draft are regex and templates, which is the safer v1 for "do not invent Vietnamese law".

## Remediation

Remediation is being executed on branch `fix/handoff-remediation` in the order Tier A → Tier B → Tier D/C one-liners → CI/process. See the PR for the per-step diff.
