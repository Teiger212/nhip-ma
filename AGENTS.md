# AGENTS.md

Canonical agent entry: setup, gates, aliases, and conventions.
Product intention: [PRODUCT.md](./PRODUCT.md). System shape: [ARCHITECTURE.md](./ARCHITECTURE.md). Cold start: [HANDOFF.md](./HANDOFF.md).

Mirror existing conventions and nearby canonical implementations.
Explicit user instructions win; if a documented command fails, report it instead of inventing a workaround.

## Stack

- Next.js App Router, React, TypeScript, Node.js 22+, and pnpm workspaces
- Turborepo, oRPC, Hono, Better Auth, and Prisma for auth and the inbox alike (ADR 0012)
- Tailwind CSS, Shadcn-style components, and Base UI (`@base-ui/react`)
- React Hook Form, Zod 4, TanStack Query, next-intl, Vitest, Playwright, Oxlint, and Oxfmt

## Setup & verification

### Environment

Everything runs on local Postgres: auth sessions and inbox threads share `DATABASE_URL`.
In `.env.local` set
`DATABASE_URL="postgresql://postgres:postgres@localhost:5432/supastarter"`,
`NEXT_PUBLIC_SAAS_URL="http://localhost:3010"`, `BETTER_AUTH_SECRET` (32+ characters)
and a dummy `RESEND_API_KEY` so password login can import Resend.

```bash
cp .env.local.example .env.local
brew services start postgresql@16   # or: docker compose up -d postgres (hosted and CI run 18)
pnpm install
pnpm --filter @repo/database generate
pnpm --filter @repo/database push
pnpm seed
pnpm --filter saas dev
```

Open http://localhost:3010/en/inbox or http://localhost:3010/vi/inbox. Locale prefixes
are required; the redirects and the rejected cookie-only locale are in
[ARCHITECTURE.md](./ARCHITECTURE.md), with layout and data details.

`pnpm seed` (when `DATABASE_URL` is Postgres) creates four logins with password
`walkthrough`, all in the walk office: `walk@nhip.local` and `walk2@nhip.local`, the agents
(members, see Inbox and Home); `manager@nhip.local`, the office's manager (kit role `admin`,
sees every thread and reassigns); and `admin@nhip.local`, the platform admin (owner of the
walk office, also sees the kit's admin area where offices are created and agents invited).
It writes four invented threads into the walk office once: Minji and Thảo as just written
(Your turn), Yuki and Alexei three days old (Quiet). A re-run skips existing threads; `pnpm seed --reset`
rewrites them as of now, which the fresh pair needs after 48 hours. There is no auth
bypass route and public sign-up is closed (ADR 0010). Inbox stays invented threads +
`SEND_MODE=mock`.

Tests use `supastarter_test` on the same server (`TEST_DATABASE_URL` overrides it). The
vitest global setup creates it and pushes the schema; every store test truncates the inbox
tables first. A schema change that would lose data there is not accepted silently:
`dropdb supastarter_test` and run again.

This walk only needs `apps/saas` on port 3010, including its admin area (offices, pipe
connections, webhook deliveries). Port 3010 is Eyal's dev server; an agent runs its own on
another port, trusting that origin:
`AUTH_TRUSTED_ORIGINS=http://localhost:3011 pnpm --filter saas exec next dev --port 3011`.
Do not build or ship `apps/marketing`.
The compose `postgres` service is PostgreSQL 16 on port 5432; compose also defines MinIO
for storage.

### Install and run

```bash
pnpm install
pnpm dev
```

`pnpm dev` runs the workspace dev tasks through Turbo.

### Root commands

| Command                             | Purpose                             |
| ----------------------------------- | ----------------------------------- |
| `pnpm dev`                          | Start development tasks             |
| `pnpm build`                        | Build the workspace                 |
| `pnpm start`                        | Start built applications            |
| `pnpm lint` / `pnpm lint:fix`       | Check / fix Oxlint issues           |
| `pnpm format` / `pnpm format:check` | Write / check Oxfmt formatting      |
| `pnpm type-check`                   | Run workspace type checks           |
| `pnpm test`                         | Run Vitest workspace tests          |
| `pnpm seed`                         | Seed invented threads + walk logins |
| `pnpm clean`                        | Clear Turbo outputs                 |

Required gates:

1. After every meaningful change, run `pnpm format` and `pnpm lint`.
2. Before every commit, run `pnpm type-check`.
3. Run the relevant tests before considering the change complete.
4. CI (`.github/workflows/ci.yml`) runs lint (warnings fail), type-check, Vitest, `migrate:check`, `seed:check`, the migration lint (PRs only) and the E2E suite on every PR and push to `main`, except a PR that changes only documentation (`**/*.md`, `docs/**`, `reports/**`). `.github/workflows/format.yml` runs format:check on every PR and push, docs included; startup env validation lives in `apps/saas/modules/shared/lib/env.ts`.

**What gets a test (decided 2026-09-27).** Anything a person does (an agent or admin
clicking, linking, approving, configuring) is tested end to end, not with unit tests;
the E2E tools and architecture are still to be planned, so until then such a flow gets a
written scenario in `docs/e2e-scenarios.md` instead of a unit test. Vitest covers what has
no user in it: verifiable utility functions, store queries, rules such as the queue and
the funnel, and background work such as CRM refresh. Existing tests stay until the E2E
plan replaces them.

**Done means tested (decided 2026-09-27, PRODUCT.md "Advanced MVP").** Logic has Vitest
tests. User flows have Playwright specs (`apps/saas/tests`) that CI runs on every PR on the
runner (a production build behind a local HTTPS proxy, its own Postgres 18, mock pipes); each scenario in `docs/e2e-scenarios.md` becomes a
spec. After every staging deploy a read-only Playwright smoke run checks the deployment
(`tests/smoke/`). Each release checklist includes
one real round trip from a phone over WhatsApp and Zalo.

**Test quality (decided 2026-09-27).** A test proves intent, not the code in front of it.

- Every test names what it proves: a scenario in `docs/e2e-scenarios.md`, or a rule in
  `CONTEXT.md` / an ADR. A test with no source behind it is not merged.
- Every new test is seen failing for the right reason first: against the code without the
  behaviour, or with the rule broken. A test that was never red proves nothing.
- Assert what a person sees or what the rule promises; never internal calls, and never mock
  the thing under test.
- E2E specs are written by the `test-author` agent (`.claude/agents/test-author.md`), which
  preloads `writing-e2e-tests` (this repo's conventions) and `playwright-best-practices`, and
  may not read application source; a hook enforces it.
- No retries. A new spec passes `--repeat-each=3` before merge; a flaky spec is fixed or
  deleted.
- Setup is not the flow under test. Seeded logins start signed in from sessions minted once
  per run by Better Auth's `testUtils` in a test-only auth instance
  (`apps/saas/tests/support/test-auth.ts`, run by `tests/sessions.setup.ts`); it never ships
  in the app. Sign in through the login page only where signing in is what the test proves.
  The app's rate limit stays on in E2E: each test is its own client (`clientIpHeaders` in
  `tests/support/session.ts` sets `x-forwarded-for`, which Better Auth keys the limit on).
- How E2E runs: `pnpm --filter saas exec playwright test` builds production on `:3000`
  with `.env.e2e` against its own `supastarter_e2e` database (pushed and seeded fresh),
  behind a local HTTPS proxy on `:3443` (`tests/support/https-proxy.mjs`, a throwaway
  self-signed certificate), so the app runs with an https URL and secure cookies and has no
  E2E exception. `E2E_PORT` moves both ports (HTTPS is `E2E_PORT + 443`).
  `E2E_BASE_URL=http://localhost:3010` runs against your dev server instead, for fast
  iteration.
- After every staging deploy, `.github/workflows/staging-smoke.yml` runs the read-only
  staging smoke (`pnpm --filter saas smoke`, `tests/smoke/`) against the deployment.
  The same suite gates production as a Vercel Deployment Check
  (`.github/workflows/production-smoke.yml`, #113; see "Cutting a release").

**Neon (staging and prod, ADR 0016).** This folder is linked to Neon project
`lingering-bonus-85587787` (`.neon`, git-ignored; `neon.ts` is the project config). Pass
`--no-env-pull` to every `neon link`, `neon deploy` and `neon checkout`, or the CLI writes the
linked branch's `DATABASE_URL` into `.env.local` and repoints dev without asking.
Neon branches: `production` (default), `staging` (schema from `prisma migrate deploy`,
never seeded: the seed's password is public), and `dev` (a schema-only copy of `staging`,
seeded with the demo logins and threads; nothing real). Each of staging and production gets two
login roles (#98). Migrations run as the owner, `neondb_owner`, over `DIRECT_DATABASE_URL`, with
no statement cap. The app connects through the pooler as `nhip_app` (`DATABASE_URL`), which
reads and writes rows only and carries `statement_timeout` 25s and
`idle_in_transaction_session_timeout` 30s (`packages/database/sql/app-role.sql`, run by Eyal per
docs/setup-checklist.md; until then the app still connects as `neondb_owner`). Server timeouts
never go in the app's pool config: pg sends them as startup parameters, and Neon's pooler
refuses the connection. The pool itself (`packages/database/prisma/client.ts`) gives up a
connection after 10s and is attached to Vercel's Fluid compute (`attachDatabasePool`).

**Worktree databases (decided 2026-10-03).** Each worktree has its own databases, so worktrees
on different schemas never break each other. `scripts/worktree-db.sh <worktree>` creates the dev
database `nhip_dev_<name>` on local Postgres (schema pushed, seeded) and writes it into the
worktree's `.env.local`, with `TEST_DATABASE_URL` (`nhip_test_<name>`) and `E2E_DATABASE_URL`
(`nhip_e2e_<name>`), which Vitest and Playwright create themselves. With `--neon` the dev
database is a copy-on-write child of the Neon `dev` branch (`wt-<name>`) instead, for a
remote session that cannot reach local Postgres. `--delete` drops them when the worktree goes.
Run single test files through the env, or they fall back to the shared `supastarter_test`:
from `apps/saas`, `pnpm exec dotenv -c -e ../../.env -- vitest run <file>` (root `pnpm test`
already loads it).

**Migrations (decided 2026-10-04, #95).** Dev databases are built with `db push`; staging and
production only ever run `prisma migrate deploy`. To make a dev database deploy-ready (or to bring
one forward with `migrate deploy` instead of `push`), give it a migration history once:

```bash
pnpm --filter @repo/database migrate:baseline   # marks applied the migrations its schema already has
pnpm --filter @repo/database migrate:deploy     # applies the rest
```

`migrate:baseline` replays `prisma/migrations` one by one into a throwaway database and marks
applied the longest run, from the first, whose schema equals the database's; it refuses a
database no run reproduces, and does nothing on one that already has a history. Write new
migrations with `migrate:new <name>` and read them: Prisma cannot fill a new required column on
a table that has rows, so follow the expand/contract table below (a constant default, or the
two-deploy "Make a column required" row); a plain `SET NOT NULL` fails the migration lint.
The main dev DB was baselined on 2026-10-04.

**Lint and lock timeout (#98).** CI lints the migrations a PR adds with Squawk, never applied
ones (`migrate:lint`; the rules, and why some are off, are in `packages/database/.squawk.toml`).
Lint a new one with `pnpm --filter @repo/database migrate:lint prisma/migrations/<dir>/migration.sql`.
A deliberate exception gets `-- squawk-ignore <rule>` on the line before its statement, with a
comment saying why: a new table's foreign keys (`adding-foreign-key-constraint,
constraint-missing-not-valid`, no rows to scan), or the drop in a contract deploy
(`ban-drop-column`). `migrate:deploy` and hosted builds run `scripts/migrate-deploy.sh`, which
sets `lock_timeout` 5s on the connection: a migration blocked on a lock fails the build instead
of queueing every request behind it.

**A migration that fails.** Prisma runs a migration statement by statement, not in one
transaction (verified 2026-10-04 on Prisma 7.9.1), so a failure leaves the statements before it
applied. Its failed row in `_prisma_migrations` makes every later deploy refuse (P3009) until it
is resolved, against `DIRECT_DATABASE_URL` from `packages/database`:

1. See which of its statements applied (the build log names the one that failed).
2. Either undo them and run
   `DATABASE_URL="$DIRECT_DATABASE_URL" pnpm exec prisma migrate resolve --rolled-back <name>`,
   so the next deploy runs it again; or apply the rest by hand and resolve it `--applied`.
3. Redeploy. A lock timeout on the migration's first statement applied nothing: resolve it
   `--rolled-back` and redeploy once the lock's holder is gone.

**Schema changes are expand/contract.** A deploy runs `migrate deploy` before the new code
serves, while the previous deployment still serves, so every migration must work with the code
before it ([ParallelChange](https://martinfowler.com/bliki/ParallelChange.html); Braintree's
[schema changes without downtime](https://medium.com/paypal-tech/postgresql-at-scale-database-schema-changes-without-downtime-20d3749ed680);
GitLab's [avoiding downtime in migrations](https://docs.gitlab.com/development/database/avoiding_downtime_in_migrations)).
There is no post-deploy migration step, so "after the code ships" means a second deploy.

| Change                                    | Deploys | How                                                                                                                                |
| ----------------------------------------- | ------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| New table, nullable column, index         | 1       | As is                                                                                                                              |
| New column with a constant default        | 1       | `NOT NULL DEFAULT …`: old code omits it, Postgres fills it (no rewrite)                                                            |
| New foreign key or check on existing rows | 1       | Add it `NOT VALID`, then `VALIDATE CONSTRAINT` (no write lock)                                                                     |
| Make a column required (new or existing)  | 2       | Deploy the code that writes it; then backfill, and `SET NOT NULL` (behind a validated `CHECK … IS NOT NULL`, which skips the scan) |
| Rename a column or table, change a type   | 2+      | Add the new one, write both, backfill, read the new one; drop the old one in a later deploy                                        |
| Drop a column or table                    | 2       | Stop reading and writing it; drop it in the next deploy                                                                            |

The deploys can be an hour apart. Every migration PR says which row it is; one that breaks the
code before it says why that is safe (no live writers, or an announced off-hours window) and that
Vercel's instant rollback is then unsafe (old code on the new schema). #95 is the recorded
exception: its required `officeId` columns shipped in one deploy, before any office was live.

**What Eyal sets by hand** (accounts, secrets, vendor settings) is tracked in
[docs/setup-checklist.md](docs/setup-checklist.md); add to it whenever work needs one.

**Vercel (ADR 0016).** Project `nhip` (team `teiger212s-projects`): root `apps/saas`, build
`turbo run build --filter=saas` (runs `^generate`), Node 22, functions in `sin1`. Staging is
`main`'s deployment at `https://nhip-staging.vercel.app`, with its env vars scoped to Preview
on branch `main`. The production branch is `production`: a GitHub ruleset blocks every push
and deletion, and only the release workflow moves it to a commit staging ran (see "Cutting a
release" below). Vercel builds only `main` (staging) and `production` (Ignored Build Step); PR
previews wait for a database of their own (phase B). Never run `vercel env pull` or `vercel link` without care: they write `.env.local`.
The repo is not linked; agents read the project with the Vercel CLI by passing
`VERCEL_ORG_ID=team_ADLKpom8d1SF6Gi0X4EaZxlR VERCEL_PROJECT_ID=prj_SLx3Ca2WEF7KpmpHXewJBrwe0rVG`.
Eyal changes project settings in the UI.
Hosted builds run `pnpm run build:vercel` (`apps/saas/scripts/vercel-build.sh`): `prisma migrate
deploy` against `DIRECT_DATABASE_URL` (the environment's direct Neon URL) with a 5s lock timeout,
then the build; a failed migration fails the build and the previous deployment keeps serving.
Rate limits: Better Auth's (sign-in 3/10s per IP, counters in the `rateLimit` table) and a
Firewall rule of 300 requests/min per IP on `/api/` and `/webhooks/`.

**Cutting a release (#112).** Publish a GitHub Release on a commit of `main` that staging
deployed and smoked:
`gh release create vX.Y.Z --target <sha> --generate-notes`.
Always pass `--target`: without it the tag lands on `main`'s HEAD, which may not have finished
on staging yet, and the gate refuses it. The workflow (`.github/workflows/release.yml`) runs
`scripts/release/check-release.sh` on the tag's commit. The gate requires that the commit:

- is on `main`;
- is ahead of `production`;
- has a successful `Preview` deployment;
- has a passing staging smoke run.

The workflow waits for Eyal's approval (the `release` environment's required reviewer). It
then fast-forwards `production` with the deploy key, and Vercel builds production from it.

**A production deployment reaches the domain only after its smoke check passes (#113).**
Vercel holds each production deployment off the production domain until its Deployment
Checks pass: Vercel's Lint and TypeCheck, and the GitHub check "Production smoke |
production-smoke (nhip - production)". That check is `.github/workflows/production-smoke.yml`,
which runs on Vercel's `vercel.deployment.ready` dispatch. It runs the read-only
`tests/smoke/` suite against the new deployment's own URL and writes nothing. A failing check
keeps the previous deployment on the domain and fails its run. GitHub emails nobody about
that run, since `vercel[bot]` started it: Eyal hears through the release run, which fails
with it. A production deployment outside a release (a Redeploy in Vercel) is only visible
in Actions and in Vercel. The release run waits
until the domain (`vars.PRODUCTION_URL`) serves the new deployment, comparing the `data-dpl-id`
on each page's `<html>`, and then links it in the run summary. If the smoke check fails or
never passes, the release run fails too. **Force Promote** in Vercel skips the checks: use it
only in an emergency, and say so in the release notes. A smoke run that died (cancelled, or a
runner failure) leaves the deployment held: re-run the job. To check a commit beforehand, run
`scripts/release/check-release.sh <sha>`. To go back, use Vercel's instant rollback, never an
older release: the gate refuses one.

**Rolling back after a migration (#98).** Instant rollback is safe only while the older code
still works on the new schema, which expand/contract keeps true. After a release whose
migration breaks the code before it (its PR says so, see "Schema changes are expand/contract"),
instant rollback is unsafe: the old code's writes fail on the new schema. Roll forward with a
fix, or restore the database from a Neon branch. Production's restore window is 6 hours
(`history_retention_seconds` 21600, read from the Neon API on 2026-10-04; the free plan), so a
bad migration noticed the next morning is past it. Before releasing such a migration, branch
`production` from a folder outside the repo, so a restore point outlives the window:
`neon branches create --name pre-vX.Y.Z --parent production --project-id lingering-bonus-85587787`.

`scripts/release/check-release.test.sh` checks the gate against known commits; it reads GitHub,
so it runs by hand. Notes:

- **A refused release** leaves its tag behind; remove both with
  `gh release delete vX.Y.Z --cleanup-tag`.
- **Commits from before `release.yml` merged** start no run, because GitHub runs the workflow
  from the tagged commit. The first release must target a later commit.
- **The release after an instant rollback** builds, but doesn't take the production domain
  until it's promoted in Vercel (or the rollback is undone). Its release run fails after 30
  minutes, saying the domain doesn't serve it.
- **Until `vars.PRODUCTION_URL` is set**, the release run stops once the smoke check passes,
  and warns that it didn't check the domain.
- **The first production deployment isn't held by the smoke check.** Vercel offers a GitHub
  check only after it has run once, so Eyal requires it after the first release
  (docs/setup-checklist.md); from the second release on, it holds.
- **Release one at a time:** a third release cancels the second while it waits.

The root test task runs Vitest in `apps/marketing`, `apps/saas`, and `packages/api`.
Playwright tests are in `apps/marketing/tests` and `apps/saas/tests`. E2E scripts
are per app: use `pnpm --filter marketing e2e`, `pnpm --filter marketing e2e:ci`,
`pnpm --filter saas e2e`, or `pnpm --filter saas e2e:ci`. E2E requires a running
application and database.

## Monorepo map

```text
apps/
├── docs/          # Next.js/Fumadocs documentation
├── mail-preview/  # Email preview
├── marketing/     # Public site, blog, and content
└── saas/          # Authenticated product
packages/
├── ai/
├── api/
├── auth/
├── database/
├── i18n/
├── logs/
├── mail/
├── notifications/
├── payments/
├── permissions/ # Permix definitions + rule builder
├── storage/
├── ui/
└── utils/
tooling/
├── scripts/
├── tailwind/
└── typescript/
```

## Imports & path aliases

`@repo/*` and `@repo/ui/*` are pnpm workspace package names. They are not
TypeScript, Vite, or Next path mappings. Use package exports such as
`@repo/auth`, `@repo/database`, and `@repo/ui/components/button`.

Only app-local aliases are configured in the app `tsconfig.json` files.

### `apps/saas/tsconfig.json`

| Alias              | Target                      |
| ------------------ | --------------------------- |
| `@config`          | `./config`                  |
| `@auth/*`          | `./modules/auth/*`          |
| `@organizations/*` | `./modules/organizations/*` |
| `@settings/*`      | `./modules/settings/*`      |
| `@payments/*`      | `./modules/payments/*`      |
| `@i18n/*`          | `./modules/i18n/*`          |
| `@admin/*`         | `./modules/admin/*`         |
| `@ai/*`            | `./modules/ai/*`            |
| `@onboarding/*`    | `./modules/onboarding/*`    |
| `@shared/*`        | `./modules/shared/*`        |
| `@inbox/*`         | `./modules/inbox/*`         |
| `@home/*`          | `./modules/home/*`          |

### `apps/marketing/tsconfig.json`

| Alias                 | Target                             |
| --------------------- | ---------------------------------- |
| `@config`             | `./config`                         |
| `@analytics`          | `./modules/analytics`              |
| `@home/*`             | `./modules/home/*`                 |
| `@blog/*`             | `./modules/blog/*`                 |
| `@i18n/*`             | `./modules/i18n/*`                 |
| `@changelog/*`        | `./modules/changelog/*`            |
| `@legal/*`            | `./modules/legal/*`                |
| `@shared/*`           | `./modules/shared/*`               |
| `content-collections` | `./.content-collections/generated` |

## API & data layer

oRPC modules live under `packages/api/modules`. Procedures use `publicProcedure`,
`protectedProcedure`, or `adminProcedure`, with route metadata, Zod input validation,
middleware, and a handler. Follow `packages/api/modules/organizations/procedures/`.

Keep database access in `packages/database`. Prisma owns the whole schema
(`prisma/schema.prisma`): the Better Auth tables and the `inbox_*` tables (ADR 0012). The
inbox store in `packages/database/inbox` is the only writer of the inbox tables, with zod
vocabularies for the open-ended fields. Database package scripts:

```bash
pnpm --filter @repo/database generate
pnpm --filter @repo/database push
pnpm --filter @repo/database migrate
pnpm --filter @repo/database studio
```

Change the schema in `packages/database/prisma/schema.prisma`, then run the matching
command. Do not hand-edit generated Prisma client output or
`packages/database/prisma/zod/index.ts`.

### Notifications

Create server-side notifications with `createNotification` from
`packages/notifications/src/create-notification.ts`. Types and kinds live in
`packages/notifications/src/types.ts`, and the settings catalog lives in
`packages/notifications/src/catalog.ts`; keep the database enum, catalog, and i18n labels in sync.

For client data fetching, use the oRPC helpers in
`apps/saas/modules/shared/lib/orpc-query-utils.ts` with TanStack Query.

### Client cache invalidation

After every successful mutation that affects a list or detail query (oRPC,
`authClient`, or any other write), invalidate the matching TanStack Query keys
before showing success UI. Do not rely on a full page reload.

- Prefer `queryClient.invalidateQueries({ queryKey: orpc.<module>.list.key() })`
  for oRPC lists. Prefix keys refresh every filtered/paginated page.
- For non-oRPC lists, invalidate the same key the list query uses (for example
  `organizationListQueryKey`, `userPasskeyQueryKey`, `["active-sessions"]`).
- When one mutation changes multiple cached views, invalidate every affected key
  (admin org CRUD also refreshes `organizationListQueryKey`; member leave
  refreshes both the members query and the org switcher list).
- Canonical examples: admin user delete in
  `apps/saas/modules/admin/component/users/UserList.tsx`, invitation revoke in
  `OrganizationInvitationsList.tsx`, and passkey CRUD in `PasskeysBlock.tsx`.

## Framework patterns

- Use Server Components by default; add `"use client"` only for browser APIs or interaction.
- Keep client boundaries small and keep server-only data access on the server.
- Follow the auth/layout patterns in `apps/saas/app/[locale]/(authenticated)/layout.tsx`.
  SaaS inbox routes are locale-prefixed (`/en/inbox`, `/vi/inbox`).
- Follow the oRPC procedure pattern in `packages/api/modules/organizations/procedures/`.

## Auth & multi-tenancy

- Server sessions use `getSession` from `@auth/lib/server`.
- Client session state uses `useSession` from `@auth/hooks/use-session`.
- Scope organization data with the active organization helpers under
  `apps/saas/modules/organizations`.
- When changing auth flows, update relevant templates under `packages/mail/emails`,
  preserve audit hooks, and verify locale handling.

Canonical auth examples:
`apps/saas/modules/auth/components/LoginForm.tsx` and
`apps/saas/modules/auth/lib/server.ts`.

## Permissions (Permix)

- Definitions and rule builder: `@repo/permissions` (`createPermissionRules`,
  `checkPermission`, `PermissionsDefinition`).
- oRPC: `packages/api/orpc/permix.ts` + permissions attached in
  `packages/api/orpc/procedures.ts` (user-scoped rules only — no active-org
  membership fetch). Use `permix.checkMiddleware(...)` for user-scoped gates
  like `admin.access`. For a specific organization, resolve membership and use
  `checkPermission({ user, membershipRole }, ...)`.
- SaaS server: `apps/saas/modules/shared/lib/permix.ts` (`permix/next`). Call
  `setupPermissions` once early in the authenticated layout, then
  `permix.check(...)` in server components that run after that setup. Nested
  layouts/pages may render before the parent layout finishes setup; use
  `checkPermission(...)` there (or call `setupPermissions` first when org
  context differs). Nested `setup()` replaces request rules, so re-setup only
  for a different org context, always with membership; never call
  membership-less setup in nested layouts.
- SaaS client: dehydrate in the authenticated layout into `PermixProvider` /
  `PermixHydrate`, then `useSetupClientPermissions` (hydrate alone does not set
  `isReady`). Use `usePermissions().check(...)` for active-organization UI
  (e.g. nav). For components keyed by a specific `organizationId`, use
  `checkPermission({ user, membershipRole }, ...)` with that org's membership
  — the client Permix instance tracks the active org only.
- Use `checkPermission(...)` outside React/Permix context (helpers, oRPC
  handlers) and whenever the check target is not the active org. Prefer
  `usePermissions().check(...)` / `permix.check(...)` when the request or
  client instance already reflects the correct context. Avoid
  `isOrganizationAdmin` and inline `role === "..."` in UI; keep
  `@repo/auth/lib/helper` wrappers only for backwards compatibility.
- Better Auth `organization.*` client endpoints are not covered by Permix; they
  keep Better Auth's own access control.

## UI, forms, and i18n

- Use components from `@repo/ui/components`; Base UI primitives are wrapped there.
  Compose with the `render` prop (Base UI); there is no Radix `asChild`.
- Style with the theme only; `@shadcn/lint` (in `pnpm lint`) refuses raw palette colors
  (`bg-pink-500`), arbitrary values (`p-[13px]`, `text-[10px]`), inline styles and classes
  Tailwind cannot generate. A size, shadow or width the theme lacks becomes a token or an
  `@utility` in `apps/saas/app/globals.css` (e.g. `text-2xs`, `shadow-rail`,
  `w-inbox-list`); a truly dynamic value goes through a CSS variable
  (`style={{ "--share": … }}` with `w-(--share)`). `packages/ui` (the components themselves)
  and unused kit modules are exempt.
- Don't restyle a `@repo/ui` component through `className`: `shadcn/no-restyle` allows layout
  only (plus contracts in `.oxlintrc.json`: spacing on `Card`/`CardHeader`/`CardContent`,
  shape on `Skeleton`, `pr-*` on `Input`). Use a variant or size (`Input variant="search"`,
  `Badge size="sm"`), or add one in `packages/ui` when the design calls for it; see
  [DESIGN.md](./DESIGN.md). Kit-origin screens still carrying restyles are listed in the last
  `.oxlintrc.json` override; when you edit one, fix it and take it off the list.
- Use React Hook Form with Zod. Follow
  `apps/marketing/modules/home/components/ContactForm.tsx`.
- Use `next-intl` `useTranslations()` in client components and the server helpers
  from `next-intl/server`. Follow `apps/saas/modules/i18n/request.ts`.
- Locale configuration and cookie name are in `packages/i18n/config.ts`.
- Document titles use `title.template` in each app root layout:
  `%s – ${config.appName}` (en dash). Set `generateMetadata` `{ title }` on
  every SaaS page. Pages without a title (marketing homepage) show
  `config.appName` alone.

## Config & environment variables

`BETTER_AUTH_SECRET` also keys the hash vendor message ids are stored as (#141,
`packages/database/inbox/vendor-id.ts`). Rotating it breaks duplicate detection across the
rotation: a vendor retry of a message that arrived before is filed again.

Server-only variables are unprefixed; browser-visible ones use `NEXT_PUBLIC_`. Local
secrets go in `.env.local`, which is never committed. App runtime configuration and
aliases belong in the app's config/tsconfig, not a package.

## Dependencies & supply chain

`pnpm-workspace.yaml` sets `minimumReleaseAge: 1440`, so installing a release younger
than 24 hours can fail. Use existing `catalog:` versions and add dependencies to the
workspace package that imports them.

## Change management

- Use conventional commits such as `feat:`, `fix:`, `docs:`, or `refactor:`.
- Update `CHANGELOG.md` for consumer-impacting changes.
- Update [PRODUCT.md](./PRODUCT.md), [ARCHITECTURE.md](./ARCHITECTURE.md), or
  [HANDOFF.md](./HANDOFF.md) when intention, shape, or walk rules change.
- Update `AGENTS.md` when conventions, aliases, scripts, or app boundaries change.
- Keep product work scoped to `apps/saas` unless asked otherwise.

## Ticket workflow

1. **Epic spec**: ADR → spec → tickets as sub-issues of the epic
   ([docs/agents/issue-tracker.md](docs/agents/issue-tracker.md)).
2. **One worktree per ticket**: `git worktree add -b <branch> .claude/worktrees/<name> origin/main`,
   then `scripts/worktree-db.sh` run from the main checkout with the worktree's path.
3. **Red first**: the `test-author` agent writes the E2E spec and sees it fail; no behaviour
   code before that.
4. **Implement.**
5. **Code review on two axes**: the repo's standards and the ticket's spec.
6. **New specs pass `--repeat-each=3`**, then the PR.

No stacked PRs: merged branches are not deleted automatically, so a stacked PR is not
retargeted when its base merges. Pre-MVP edge cases: explore and record them; fix only the
cheap ones and defer the rest on the issue or PR. In reports and PRs, name a scenario by what
it checks ("won or lost leaves the queue"), not by its number.

## Before you're done

- [ ] `pnpm format` passes
- [ ] `pnpm lint` passes
- [ ] `pnpm type-check` passes
- [ ] Relevant tests pass
- [ ] No `console.log` statements were added
- [ ] No unjustified `any` types were added
- [ ] User-facing strings have translations
- [ ] Relevant docs and `CHANGELOG.md` are updated

See [README.md](./README.md) for the product entry and [HANDOFF.md](./HANDOFF.md) to pick up work cold.
