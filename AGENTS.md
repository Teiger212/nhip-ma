# AGENTS.md

This file applies to the whole `supastarter-nextjs` repository.
Mirror existing conventions and prefer nearby canonical implementations.
Explicit user instructions win; if a documented command fails, report it rather than inventing a workaround.

## Stack

- Next.js App Router, React, TypeScript, Node.js 22+, and pnpm workspaces
- Turborepo, oRPC, Hono, Better Auth, Prisma, and Drizzle
- Tailwind CSS, Shadcn-style components, and Base UI (`@base-ui/react`)
- React Hook Form, Zod 4, TanStack Query, next-intl, Vitest, Playwright, Oxlint, and Oxfmt

## Setup & verification

### Environment

Copy `.env.local.example` to `.env.local`. For the **inbox walkthrough**, set
`DATABASE_URL="postgresql://postgres:postgres@localhost:5432/supastarter"` and
`NEXT_PUBLIC_SAAS_URL="http://localhost:3010"`. Set `BETTER_AUTH_SECRET` (32+
characters) and a dummy `RESEND_API_KEY` so kit auth can import Resend. Kit
login (Better Auth / Prisma) needs local Postgres. Inbox threads stay in
repo-root SQLite `data/nhip.db` — a postgres `DATABASE_URL` is ignored by the
inbox store.

```bash
docker compose up -d postgres
pnpm install
pnpm --filter @repo/database generate
pnpm --filter @repo/database push
pnpm seed
pnpm --filter saas dev
```

Open http://localhost:3010 — `/` redirects to `/inbox`. Unauthenticated visits
go to kit login, then Inbox (`redirectAfterSignIn` is `/inbox`). Kit login
stays on. For a local or Cloudflare quick-tunnel walk on the operator’s
machine only, you may set `WALK_BYPASS_AUTH=1` in `.env.local` (commented
out in `.env.local.example`; off by default). Never enable it in
production, a leave-behind, or a public deploy — the route also 403s when
`NODE_ENV=production`. That flag is not “no login”: unsigned Inbox visits
hit `GET /api/walk-bypass`, which signs in the invented
`walk@nhip.local` / `walkthrough` demo session and redirects to
`NEXT_PUBLIC_SAAS_URL` + `/inbox` (not the tunneled localhost request
URL). For a tunnel share, point `NEXT_PUBLIC_SAAS_URL` at that run’s
`https://*.trycloudflare.com` origin on the operator machine; do not
commit the tunnel URL. Inbox stays invented threads + mock send.
`apps/saas/next.config.ts` keeps `allowedDevOrigins: ["*.trycloudflare.com"]`
so tunnel JS (`/_next/*`) is not blocked. `pnpm seed` writes four invented
threads (Minji, Yuki, Alexei, Thảo) into `data/nhip.db` and an idempotent walk user
`walk@nhip.local` / `walkthrough` (onboarding already complete; orgs are not
required; kit `hideOrganization` hides the org switcher). Re-run skips
existing thread IDs and the existing walk user. Delete `data/nhip.db` for a
fresh thread set. Nothing is a real guest. Inbox copy is `inbox.*` in
`packages/i18n/translations/{en,vi}/saas.json`. Inbox lives under the
authenticated account route
`apps/saas/app/(authenticated)/(main)/(account)/inbox/page.tsx` and uses kit
`AppWrapper` / `NavBar` composed from `@repo/ui` Sidebar primitives (mobile
sheet, desktop icon-collapse). Language is
the kit `LocaleSwitch` in the nav footer and mobile Sheet (`NEXT_LOCALE`);
Vietnamese is `vi`. Below Tailwind `md`, the list and selected thread are
exclusive; Language also stays in inbox list/detail chrome. Approve and send
pins to the detail bar. Desktop two-pane is unchanged.

`pnpm dev` still runs the workspace Turbo tasks. This walk only needs `apps/saas`
on port 3010. Do not build or ship marketing or admin this walk.

The `postgres` service is PostgreSQL 16 on port 5432. The compose file also defines
MinIO (`minio` and `minio-setup`) for S3-compatible storage when storage features are used.

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

Keep database access in `packages/database`. Prisma owns the schema and migrations;
Drizzle is used for query implementations. The database package scripts are:

```bash
pnpm --filter @repo/database generate
pnpm --filter @repo/database push
pnpm --filter @repo/database migrate
pnpm --filter @repo/database studio
```

Edit `packages/database/prisma/schema.prisma` for Prisma schema changes, then use
the appropriate database command. Do not hand-edit generated Prisma client output
or `packages/database/prisma/zod/index.ts`.

### Notifications

Create server-side notifications with `createNotification` from
`packages/notifications/src/create-notification.ts`. Types and kinds live in
`packages/notifications/src/types.ts`, and the settings catalog lives in
`packages/notifications/src/catalog.ts`; keep the database enum, catalog, and i18n labels in sync.

For client data fetching, use the oRPC helpers in
`apps/saas/modules/shared/lib/orpc-query-utils.ts` with TanStack Query.

### Client cache invalidation

After every successful mutation that affects a list or detail query—whether
oRPC, `authClient`, or any other write—invalidate the matching TanStack Query
keys before showing success UI. Do not rely on a full page reload.

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
- Follow the auth/layout patterns in `apps/saas/app/(authenticated)/layout.tsx`.
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
  layouts/pages may render before the parent layout finishes setup — use
  `checkPermission(...)` there (or call `setupPermissions` first when org
  context differs). Nested `setup()` replaces request rules — only re-setup
  when checking a different org context, and always pass membership; do not
  call membership-less setup in nested layouts.
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

Keep server-only variables unprefixed. Browser-visible variables use `NEXT_PUBLIC_`.
Use `.env.local` for local secrets and never commit it. App runtime configuration
and aliases belong in the relevant app config/tsconfig rather than a package.

## Dependencies & supply chain

`pnpm-workspace.yaml` sets `minimumReleaseAge: 1440`; installing a release younger
than 24 hours can fail. Use existing `catalog:` versions where available and add
dependencies to the workspace package that imports them.

## Change management

- Use conventional commits such as `feat:`, `fix:`, `docs:`, or `refactor:`.
- Update `CHANGELOG.md` for consumer-impacting changes.
- Update relevant docs under `apps/marketing/content` for user-facing behavior.
- Update `AGENTS.md` when conventions, aliases, scripts, or app boundaries change.
- Supastarter ships three starter kits. Keep changes generic and consider whether
  an equivalent update belongs in the Nuxt or TanStack Start kit.

## Before you're done

- [ ] `pnpm format` passes
- [ ] `pnpm lint` passes
- [ ] `pnpm type-check` passes
- [ ] Relevant tests pass
- [ ] No `console.log` statements were added
- [ ] No unjustified `any` types were added
- [ ] User-facing strings have translations
- [ ] Relevant docs and `CHANGELOG.md` are updated

More documentation: https://supastarter.dev/docs/nextjs
