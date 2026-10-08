# AGENTS.md

Nhịp turns a guest's WhatsApp or Zalo message to a Vietnamese property agency into a reply in
the guest's language that a human agent approves before it is sent. These are the rules every
session needs. Product: [PRODUCT.md](./PRODUCT.md). Vocabulary: [CONTEXT.md](./CONTEXT.md),
decisions in [docs/adr](./docs/adr). Shape: [ARCHITECTURE.md](./ARCHITECTURE.md). Cold start:
[HANDOFF.md](./HANDOFF.md).

Mirror existing conventions and nearby canonical implementations.
Explicit user instructions win; if a documented command fails, report it instead of inventing a workaround.

## Area rules

A nested `AGENTS.md` loads when Claude reads a file below it, but never in a worktree-isolated
subagent: a brief into an area names its file, and the agent reads it before working there.
Where a skill disagrees with an `AGENTS.md`, the `AGENTS.md` wins.

| Touching                                                           | Read first                    |
| ------------------------------------------------------------------ | ----------------------------- |
| Schema, migrations, worktree databases, Neon                       | `packages/database/AGENTS.md` |
| `apps/saas`: seed data, Vitest, aliases, auth, Permix, UI, i18n    | `apps/saas/AGENTS.md`         |
| E2E: running Playwright, build-once, smoke                         | `apps/saas/tests/AGENTS.md`   |
| oRPC procedures, notifications                                     | `packages/api/AGENTS.md`      |
| A release, the production smoke gate, rollback, the Vercel project | skill `cutting-a-release`     |

## Stack and layout

Next.js App Router, React, TypeScript, Node.js 22+, pnpm workspaces, Turborepo, oRPC, Hono,
Better Auth, and Prisma for auth and the inbox alike (ADR 0012); Tailwind CSS, Shadcn-style
components and Base UI (`@base-ui/react`); React Hook Form, Zod 4, TanStack Query, next-intl,
Vitest, Playwright, Oxlint, and Oxfmt.

Monorepo: `apps/` (`saas`, the authenticated product; `marketing`, public site and blog; `docs`,
Fumadocs; `mail-preview`); `packages/` (`ai`, `api`, `auth`, `database`, `i18n`, `logs`, `mail`,
`notifications`, `payments`, `permissions`: Permix definitions + rule builder, `storage`, `ui`,
`utils`); `tooling/` (`scripts`, `tailwind`, `typescript`). Product work is scoped to `apps/saas`
unless asked otherwise; do not build or ship `apps/marketing`. `@repo/*` and `@repo/ui/*` are
workspace package names, not TypeScript, Vite, or Next path mappings: import package exports
(`@repo/auth`, `@repo/database`, `@repo/ui/components/button`).

## Environment

Everything runs on local Postgres: auth sessions and inbox threads share `DATABASE_URL`. In
`.env.local` set `DATABASE_URL="postgresql://postgres:postgres@localhost:5432/supastarter"`,
`NEXT_PUBLIC_SAAS_URL="http://localhost:3010"`, `BETTER_AUTH_SECRET` (32+ characters) and a
dummy `RESEND_API_KEY` so password login can import Resend.

```bash
cp .env.local.example .env.local
brew services start postgresql@16   # or: docker compose up -d postgres (hosted and CI run 18)
pnpm install
pnpm --filter @repo/database generate
pnpm --filter @repo/database push
pnpm seed
pnpm --filter saas dev
```

Port 3010 is Eyal's dev server; an agent runs its own on another port, trusting that origin:
`AUTH_TRUSTED_ORIGINS=http://localhost:3011 pnpm --filter saas exec next dev --port 3011`, then
`/en/inbox` or `/vi/inbox` (prefixes required; redirects, rejected cookie-only locale: ARCHITECTURE.md).

`pnpm seed` creates four logins, password `walkthrough`, in the walk office (Hanoi Nest Seekers,
`walk-office`, #264): agents `linh@nhip.local` (Trần Thị Linh) and `duc@nhip.local` (Phạm Minh
Đức), members who see Inbox and Home; manager `ha@nhip.local` (Lê Thu Hà, kit role `admin`: sees
every thread, reassigns); platform admin `admin@nhip.local` (owner of the walk office, also sees
the kit's admin area where offices are created and agents invited); dataset in
`apps/saas/AGENTS.md`. No auth bypass route; public sign-up is closed (ADR 0010). Inbox stays
invented threads + `SEND_MODE=mock`.

Server-only variables are unprefixed; browser-visible ones use `NEXT_PUBLIC_`. Local secrets go
in `.env.local`, which is never committed. Keep CLIs from rewriting it: pass `--no-env-pull` to
every `neon link`, `neon deploy` and `neon checkout`, and run `vercel env pull` or `vercel link`
only on purpose. What Eyal sets by hand (accounts, secrets, vendor settings) is tracked in
[docs/setup-checklist.md](docs/setup-checklist.md); add to it whenever work needs one.

## Commands and gates

`pnpm dev` (all apps through Turbo), `pnpm build`, `pnpm start`, `pnpm lint` / `pnpm lint:fix`
(Oxlint), `pnpm format` / `pnpm format:check` (Oxfmt), `pnpm type-check`, `pnpm test` (Vitest),
`pnpm seed` (dev and demo dataset), `pnpm clean` (Turbo outputs).

1. After every meaningful change, run `pnpm format` and `pnpm lint`.
2. Before every commit, run `pnpm type-check`.
3. Run the relevant tests before considering the change complete.
4. CI (`.github/workflows/ci.yml`) runs lint (warnings fail), type-check, Vitest, `migrate:check`, `seed:check`, the migration lint (PRs only) and the E2E suite on every PR and push to `main`, except a PR that changes only documentation (`**/*.md`, `docs/**`, `reports/**`). `.github/workflows/format.yml` runs format:check on every PR and push, docs included; startup env validation lives in `apps/saas/modules/shared/lib/env.ts`.

Schema changes: dev databases use `push`, staging and production only `prisma migrate deploy`;
every migration is expand/contract (it works with the code before it) and passes `migrate:lint`.
Read `packages/database/AGENTS.md` before editing `schema.prisma` or writing a migration.

## What gets a test

Lean testing (2026-10-08): tests go where a bug is expensive (money and caps, security and
redaction, data written to the database or a CRM, tenancy), mostly fast Vitest. UI and copy
changes need no new test. There is no red-first rule.

- Anything a person does (an agent or admin clicking, linking, approving, configuring) is
  tested end to end with Playwright (`apps/saas/tests`), not with unit tests: one happy-path
  scenario per demo-visible feature, not every variant. Vitest covers what has no user in it:
  verifiable utility functions, store queries, rules such as the queue and the funnel, and
  background work such as CRM refresh.
- i18n is tested smartly, not by copying an English scenario in Vietnamese to re-check labels:
  a translation-key check, and a Vietnamese assertion only where Vietnamese behaviour differs.
- Every test names what it proves: a scenario in `docs/e2e-scenarios.md`, or a rule in
  `CONTEXT.md` / an ADR. A test with no source behind it is not merged.
- A test proves intent, not the code in front of it: assert what a person sees or what the
  rule promises; never internal calls, and never mock the thing under test.
- Locally, run only the spec files you touched; never the full suite. One green CI run is the
  gate (Ticket workflow 5). Hardening (more tests, flakes, edge cases) is one later pass.

## Change management

- Use conventional commits such as `feat:`, `fix:`, `docs:`, or `refactor:`. Commits, PRs,
  issues and comments carry no Claude or AI attribution: no `Co-Authored-By: Claude`, no
  "Generated with Claude Code".
- For consumer-impacting changes, add a changelog fragment, `changelog.d/<issue>-<slug>.md`,
  holding the PR's section ([changelog.d/README.md](./changelog.d/README.md)). Never edit
  `CHANGELOG.md`: the format check fails a PR that does; CI folds fragments in on main.
- Update [PRODUCT.md](./PRODUCT.md), [ARCHITECTURE.md](./ARCHITECTURE.md), or
  [HANDOFF.md](./HANDOFF.md) when intention, shape, or walk rules change, and the `AGENTS.md`
  that owns a rule (this one or the area's) when conventions, aliases, scripts, or boundaries do.

## Ticket workflow

1. **Epic spec**: ADR → spec → tickets as sub-issues of the epic
   ([docs/agents/issue-tracker.md](docs/agents/issue-tracker.md)).
2. **One worktree per ticket**: `git worktree add -b <branch> .claude/worktrees/<name> origin/main`,
   then `scripts/worktree-db.sh <worktree-path>` from the main checkout (its own databases).
3. **Implement**, with tests where a bug would be expensive (see "What gets a test").
4. **Review** only security-sensitive changes with a fresh reviewer; the automatic security
   review runs on every commit.
5. **The PR.** One green CI run is the merge gate; there are no retries, no `--repeat-each` and
   no re-runs, and a flaky spec is fixed after merge.
6. **Before every push, merge main**: `git fetch origin`, and if `origin/main` moved,
   `git merge origin/main`, resolve any conflict, re-run the gates the conflict touched, then
   push. Changelog fragments (see "Change management") keep two PRs off `CHANGELOG.md`.

No stacked PRs: merged branches aren't deleted automatically, so a stacked PR isn't retargeted
when its base merges. Pre-MVP edge cases: explore and record them; fix only the cheap ones and
defer the rest on the issue or PR. In reports and PRs, name a scenario by what it checks ("won
or lost leaves the queue"), not by its number.

## Before you're done

- [ ] `pnpm format`, `pnpm lint` and `pnpm type-check` pass
- [ ] Relevant tests pass
- [ ] No `console.log` statements were added
- [ ] No unjustified `any` types were added
- [ ] User-facing strings have translations
- [ ] Relevant docs are updated, and the changelog entry is a fragment in `changelog.d/`
