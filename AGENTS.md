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

`pnpm seed` (when `DATABASE_URL` is Postgres) creates two logins with password
`walkthrough`: `walk@nhip.local`, the agent (a member of the walk office, sees Inbox and
Home), and `admin@nhip.local`, the platform admin (owner of the walk office, also sees the
kit's admin area where offices are created and agents invited). It writes four invented
threads into the walk office once: Minji and Thảo as just written (Your turn), Yuki and
Alexei three days old (Quiet). A re-run skips existing threads; `pnpm seed --reset`
rewrites them as of now, which the fresh pair needs after 48 hours. There is no auth
bypass route and public sign-up is closed (ADR 0010). Inbox stays invented threads +
`SEND_MODE=mock`.

Tests use `supastarter_test` on the same server (`TEST_DATABASE_URL` overrides it). The
vitest global setup creates it and pushes the schema; every store test truncates the inbox
tables first. A schema change that would lose data there is not accepted silently:
`dropdb supastarter_test` and run again.

This walk only needs `apps/saas` on port 3010, including its admin area (offices, pipe
connections, webhook deliveries). Do not build or ship `apps/marketing`.
The compose `postgres` service is PostgreSQL 16 on port 5432; compose also defines MinIO
for storage.

### Install and run

```bash
pnpm install
pnpm dev
```

`pnpm dev` runs the workspace dev tasks through Turbo.

### Root commands

| Command                             | Purpose                            |
| ----------------------------------- | ---------------------------------- |
| `pnpm dev`                          | Start development tasks            |
| `pnpm build`                        | Build the workspace                |
| `pnpm start`                        | Start built applications           |
| `pnpm lint` / `pnpm lint:fix`       | Check / fix Oxlint issues          |
| `pnpm format` / `pnpm format:check` | Write / check Oxfmt formatting     |
| `pnpm type-check`                   | Run workspace type checks          |
| `pnpm test`                         | Run Vitest workspace tests         |
| `pnpm seed`                         | Seed invented threads + walk login |
| `pnpm clean`                        | Clear Turbo outputs                |

Required gates:

1. After every meaningful change, run `pnpm format` and `pnpm lint`.
2. Before every commit, run `pnpm type-check`.
3. Run the relevant tests before considering the change complete.
4. CI (`.github/workflows/ci.yml`) runs lint (warnings fail), format:check, type-check, Vitest, `migrate:check`, `seed:check` and the E2E suite on every PR and push to `main`; startup env validation lives in `apps/saas/modules/shared/lib/env.ts`.

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

**Neon (staging and prod, ADR 0016).** This folder is linked to Neon project
`lingering-bonus-85587787` (`.neon`, git-ignored; `neon.ts` is the project config). Pass
`--no-env-pull` to every `neon link`, `neon deploy` and `neon checkout`, or the CLI writes the
linked branch's `DATABASE_URL` into `.env.local` and repoints dev without asking.
Neon branches: `production` (default), `staging` (schema from `prisma migrate deploy`,
never seeded: the seed's password is public), and `dev` (a schema-only copy of `staging`,
seeded with the demo logins and threads; nothing real).

**Worktree databases (decided 2026-10-03).** A worktree never builds or seeds a database of its
own. `scripts/worktree-db.sh <worktree>` gives it a copy-on-write child of Neon `dev`
(`wt-<name>`, schema and seed included), pushes the worktree's schema to it, and writes its
`DATABASE_URL` into the worktree's `.env.local`, so worktrees on different schemas never break
each other. Vitest and E2E stay on local Postgres, under the worktree's own name
(`TEST_DATABASE_URL`, `nhip_test_<name>`): they are wiped every run and CI has its own. When the
worktree goes, `scripts/worktree-db.sh <worktree> --delete` removes its branch. The main
checkout may stay on local Postgres (`supastarter`).

**What Eyal sets by hand** (accounts, secrets, vendor settings) is tracked in
[docs/setup-checklist.md](docs/setup-checklist.md); add to it whenever work needs one.

**Vercel (ADR 0016).** Project `nhip` (team `teiger212s-projects`): root `apps/saas`, build
`turbo run build --filter=saas` (runs `^generate`), Node 22, functions in `sin1`. Staging is
`main`'s deployment at `https://nhip-staging.vercel.app`, with its env vars scoped to Preview
on branch `main`. The production branch is `production`: a GitHub ruleset blocks every push
and deletion, and only the release workflow (milestone 6) moves it to a commit staging ran. Vercel
builds only `main` (staging) and `production` (Ignored Build Step); PR previews wait for a
database of their own (phase B). Never run `vercel env pull` or `vercel link` without care: they write `.env.local`.
Hosted builds run `pnpm run build:vercel` (`apps/saas/scripts/vercel-build.sh`): `prisma migrate
deploy` against `DIRECT_DATABASE_URL` (the environment's direct Neon URL), then the build; a
failed migration fails the build and the previous deployment keeps serving.
Rate limits: Better Auth's (sign-in 3/10s per IP, counters in the `rateLimit` table) and a
Firewall rule of 300 requests/min per IP on `/api/` and `/webhooks/`.

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
