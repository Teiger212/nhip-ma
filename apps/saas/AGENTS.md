<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

Repo docs (read these for Nhịp, not only the Next.js notes above):

- [AGENTS.md](../../AGENTS.md) — setup, gates, conventions
- [HANDOFF.md](../../HANDOFF.md) — cold start
- [ARCHITECTURE.md](../../ARCHITECTURE.md) — locale routes, inbox vs auth DB
- [PRODUCT.md](../../PRODUCT.md) — locked intention

The sections below are Nhịp's rules for `apps/saas`. E2E is in
[tests/AGENTS.md](./tests/AGENTS.md); the schema and migrations are in
[packages/database/AGENTS.md](../../packages/database/AGENTS.md).

## Seed data

The demo walk only needs `apps/saas` on port 3010, including its admin area (offices, pipe
connections, webhook deliveries). The four walk logins are in the root AGENTS.md
("Environment").

A database seeded before #264 has `walk@`, `walk2@` and `manager@`: the seed renames those
users in place to Linh, Đức and Hà (same ids, so threads keep their owners), so no old login
survives it. It then writes the rich dev and demo dataset (#69, `apps/saas/modules/inbox/lib/dev-seed`),
all invented: about sixty guests over the last 30 days, each one's story played through the
app's own calls at its own time (the inbound path, one-shot, alerts, auto-reply, mock CRM,
assignments, approvals, a guest deletion), with no model call and nothing sent or pushed.
The walk office (auto-reply on, as by default: the seed warns if it finds it off; mock CRM)
holds the walk's four demo threads (Minji, Yuki, Alexei, Thảo) and about forty more:
Unassigned, owned by each agent and by the manager, Your turn, Quiet, Sent, written back after
a reply, greeted, in CRM, Not in CRM yet (a recorded write failure; a guest whose number is on
two leads), Won, Lost, lost and written back, an unmatched lead, bell rows and the alert log,
and one deleted guest (receipt and lead tally).
A second office, `river-office`, has its own manager (`river-manager@nhip.local`) and agents
(`river-agent@nhip.local`, `river-agent2@nhip.local`), its auto-reply off and no CRM; nothing
crosses offices. Guests write on WhatsApp (numbers in North America's 555-01xx fiction range)
and Zalo, in Vietnamese, English, Korean, Japanese, Russian, French and Chinese, with
translations and qualifiers filled. The river office also shows the model (#302, ADR 0024), as production with the model on does:
four threads (Emma, Quang, Min-jun, Harper) have a later office reply that was a model draft,
approved and sent (a plain "Sent from Nhịp": the app labels the writer on auto-replies only), and
the guest has written back, so each holds a waiting model draft; Mai, Yuna and Rowan end on a
guest message with a "Suggested reply · AI" waiting too. Every later turn that waits holds a
model draft, never the template; first replies are typed by hand (its auto-reply stays off). The
text is committed in `lib/dev-seed/river-ai-drafts.ts`, written once by Haiku 5.5 (forced, whatever `DRAFT_MODEL`
says) through the app's draft prompt and `checkFollowUp`; `pnpm seed` calls no model. To
regenerate after a story or prompt change: `pnpm seed:drafts -- --dry-run`, then
`pnpm seed:drafts` (needs `DRAFT_API_KEY`; about $0.003, `--missing` writes only new ones; `--stub` writes the stub model's text,
never to be committed), then `pnpm seed -- --reset`. It prints every login at the end. A re-run adds nothing;
`pnpm seed -- --reset` rewrites the seed's own rows as of now, which fresh threads need after
48 hours. It refuses `VERCEL_ENV=production` and any database that is not local, unless
`SEED_REMOTE_DATABASE_HOST` names that database's host (the Neon `dev` branch; never staging or
production). Under `E2E` (the E2E run's own seed) it writes only the walk logins and the four
demo threads.

## Vitest

Tests use `supastarter_test` on the same server (`TEST_DATABASE_URL` overrides it). saas
Vitest has two projects (`apps/saas/vitest.config.ts`): `unit`, whose files run in parallel
with no database, and `db`, the `*.db.test.ts` files, which run one at a time after it. A test
file that imports `test-store` must be named `*.db.test.ts` (test-store refuses to load
elsewhere, and `unit` points both database URLs at a closed port). The `db` project's global
setup creates the database and pushes the schema, and `vitest.db-setup.ts` resets it before
every test to the fixture offices and operators alone (`resetTestDatabase`), so a test adds
the people and threads it needs and never cleans up. Shared builders are in
`apps/saas/modules/inbox/lib/test-fixtures.ts`. A schema change that would lose data there is
not accepted silently: `dropdb supastarter_test` and run again.

In a worktree, run single test files through the env, or they fall back to the shared
`supastarter_test`: from `apps/saas`, `pnpm exec dotenv -c -e ../../.env -- vitest run <file>`
(root `pnpm test` already loads it).

## Imports & path aliases

Workspace packages (`@repo/*`) are imported by package name (root AGENTS.md). Only app-local aliases are configured in the app `tsconfig.json` files. `apps/saas/tsconfig.json`:

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

App runtime configuration and aliases belong in the app's config/tsconfig, not a package.

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
  [DESIGN.md](../../DESIGN.md). Kit-origin screens still carrying restyles are listed in the
  last `.oxlintrc.json` override; when you edit one, fix it and take it off the list.
- Use React Hook Form with Zod. Follow
  `apps/marketing/modules/home/components/ContactForm.tsx`.
- Use `next-intl` `useTranslations()` in client components and the server helpers
  from `next-intl/server`. Follow `apps/saas/modules/i18n/request.ts`.
- Locale configuration and cookie name are in `packages/i18n/config.ts`.
- Document titles use `title.template` in each app root layout:
  `%s – ${config.appName}` (en dash). Set `generateMetadata` `{ title }` on
  every SaaS page. Pages without a title (marketing homepage) show
  `config.appName` alone.

## Client data fetching and cache invalidation

For client data fetching, use the oRPC helpers in
`apps/saas/modules/shared/lib/orpc-query-utils.ts` with TanStack Query.

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
