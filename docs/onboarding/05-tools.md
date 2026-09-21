# Tooling choices and why: the kit, the seams, and what each one costs

_Part of the [onboarding walkthrough](./README.md)._

Nhịp is built on the supastarter Next.js kit and the rule is "kit first": auth, organizations, invitations, admin, the oRPC/Hono API and the Prisma/Postgres database all come from the kit, and Nhịp's own code is a thin product layer over them. Better Auth runs invitation-only signup (enableSignup false plus the kit's invitation-only plugin) with a one-office-per-operator hook, an explicit baseURL and single trusted origin from NEXT_PUBLIC_SAAS_URL, and Better Auth's default in-memory rate limiting. The kit's oRPC procedures behind a Hono catch-all serve the kit's own modules (users, organizations, admin, notifications, payments, AI), while the inbox deliberately uses plain Next route handlers under /api/conversations, /webhooks and /dev, each gated by requireInboxSession, because those routes need raw bodies, vendor signatures, force-dynamic behaviour and a session gate that resolves the office from the membership table rather than the session. Since ADR 0012 the inbox tables live in the same Prisma 7 schema as the kit's auth tables, generated with the prisma-client generator and driven through adapter-pg; db push is the development path and a migrate baseline is a go-live step. next-intl with localePrefix always gives /en and /vi routes; the UI is Tailwind 4 plus Base UI wrapped in shadcn-style components in packages/ui; TanStack Query plus a 10 second poll holds server data and nuqs holds the view and search in the URL; zod 4 is the single vocabulary where each schema is both the validator and the type; pnpm 11 workspaces with a catalog and a 24 hour minimumReleaseAge, Turborepo, oxlint and oxfmt, TypeScript 7, vitest 4 against a real supastarter_test Postgres, and a GitHub Actions job with a postgres:16 service running lint, format check, type check, tests and a seed-loads smoke. The vendor pipes are WhatsApp Cloud API and Zalo OA, behind one PipeAdapter per pipe, and SEND_MODE is the mock/live seam: only the exact string "live" ever calls a vendor.

## The supastarter kit and the "kit first" policy

The repo's root `package.json` is still named `supastarter-nextjs`: Nhịp is a product layer on the supastarter Next.js kit, not a from-scratch app. The kit brought the monorepo (`apps/*`, `packages/*`, `tooling/*`), Better Auth with its organization/admin/invitation plugins, the oRPC-over-Hono API in `packages/api`, Prisma in `packages/database`, `packages/ui`, `packages/i18n`, mail, payments, storage, notifications and Permix permissions.

**Kit first** means: when Nhịp needs an admin, org, invitation or auth flow, it uses the kit's, and only adds a hook or a config flag. Concrete evidence:

- The office is the kit `Organization` (ADR 0008). Agents join through the kit's `organization` plugin invitation; the platform admin creates offices in the kit's `/admin/organizations` screen, which `apps/saas/modules/shared/lib/walk-nav.ts` only lists for `user.role === "admin"`.
- Nhịp's auth changes are config (`packages/auth/config.ts`: `enableSignup: false`, `hideOrganization: true`, `enableUsersToCreateOrganizations: false`, `requireOrganization: false`) plus one `before` hook in `packages/auth/auth.ts`, not a custom signup screen.
- The seed (`apps/saas/modules/inbox/scripts/seed-walk-user.ts`, `seed-walk-office.ts`) uses the kit's `createUser`, `createUserAccount`, `hashPassword` and `ensureOrganizationMembership` queries, and `tooling/scripts/src/create-user.ts` is the kit's own script.

What is _not_ used but left in the tree: `apps/marketing`, `apps/docs`, `apps/mail-preview`, billing, payments, storage. ARCHITECTURE.md calls them "kit scaffolding, out of scope". The one subtree that was actively removed was Drizzle (PR #13, commit `ba3766a`): nothing imported it, and it carried a third copy of the inbox vocabulary that competed with the zod enums, so it was misleading rather than merely unused.

Why this over building lean: one developer, a pilot product, and the boring parts (sessions, passkeys, 2FA, invitations, admin lists, i18n plumbing) are exactly where a custom implementation costs weeks and creates security holes. What it costs: a large tree you have to know how to ignore, kit-shaped naming (`supastarter` database name, `Organization` meaning office), and version-bump churn from the kit's CHANGELOG cadence.

Sources: `package.json`, `packages/auth/config.ts`, `packages/auth/auth.ts:151-166`, `apps/saas/modules/shared/lib/walk-nav.ts`, `apps/saas/modules/inbox/scripts/seed-walk-user.ts`, `apps/saas/modules/inbox/scripts/seed-walk-office.ts`, `ARCHITECTURE.md:315-326`, `docs/adr/0010-office-assignment.md`

## Better Auth: invitation-only, one office, trusted origin, rate limiting

`packages/auth/auth.ts` is the kit's `betterAuth(...)` call with Nhịp's hardening (commit `06ea3c1`, "harden Better Auth config per the 1.6 best-practices skill"). Version is pinned exactly: `better-auth: 1.6.29` in the catalog.

**Invitation-only signup.** `config.enableSignup` is `false` (ADR 0010: "an account exists because Nhịp invited it into an office"). The kit's `invitationOnlyPlugin` (`packages/auth/plugins/invitation-only/index.ts`) hooks `/sign-up/email` and throws `INVALID_INVITATION` unless `getPendingInvitationByEmail(email)` finds one. Because the invitation already proves the email, `emailAndPassword.autoSignIn` is `!config.enableSignup` and `requireEmailVerification` is `config.enableSignup`, so invited users are signed in directly. Note `magicLink({ disableSignUp: false })` is still the kit default.

**One-office hook.** The `hooks.before` middleware in `auth.ts` refuses `/organization/accept-invitation` with `ONE_OFFICE_PER_OPERATOR` when `getOrganizationMembershipsForUser(userId).length > 0`. The comment says why it is here and not only in the inbox gate: "refusing here keeps the membership table true". The inbox gate (`apps/saas/modules/inbox/lib/office.ts`) would return `403 ambiguous_office` anyway.

**Base URL and trusted origin.** `baseURL` is set explicitly from `NEXT_PUBLIC_SAAS_URL` and `trustedOrigins` is `[appUrl, ...AUTH_TRUSTED_ORIGINS]`. Startup validation in `apps/saas/modules/inbox/lib/config.ts` requires `NEXT_PUBLIC_SAAS_URL` to be an absolute http(s) URL, https in production, refuses a `BETTER_AUTH_URL` that differs (the explicit `baseURL` silently wins, so a mismatch is a trap), and refuses `AUTH_TRUSTED_ORIGINS` in production (it is a Cloudflare tunnel convenience). `BETTER_AUTH_SECRET` must be 32+ chars and not the `.env.local.example` literal.

**Rate limiting.** Nothing in code configures it; the comment documents Better Auth's defaults (enabled in production, memory store, 100 requests per 10 s, sign-in 3 per 10 s) and says the memory store is correct for one long-lived process. HANDOFF's go-live list says to set `advanced.ipAddress.ipAddressHeaders` and `trustedProxies` behind a reverse proxy.

Other kit pieces kept: `prismaAdapter(db, { provider: "postgresql" })`, `generateId: false` (Prisma's `cuid()` generates ids), 30-day sessions, social providers registered only when both halves of the credential exist (`socialProvider()` helper), plugins `admin`, `passkey`, `magicLink`, `organization`, `openAPI`, `twoFactor`.

Sources: `packages/auth/auth.ts`, `packages/auth/config.ts`, `packages/auth/plugins/invitation-only/index.ts`, `apps/saas/modules/inbox/lib/config.ts:89-153`, `apps/saas/modules/inbox/lib/office.ts`, `HANDOFF.md:545-551`, `docs/adr/0010-office-assignment.md`

## oRPC and Hono: where they run, where the inbox bypasses them and why

**The kit's API path.** `packages/api/index.ts` builds one Hono app with `.basePath("/api")`: Hono logger, CORS pinned to `NEXT_PUBLIC_SAAS_URL`, `/auth/**` handed to `auth.handler`, `/webhooks/payments`, `/health`, and then a `use("*")` that routes `/api/rpc/*` to oRPC's `RPCHandler` and everything else to `OpenAPIHandler` (with `SmartCoercionPlugin` and an OpenAPI reference at `/api/docs` that merges Better Auth's generated schema). Next mounts it once: `apps/saas/app/api/[[...rest]]/route.ts` is `handle(app)` from `hono/vercel` exported for every method. That is the only Hono import in the app.

oRPC procedures live in `packages/api/modules/*` and use `publicProcedure`, `protectedProcedure` (calls `auth.api.getSession`, throws `ORPCError("UNAUTHORIZED")`, sets Permix rules with the user only) or `adminProcedure` (`permix.checkMiddleware("admin.access")`). The router has six modules: admin, organizations, users, payments, ai, notifications. There is **no inbox router**. The client is `createORPCClient(new RPCLink({ url: window.location.origin + "/api/rpc" }))` in `apps/saas/modules/shared/lib/orpc-client.ts`, wrapped by `createTanstackQueryUtils` in `orpc-query-utils.ts`.

**Where the inbox bypasses it.** `apps/saas/app/api/conversations/route.ts`, `[id]/route.ts`, `[id]/approve/route.ts`, `[id]/draft/route.ts`, `apps/saas/app/webhooks/{whatsapp,zalo}/route.ts` and `apps/saas/app/dev/inbound/route.ts` are plain Next route handlers with `export const dynamic = "force-dynamic"`. Next's static segments match before the `[[...rest]]` catch-all, so Hono never sees them. This was found the hard way: the 2026-09-06 handoff audit (`reports/2026-09-06-handoff-analysis.md:48`) showed those routes were unauthenticated because "they sit outside the (authenticated) layout and oRPC, so nothing gated them before". The fix (commit `fb173be`) added `requireInboxSession` rather than moving them into oRPC.

Why keep them plain: webhooks need the raw body for HMAC verification (`request.text()` in `pipes/webhook.ts`) and vendor-specific headers; Meta's GET handshake returns plain text; the approve route maps domain results to specific HTTP codes (`409 stale_target`, `400 empty_reply`, `502 send_failed`, `409 delivery_unknown`); and the session gate must resolve the office from the membership table, not the session's active organization (ADR 0010), which is a different context shape from `protectedProcedure`. The cost is a second auth gate to maintain (`require-session.ts`, with its own test) and no generated client types: `inbox-queries.ts` uses hand-written `fetch` calls and a local `InboxApiError`.

Sources: `packages/api/index.ts`, `packages/api/orpc/handler.ts`, `packages/api/orpc/procedures.ts`, `packages/api/orpc/router.ts`, `apps/saas/app/api/[[...rest]]/route.ts`, `apps/saas/modules/inbox/lib/require-session.ts`, `apps/saas/app/api/conversations/[id]/approve/route.ts`, `apps/saas/modules/inbox/lib/pipes/webhook.ts`, `reports/2026-09-06-handoff-analysis.md:48`

## Prisma 7: prisma-client generator, adapter-pg, db push vs migrate, one database

`packages/database/prisma/schema.prisma` opens with `datasource db { provider = "postgresql" }` (no URL: Prisma 7 reads it from `prisma.config.ts`, which calls `env("DATABASE_URL")`) and two generators: `prisma-client` with `output = "./generated"` and `engineType = "client"`, and `prisma-zod-generator` writing pure model schemas to `prisma/zod/index.ts` (ignored by oxlint and oxfmt, never hand-edited). `prisma-client` is the ESM-first generator that emits into the repo instead of `node_modules/.prisma`, which is what a pnpm monorepo needs; `engineType = "client"` means no Rust query engine binary, so the client needs a driver adapter: `packages/database/prisma/client.ts` does `new PrismaClient({ adapter: new PrismaPg({ connectionString }) })` and exposes `db` as a lazy Proxy singleton on `globalThis` so hot reload does not open a connection per module load. `next.config.ts` adds `@prisma/nextjs-monorepo-workaround-plugin` on the server build and ignores `pg-native`.

**One schema, two owners.** The kit's Better Auth models (`user`, `session`, `account`, `organization`, `member`, `invitation`, ...) and the inbox models (`inbox_conversation`, `inbox_message`, `inbox_translation`, `inbox_qualification`, `inbox_draft`, `inbox_paperwork`, `inbox_answer`, `inbox_pipe_connection`) share it since ADR 0012 (2026-09-20). Before that the inbox was a hand-written SQLite file; the ADR lists the three costs that forced the move: no relations across the line (an office row could not cascade to its threads), two schema tools, and one-process-one-disk. Now `Conversation.officeId` and `PipeConnection.officeId` reference `Organization` with `onDelete: Cascade`, `Answer.operatorId` references `User` with `SetNull`, the unique key is `(officeId, pipe, guestId)`, `Message` and `Answer` keep an autoincrement `seq` for order, closed vocabularies are Prisma enums and open ones stay strings checked by zod. `createInboxStore(db)` in `packages/database/inbox/store.ts` is the only writer; `beginAnswer` is one `$transaction` and a concurrent approval is caught as `P2002` (duck-typed, no error class import); `funnel` is one `$queryRaw` CTE per office.

**db push vs migrate.** Scripts are `generate`, `push`, `migrate`, `studio` in `packages/database/package.json`. Development uses `prisma db push` (the kit convention, no migration files in the tree); ADR 0012 and HANDOFF make a `prisma migrate` baseline a go-live checklist step. The vitest global setup runs the plain `db push` against the test database and refuses data-losing changes silently: `dropdb supastarter_test` and rerun. Better Auth schema changes go through `packages/auth` `migrate`, which pins `@better-auth/cli@1.6.29` and writes `better-auth.generated.prisma` to diff by hand rather than overwriting `schema.prisma` (commit `ca051cc`).

Cost: no migration history yet, the `seq` columns exist only for ordering, and tests need a live Postgres.

Sources: `packages/database/prisma/schema.prisma:1-15`, `packages/database/prisma.config.ts`, `packages/database/prisma/client.ts`, `packages/database/package.json`, `packages/database/inbox/store.ts:204-217`, `packages/database/inbox/store.ts:362-420`, `packages/database/inbox/store.ts:513-560`, `docs/adr/0012-inbox-on-prisma.md`, `apps/saas/vitest.global-setup.ts`, `apps/saas/next.config.ts`

## next-intl and locale-prefixed routes

`apps/saas/modules/i18n/routing.ts` calls `defineRouting` with `locales: walkLocales` (`["en", "vi"]` from `apps/saas/modules/shared/lib/walk-locales.ts`), `localePrefix: "always"`, the kit's `NEXT_LOCALE` cookie name, and `localeDetection` on because there are two locales. `createNavigation(routing)` gives `LocaleLink`, `localeRedirect`, `useLocalePathname`, `useLocaleRouter`, `getPathname`. `apps/saas/proxy.ts` (Next 16's name for middleware) runs `createMiddleware(routing)` with a matcher that excludes `api`, `webhooks`, `dev`, `image-proxy`, `_next`, `_vercel` and any path with a dot; the comment explains the regex must be a literal in that file because Next parses it statically, and it is mirrored in `modules/i18n/lib/proxy-matcher.ts` with a test. `next.config.ts` wraps everything in `nextIntlPlugin("./modules/i18n/request.ts")`, where `getRequestConfig` falls back to the default locale when the requested one is not in `routing.locales`, and adds a static redirect `/` to `/en/inbox` that runs before the proxy (so `/` is English by design).

Pages live under `apps/saas/app/[locale]/…`; `NextIntlClientProvider` is keyed by `locale` in `[locale]/layout.tsx`. Copy is in `packages/i18n/translations/{en,vi}/saas.json` under `inbox.*`; `packages/i18n/config.ts` still lists `de`, `es`, `fr` for the rest of the kit tree, so the operator-locale restriction is enforced at the SaaS routing layer, not by deleting kit locales.

Why locale prefixes over a cookie: CHANGELOG 2026-09-06 and HANDOFF record that cookie-only locale was tried and rejected; a prefix makes `/vi/inbox` a shareable, testable, cache-safe URL and the Playwright spec (`apps/saas/tests/inbox.spec.ts`) asserts `/vi/inbox` redirects to `/vi/login`. Why next-intl at all: it is the kit's choice and gives `useTranslations()` on the client and `next-intl/server` helpers in Server Components with one message catalog. Cost: every SaaS page needs `generateMetadata` and a locale segment, and guest-facing languages (EN, VI, JA, KO, RU) are a separate axis (`GuestLanguage` in zod) from operator chrome (EN, VI), which is easy to confuse.

Sources: `apps/saas/modules/i18n/routing.ts`, `apps/saas/proxy.ts`, `apps/saas/modules/shared/lib/walk-locales.ts`, `apps/saas/modules/i18n/request.ts`, `apps/saas/next.config.ts:29-60`, `packages/i18n/config.ts`, `apps/saas/tests/inbox.spec.ts`, `ARCHITECTURE.md:330-340`

## Tailwind 4, Base UI and the shadcn-style packages/ui

`packages/ui` is a shadcn-style component library: `components.json` points at `../../tooling/tailwind/theme.css`, `baseColor: "olive"`, CSS variables on, and the `shadcn-ui` script runs `pnpm dlx shadcn@latest` to pull generated components. Thirty-two components live in `packages/ui/components` (button, dialog, dropdown-menu, sidebar, toast, table, ...); thirteen of them import `@base-ui/react`. Apps import by package export, `@repo/ui/components/button`, never by path alias.

**Base UI, not Radix.** The kit migrated (CHANGELOG "Headless UI library: Radix UI → Base UI"): composition uses Base UI's `render` prop, there is no `asChild`, state attributes are `data-[open]`/`data-[checked]` instead of `data-[state=...]`, and CSS vars changed (`--anchor-width`). AGENTS.md states the rule: "Compose with the `render` prop (Base UI); there is no Radix `asChild`." Toasts moved to `@base-ui/react/toast` and `sonner` was removed. Why: Base UI is the MUI-team successor to Radix primitives with an active release line, and the kit aligned with it; the cost was a breaking migration with follow-up fixes (button `render` composition, select popup sizing) and less copy-paste compatibility with older shadcn snippets.

**Tailwind 4** (`tailwindcss: 4.3.3`, `@tailwindcss/postcss`) is CSS-first: `tooling/tailwind/theme.css` is the theme (Flat palette: blue action, amber pending; fonts Be Vietnam Pro and IBM Plex Mono because they carry Vietnamese glyphs, per CHANGELOG 2026-09-06), and `@repo/tailwind-config`'s `main` is that CSS file. There is no `tailwind.config.js`. oxfmt's `sortTailwindcss` sorts `className` and `cn()` against that stylesheet, so class order is enforced by the formatter, not a separate plugin. `cn` is `clsx` + `tailwind-merge`, `class-variance-authority` handles variants, icons are `lucide-react`.

Theme: `@repo/ui` `ThemeProvider`/`useTheme` wrap `@teispace/next-themes`; layouts inject `getThemeScript()` into `<head>` and pass `noScript` so React 19 does not warn about an inline script inside a client tree. Forms use React Hook Form with `@hookform/resolvers` and zod.

Cost of this stack: a design-system without a lock (ARCHITECTURE says "no separate brand lock"), and every kit component upgrade risks visual regressions in the walk.

Sources: `packages/ui/package.json`, `packages/ui/components.json`, `packages/ui/components`, `tooling/tailwind/package.json`, `.oxfmtrc.json`, `CHANGELOG.md:140`, `CHANGELOG.md:400-409`, `AGENTS.md:254-257`, `ARCHITECTURE.md:398-400`

## TanStack Query and nuqs: server data in the cache, view state in the URL

The kit's `ApiClientProvider` (`apps/saas/modules/shared/components/ApiClientProvider.tsx`) provides a `QueryClient` built by `createQueryClient()` with `staleTime: 60s`, `retry: false`, and a dehydrate rule that also dehydrates pending queries for streaming. `[locale]/layout.tsx` nests `NuqsAdapter` outside `NextIntlClientProvider`, then `ThemeProvider`, then `ApiClientProvider`.

**For the kit's modules**, TanStack Query is fed by oRPC: `orpc.users.avatarUploadUrl.mutationOptions()`, `orpc.<module>.list.key()` for invalidation. AGENTS.md's rule: after every mutation that affects a list, invalidate the matching keys before showing success UI, never rely on a page reload.

**For the inbox**, `apps/saas/modules/inbox/lib/inbox-queries.ts` is the only cache: `conversationsQueryKey = ["inbox", "conversations"]` plus the locale, `useConversations()` fetches `/api/conversations?locale=` with `refetchInterval: 10_000`, and `useApproveAndSend()` / `useRegenerateDraft()` are `useMutation`s that POST to `/approve` and `/draft` and invalidate the prefix on success. The 10 second poll is a deliberate choice over websockets or SSE: guests write back and translations and model drafts land in the background (ADR 0007), and a poll is the cheapest way to make those arrive with one process and no push infrastructure. Cost: up to 10 s latency and a request every 10 s per open tab.

**nuqs** (`nuqs: ^2.9.5`) holds the inbox view and search in the URL: `Inbox.tsx` does `useQueryState("view", parseAsStringLiteral(INBOX_VIEWS).withDefault("yourTurn"))` and `useQueryState("q", parseAsString.withDefault(""))`. The rationale in the component comment: the shell "owns the state (server data through TanStack Query, the view and search in the URL, the selection and the reply edits locally)". A URL-held view survives reload and is shareable; `parseAsStringLiteral` over `INBOX_VIEWS` means an invalid `?view=` falls back rather than crashing. Only `Inbox.tsx` uses nuqs; the selection and reply drafts are `useState` because they are per-session, not addressable.

Why TanStack Query over fetching in Server Components for the inbox: the queue must refresh without navigation and mutations must invalidate one cache; RSC would need `router.refresh()` loops. Why not the kit's oRPC for these queries: the routes are plain handlers (see the oRPC section), so there is no generated client, and the hand-written `api<T>()` helper with `InboxApiError` carries the server's `error` code to the UI for toasts.

Sources: `apps/saas/modules/shared/lib/query-client.ts`, `apps/saas/modules/shared/components/ApiClientProvider.tsx`, `apps/saas/app/[locale]/layout.tsx:76-93`, `apps/saas/modules/inbox/lib/inbox-queries.ts`, `apps/saas/modules/inbox/components/Inbox.tsx:1-40`, `AGENTS.md:184-199`

## zod 4 as the single vocabulary: the schema is both the type and the validator

`zod: ^4.4.3` is in the catalog and imported in `packages/database`, `packages/api`, `apps/saas`. The pattern that matters is `packages/database/inbox/schema.ts`: `export const Pipe = z.enum(["zalo", "whatsapp"]); export type Pipe = z.infer<typeof Pipe>;` and the same for `GuestLanguage` (en, vi, ja, ko, ru), `OperatorLanguage` (en, vi), `RentOrBuy`, `MessageDirection`, `MessageSource` (`guest`, `oa-echo`, `nhip`), `DbMessageSource` (`oa_echo` on disk, unexported so the domain cannot reach it), `DraftSource`, `AnswerStatus` (sending, sent, failed, unknown), `Timestamp` (`z.iso.datetime()`, a zod 4 API), `ResponseTime` and `Funnel`. Because a `const` and a `type` with the same name merge in TypeScript, one `export { Pipe } from "./schema"` in `inbox/index.ts` gives consumers both: `import type { Pipe }` erases, `import { Pipe }` gets something that can `safeParse`.

The history is in two commits. `dcd319b` (PR #11): the vocabulary "existed twice, as hand-written TypeScript unions in `inbox/types.ts` and again as unchecked `as` casts in `inbox/store.ts`, with nothing checking either at runtime"; collapsing them dropped the cast count in the store from 16 to 3, and the store is strict on purpose ("a row outside the vocabulary is corrupt state"). `0210ff7`: the values were made reachable from the app so `/dev/inbound` could stop restating `z.enum(["zalo","whatsapp"])`; the 400 message is built from `Pipe.options` so it cannot go stale, and the commit verified a third pipe is a one-line edit by adding `"line"` and watching all 132 tests stay green. `apps/saas/modules/inbox/lib/types.ts` re-exports the values so client components import with `import type` and never pull `@repo/database/inbox` into the bundle (verified by emitting `Inbox.tsx`).

The same discipline, opposite strictness, at the edges: webhook parsers in `pipes/vendors.ts` are deliberately loose (`safeParse`, `unknown[]` lists parsed one member at a time, `.catch(undefined)` on decorative fields) because Meta and Zalo add fields without notice; env validation in `config.ts` is a `z.object(...).superRefine` returning `{ ok, errors }` and never throwing; the draft adapter checks the chat-completions response with a small `completion` schema; the dev route validates `at` so a bad date is a 400 instead of a `RangeError` 500. `SendMode` stays a plain union because nothing parses it: "an enum no one validates with is ceremony rather than safety".

Why zod over Valibot or TypeBox: the kit already used zod with `@orpc/zod`, `prisma-zod-generator` and `@hookform/resolvers`; one library across API, forms and store. Cost: zod 4's `z.iso.datetime()` and error shape differ from zod 3, and the generated `prisma/zod/index.ts` is a second, generated vocabulary that must stay ignored by lint and format.

Sources: `packages/database/inbox/schema.ts`, `packages/database/inbox/index.ts`, `apps/saas/modules/inbox/lib/types.ts`, `apps/saas/modules/inbox/lib/pipes/vendors.ts:52-102`, `apps/saas/modules/inbox/lib/config.ts:29-154`, `apps/saas/app/dev/inbound/route.ts`, `packages/database/inbox/types.ts:24`

## pnpm 11 workspaces, the catalog, Turborepo, oxlint/oxfmt and TypeScript 7

**pnpm 11** (`packageManager: pnpm@11.3.0`, Node `>=22`). `pnpm-workspace.yaml` declares `apps/*`, `packages/*`, `tooling/*`, a `catalog:` of pinned versions that every package references as `"next": "catalog:"`, `minimumReleaseAge: 1440` (a release younger than 24 hours will not install, a supply-chain guard AGENTS.md calls out), and `allowBuilds` for the packages allowed to run postinstall scripts (`prisma`, `@prisma/engines`, `esbuild`, `sharp`, ...). Workspace packages are real package names (`@repo/database`, `@repo/ui`), not TS path aliases; only app-local aliases like `@inbox/*` live in `apps/saas/tsconfig.json` and are mirrored in `vitest.config.ts`.

**Turborepo** (`turbo ^2.10.10`). `turbo.json` wires `build` and `type-check` to depend on `^generate` (Prisma client first), `test` on `^generate`, `dev` persistent with `--concurrency 15`, `globalEnv: ["*"]` so env changes bust the cache, `lint` and `format:check` as cacheable tasks. Root scripts wrap Turbo in `dotenv -c --` so `.env.local` reaches every task. Why: cross-package task ordering and caching for `generate` before anything that imports the client. Cost: `dev` runs the whole workspace; for the walk only `pnpm --filter saas dev` on port 3010 is needed, and the docs say so.

**oxlint + oxfmt** replace ESLint and Prettier. `.oxlintrc.json` enables `typescript`, `react`, `import`, `jsx-a11y`, `oxc` plugins with `typeAware: true`, backed by `oxlint-tsgolint` (type-aware rules on the Go TypeScript). `.oxfmtrc.json` sets `printWidth: 100`, tabs, import sorting groups, Tailwind class sorting against `theme.css`, `sortPackageJson`. Both ignore the generated `prisma/zod/index.ts`. Why: an order of magnitude faster than ESLint and Prettier with one config each, which matters because AGENTS.md's gate is "after every meaningful change, run `pnpm format` and `pnpm lint`". Cost: fewer rules and plugins than the ESLint ecosystem, and a young formatter whose Tailwind sorting depends on a stylesheet path.

**TypeScript 7.0.2** is installed (the Go compiler). CHANGELOG line 270 records the jump: `experimental.useTypeScriptCli: true` in `next.config.ts` because TS 7 no longer ships the JavaScript compiler API that Next probes, and `@repo/logs` switched to `consola/core`. Earlier CHANGELOG entries repeatedly say "skipped typescript 7.x" for exactly that reason, so the flag is the unlock. `apps/saas` `type-check` is `next typegen && tsc --noEmit`. Shared configs are `tooling/typescript/{base,nextjs,react-library}.json` (`strict`, `module: Preserve`, `moduleResolution: bundler`).

Sources: `package.json`, `pnpm-workspace.yaml`, `turbo.json`, `.oxlintrc.json`, `.oxfmtrc.json`, `tooling/typescript/base.json`, `apps/saas/tsconfig.json`, `apps/saas/next.config.ts:31-35`, `CHANGELOG.md:270`, `AGENTS.md:72-78`, `AGENTS.md:274-278`

## vitest 4, the Postgres test database, GitHub Actions CI and the tsx scripts

**vitest 4** (`^4.1.10`). Three packages have a `test` script: `apps/saas`, `apps/marketing`, `packages/api`; the root `pnpm test` runs them through Turbo. There are 38 `*.test.ts` files; the saas ones cover approve, loop, funnel, store, queue, vendors (15 webhook parser cases), webhook, require-session, config/env, runtime, seed, openai-compatible, walk-nav and locale routing. `apps/saas/vitest.config.ts` uses `environment: "node"`, excludes `tests/**` (Playwright), sets `globalSetup: ["./vitest.global-setup.ts"]` and `fileParallelism: false` because "store tests share one database and truncate it; files must not interleave".

The test database: `packages/database/inbox/testing.ts` computes `TEST_DATABASE_URL`, defaulting to `DATABASE_URL`'s name plus `_test` (`supastarter_test`), and throws if it would equal `DATABASE_URL`. `ensureTestDatabase` creates it through the `postgres` maintenance database with `$executeRawUnsafe` (CREATE DATABASE cannot run in a transaction). The global setup then runs `pnpm exec prisma db push` in `packages/database` with `DATABASE_URL` swapped for the test URL. `resetInboxTables` does `TRUNCATE "inbox_conversation", "inbox_pipe_connection" CASCADE` and upserts the offices and operators a test names, because a thread needs an `Organization` and an `Answer` needs a `User`. Background work (`background.ts`) is awaited in tests with `settleBackgroundWork()`. Why a real Postgres over mocks: ADR 0012 says the approve and funnel tests are the proof of the store move, and unique-index races and raw SQL cannot be proven against a mock. Cost: every developer and CI needs a Postgres.

**CI** (`.github/workflows/ci.yml`, added in `ca051cc`): on `pull_request` and push to `main`, one `ubuntu-latest` job, 20 minute timeout, `concurrency` cancels superseded runs. A `postgres:16` service with `pg_isready` health checks on 5432; env sets `DATABASE_URL` (`supastarter`), `TEST_DATABASE_URL` (`supastarter_test`), a CI `BETTER_AUTH_SECRET`, `NEXT_PUBLIC_SAAS_URL=http://localhost:3010`, `RESEND_API_KEY=re_ci`. Steps: checkout, `pnpm/action-setup@v4`, Node 22 with pnpm cache, `pnpm install --frozen-lockfile`, `pnpm lint`, `pnpm format:check`, `pnpm type-check`, `pnpm test`, and `pnpm --filter saas seed:check`. No build step and no Playwright: E2E needs a running app and is run locally with `pnpm --filter saas e2e`.

**tsx scripts** (`tsx ^4.23.12`, run with `--tsconfig tsconfig.json` so `@inbox/*` aliases resolve): `seed` (walk logins, walk office, four invented threads, then `settleBackgroundWork()` and `store.close()`), `seed:check` (`seed-loads.ts`, a smoke that `seed-walk-user` imports under tsx without a database, because PR #8 broke on an ESM-only transitive dependency that only showed on a fresh machine), and `pipe:connect` (`connect-pipe.ts`, maps a WhatsApp `phone_number_id` or Zalo OA id to an office via `store.connectPipe`). Scripts share the app runtime through `getRuntime()`, which validates env but falls back to mock instead of failing.

Sources: `apps/saas/vitest.config.ts`, `apps/saas/vitest.global-setup.ts`, `packages/database/inbox/testing.ts`, `.github/workflows/ci.yml`, `apps/saas/package.json`, `apps/saas/modules/inbox/scripts/seed.ts`, `apps/saas/modules/inbox/scripts/seed-loads.ts`, `apps/saas/modules/inbox/scripts/connect-pipe.ts`, `apps/saas/modules/inbox/lib/runtime.ts`

## Vendor pipes (WhatsApp Cloud API, Zalo OA) and the SEND_MODE mock/live seam

**Config is settled once.** `apps/saas/instrumentation.ts` runs on the Node runtime at boot, calls `validateInboxEnv(process.env)` and `installInboxConfig(config)`; in production a failure throws and the server does not start, in dev it logs. `InboxConfig` carries `sendMode`, `whatsapp.{verifyToken, appSecret, accessToken, phoneNumberId}`, `zalo.{accessToken, oaSecretKey, oaId}` and `drafts.{apiKey, baseUrl, model}`. `resolveSendMode` returns `"live"` only for the exact string `live`; anything else, including unset or a typo, is `mock`, and validation rejects any value other than `mock`/`live`. With `SEND_MODE=live`, `WHATSAPP_APP_SECRET`, `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `ZALO_OA_ACCESS_TOKEN`, `ZALO_OA_SECRET_KEY` are all required. `getRuntime()` builds the singleton `{ store, config, drafts }`; nothing downstream reads `process.env` (commit `3fb0bdd`).

**One adapter per pipe** (`pipes/index.ts`, commit `c2ae618`). `PipeAdapter` has `verifyInbound`, `parseInbound`, `sendWindow`, `ownsEndpoint`, `send`. WhatsApp: verifies `X-Hub-Signature-256` as HMAC-SHA256 of the raw body with the app secret, fails closed when the secret is unset, compares with `crypto.timingSafeEqual`; parses `entry[].changes[].value.messages[]` and `smb_message_echoes[]` (the office replying from the phone app becomes an `oa-echo`); `sendWindow` enforces Meta's 24 hour customer-care window (`WA_WINDOW_MS`, refuses with `outside_24h_window` because Nhịp does not invent templates); `send` POSTs to `graph.facebook.com/v21.0/{phone_number_id}/messages`. Zalo: verifies `X-ZEvent-Signature` as `sha256(app_id + rawBody + timestamp + OA secret)`; parses `user_send_text` and `oa_send_text`; window always open; `send` POSTs to `openapi.zalo.me/v3.0/oa/message/cs` with `access_token` as a header. `ownsEndpoint` implements ADR 0010's process-wide credentials rule: WhatsApp requires `phoneNumberId` to equal the message's `pipeExternalId`; Zalo checks `ZALO_OA_ID` only when set. `pipes/webhook.ts` is the single inbound path; the two route files only name the pipe. Meta's GET handshake compares `hub.verify_token` with `WHATSAPP_VERIFY_TOKEN`.

**The seam.** `transmit()` returns `{ mock: true, vendorMessageId: "mock-<ts>" }` whenever `config.sendMode !== "live"`, whatever credentials exist, and only otherwise calls `pipeAdapter(pipe).send`. `approveAndSend` in `inbox.ts` writes the `Answer` in `sending` before `transmit`; a `SendError` (`kind` `rejected` or `config`) marks it `failed` and returns `502 send_failed`, any other throw marks it `unknown` and returns `502 delivery_unknown` (ADR 0011). Vendor error bodies are logged, never echoed.

Why no vendor SDKs: both APIs are one POST each, and a hand-written client cannot drift with a vendor package (the same argument the draft adapter makes). Why mock by default: HANDOFF's hard rule is never message real guests from dev; `.env.local.example` ships `SEND_MODE=mock`. Cost: live paths are exercised only by the vendors' sandboxes, and credentials are per process, so multi-office sending needs per-connection credentials later.

Sources: `apps/saas/instrumentation.ts`, `apps/saas/modules/inbox/lib/config.ts`, `apps/saas/modules/inbox/lib/runtime.ts`, `apps/saas/modules/inbox/lib/pipes/index.ts`, `apps/saas/modules/inbox/lib/pipes/vendors.ts`, `apps/saas/modules/inbox/lib/pipes/webhook.ts`, `apps/saas/app/webhooks/whatsapp/route.ts`, `apps/saas/modules/inbox/lib/inbox.ts:250-340`, `.env.local.example`, `docs/adr/0011-answer-is-the-record-of-a-send.md`

## Key facts

- The repo is the supastarter Next.js kit (root package name `supastarter-nextjs`); "kit first" means auth, organizations, invitations and admin are the kit's flows with config flags and one hook, and the office is the kit `Organization`.
- Signup is invitation-only: `enableSignup: false` plus the kit's `invitationOnlyPlugin`, which rejects `/sign-up/email` without a pending invitation; invited users auto sign in because the invitation already verified the email.
- A `hooks.before` middleware in `packages/auth/auth.ts` refuses `/organization/accept-invitation` with `ONE_OFFICE_PER_OPERATOR` when the user already has any membership (ADR 0010).
- Better Auth `baseURL` and the single trusted origin come from `NEXT_PUBLIC_SAAS_URL`; startup validation refuses a disagreeing `BETTER_AUTH_URL` and refuses `AUTH_TRUSTED_ORIGINS` in production; rate limiting is Better Auth's default memory store, not configured in code.
- oRPC runs behind one Hono app mounted at `apps/saas/app/api/[[...rest]]/route.ts`; it serves six kit modules and has no inbox router.
- Inbox, webhook and dev routes are plain Next route handlers gated by `requireInboxSession` (401 no session, 403 `no_office` / `ambiguous_office` from the membership table), because they need raw bodies, signatures and office resolution that `protectedProcedure` does not provide.
- Prisma 7 uses the `prisma-client` generator into `./generated` with `engineType = "client"` and `@prisma/adapter-pg`; `prisma.config.ts` supplies `DATABASE_URL`; `db` is a lazy Proxy singleton.
- Since ADR 0012 the inbox tables (`inbox_*`) share `schema.prisma` with the auth tables; `Conversation.officeId` cascades from `Organization`, `Answer.operatorId` set-nulls from `User`, the unique key is (officeId, pipe, guestId), and `createInboxStore(db)` is the only writer.
- Development uses `prisma db push`; a `prisma migrate` baseline is a go-live checklist step; there are no migration files in the tree.
- next-intl uses `localePrefix: "always"` with locales `en` and `vi` only; `proxy.ts` excludes `api`, `webhooks`, `dev`, `image-proxy`, `_next`, `_vercel`; `/` is a static redirect to `/en/inbox`.
- `packages/ui` is shadcn-style on Base UI (`render` prop, no `asChild`) with Tailwind 4 CSS-first theme in `tooling/tailwind/theme.css`; oxfmt sorts Tailwind classes against that stylesheet.
- Inbox server data lives in TanStack Query under `["inbox","conversations", locale]` with a 10 second `refetchInterval`; the view and search live in the URL through nuqs `useQueryState`.
- zod 4 schemas in `packages/database/inbox/schema.ts` are both validator and type (`export const Pipe` merged with `export type Pipe`); adding a pipe is a one-line edit, proven in commit `0210ff7`.
- pnpm 11 with a version `catalog:` and `minimumReleaseAge: 1440`; Turborepo orders `generate` before build/test; oxlint (type-aware via tsgolint) and oxfmt replace ESLint and Prettier; TypeScript 7.0.2 needs `experimental.useTypeScriptCli` in Next.
- CI runs one job with a `postgres:16` service: install, lint, format:check, type-check, vitest (real `supastarter_test` database pushed by a global setup, files serial), and `seed:check`; no build, no Playwright.
- `SEND_MODE` is the mock/live seam: `resolveSendMode` returns `live` only for the exact string `live`; `transmit()` returns a mock result otherwise; live requires all five vendor secrets at startup and both webhooks fail closed without their secret.

## Trade-offs

### Build on the supastarter kit and keep its admin/org/invitation/auth flows ("kit first")

**Alternatives:** A lean custom Next.js app with hand-rolled auth and orgs; or a different kit

**Why:** One developer and a pilot: sessions, passkeys, 2FA, invitations and admin screens are where custom code costs weeks and creates security holes; the office maps cleanly onto the kit Organization (ADR 0008)

**Cost:** A large tree of unused scaffolding (marketing, docs, payments, storage) to know how to ignore, kit naming (`supastarter` db, Organization = office), and version-bump churn from the kit's changelog cadence

### Plain Next route handlers for the inbox, webhooks and dev routes instead of oRPC procedures

**Alternatives:** An `inbox` oRPC router behind `protectedProcedure`, with generated client types

**Why:** Webhooks need the raw body for HMAC and vendor headers, the approve route maps domain results to specific HTTP codes, and the session gate must resolve the office from memberships rather than the session's active org (ADR 0010)

**Cost:** A second auth gate (`requireInboxSession`) to keep correct, which the 2026-09-06 audit found missing once; hand-written `fetch` calls with no generated types

### Move the inbox from a hand-written SQLite store into the kit's Prisma/Postgres schema (ADR 0012)

**Alternatives:** Keep SQLite with synchronous transactions and temp-file tests; or a second Postgres schema with its own migrations

**Why:** Real foreign keys and cascades between office and threads, one schema tool, and no one-process-one-disk limit

**Cost:** Tests and CI need a live Postgres, `fileParallelism: false`, no migration history yet (db push), and autoincrement `seq` columns kept only for ordering

### `prisma db push` in development, `prisma migrate` baseline deferred to go-live

**Alternatives:** Migrations from day one

**Why:** The kit's convention, no production data exists, and `pnpm seed` rebuilds the walk office; the ADR keeps the baseline as an explicit checklist step

**Cost:** A destructive schema change on the test database is refused rather than migrated (`dropdb supastarter_test`), and the first production migration will be a large baseline

### Locale-prefixed routes (`/en/inbox`, `/vi/inbox`) with `localePrefix: "always"`

**Alternatives:** Cookie-only locale with unprefixed paths

**Why:** Cookie-only was tried and rejected: prefixes make locale addressable, testable and cache-safe, and the Playwright spec can assert `/vi/inbox` keeps its prefix through login

**Cost:** Every page carries a `[locale]` segment and `generateMetadata`; `/` is English by design because the static redirect runs before the proxy

### Base UI (via shadcn-style components) rather than Radix

**Alternatives:** Radix primitives with `asChild`; Headless UI; hand-written primitives

**Why:** The kit migrated to Base UI as the maintained successor to Radix; composition via `render` prop

**Cost:** A breaking migration with follow-up fixes and less copy-paste compatibility with older shadcn snippets

### TanStack Query with a 10 second poll for the inbox queue

**Alternatives:** SSE or websockets for push; Server Components with `router.refresh()`

**Why:** Inbounds, translations and model drafts land in the background; polling delivers them with one process and no push infrastructure

**Cost:** Up to 10 s latency and a request per open tab every 10 s

### zod 4 schemas as the single vocabulary, strict in the store and loose at vendor edges

**Alternatives:** Hand-written TS unions plus `as` casts (the previous state); a separate validator library; Prisma enums alone

**Why:** The unions and casts drifted with nothing checking at runtime; one declaration gives both type and parser, and `Pipe.options` keeps messages and tests from restating lists

**Cost:** Zod 4 API differences from zod 3, and a second generated vocabulary (`prisma/zod/index.ts`) that must stay ignored by lint and format

### oxlint + oxfmt instead of ESLint + Prettier

**Alternatives:** ESLint with typescript-eslint and Prettier; Biome

**Why:** Much faster with one config each, which makes the "format and lint after every change" gate cheap; type-aware rules via tsgolint

**Cost:** Fewer rules and plugins than the ESLint ecosystem; Tailwind class sorting depends on a stylesheet path in the formatter config

### TypeScript 7 (Go compiler) with `experimental.useTypeScriptCli` in Next

**Alternatives:** Stay on TypeScript 5.x, which the CHANGELOG did for several rounds

**Why:** Faster type-check and the kit adopted it once Next could run without the JS compiler API

**Cost:** Relies on an experimental Next flag and stricter module resolution that forced `consola/core` in `@repo/logs`

### No vendor SDKs for WhatsApp, Zalo or the draft model: hand-written `fetch` calls with zod-checked responses

**Alternatives:** Meta and Zalo SDKs, the OpenAI or Anthropic SDK

**Why:** Each API is one POST; a hand-written client cannot drift with a vendor package, and OpenRouter's OpenAI-compatible endpoint makes the model vendor a config change

**Cost:** Nhịp owns the request shapes and must track API version changes (`graph.facebook.com/v21.0`, `openapi.zalo.me/v3.0`) itself

### `SEND_MODE` mock by default, live only for the exact string `live`, with all five vendor secrets required at startup

**Alternatives:** Live whenever credentials exist; a per-office toggle

**Why:** The hard rule is never to message real guests from dev or demo; credentials present should not imply sending

**Cost:** Live send paths are exercised only against vendor sandboxes, and credentials are process-wide, so multi-office sending needs per-connection credentials later

### Native Homebrew Postgres as the documented local path, Docker Compose as fallback

**Alternatives:** Docker Compose as the only path

**Why:** Docker on macOS boots a Linux VM for one database; native Postgres costs about 22 MB RAM (commit `da9fa4e`)

**Cost:** Two documented setups to keep in sync, and compose still carries MinIO for storage nobody uses

## Where the docs and the code disagree

- ARCHITECTURE.md's inbox modules table (line 365) says `apps/saas/modules/inbox/lib/drafts/` is "Draft adapter: Anthropic or none", but the directory contains `openai-compatible.ts` and `adapter.ts` only, and ARCHITECTURE's own Drafting section and `drafts/index.ts` describe an OpenAI-compatible adapter or `noDraftAdapter`.
- `apps/saas/instrumentation.ts` header comment says "The inbox runtime opens SQLite, which only exists on Node"; since ADR 0012 the runtime opens the Prisma/Postgres client (`createInboxStore(db)`). The Node-runtime gate is still correct, the reason given is stale.
- SQLite leftovers after ADR 0012: `apps/saas/next.config.ts` still lists `serverExternalPackages: ["better-sqlite3"]`, `pnpm-workspace.yaml` still allows builds for `better-sqlite3`, and `.gitignore` keeps an `# inbox sqlite` block; no package.json depends on `better-sqlite3` any more (it appears in the lockfile only as an optional peer of other packages).
- HANDOFF.md's go-live checklist (line 128) says to add `--adopt-unowned` to `pnpm --filter saas pipe:connect`; ADR 0012 removed the adopt path and `connect-pipe.ts` has no such flag.
- README.md says "Marketing, docs, admin, billing, and organizations are unused kit scaffolding", but the kit organization is the office (ADRs 0008, 0010) and the admin area is where offices are created; HANDOFF.md states this correctly. README also says "Approve claims the thread atomically"; since ADR 0011 the claim is the unique `Answer.inboundId` per guest message, not the thread.
- `.agents/skills/database-schema-change/SKILL.md` still references `packages/database/drizzle/schema/sqlite.ts`; the Drizzle subtree was removed in PR #13 (commit `ba3766a`).
- AGENTS.md and HANDOFF.md describe CI as lint, format:check, type-check and test; `.github/workflows/ci.yml` also runs `pnpm --filter saas seed:check` (the seed-loads smoke).
- ARCHITECTURE.md says `proxy.ts` excludes `api`, `webhooks`, `dev`, `image-proxy`, and `_next`; the matcher also excludes `_vercel` and any path containing a dot.
- The comment in `packages/auth/auth.ts` states rate limiting is "on by default in production (memory store, 100/10s, sign-in 3/10s)"; this describes Better Auth's defaults, nothing in the code configures `rateLimit`, so the numbers are only as true as the installed Better Auth 1.6.29 defaults.

## Interview questions for this chapter

See [the interview chapter](./07-interview.md) for the 4 questions that target this chapter.
