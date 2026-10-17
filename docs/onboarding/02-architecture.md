# System Architecture: how a guest message becomes an approved reply

_Part of the [onboarding walkthrough](./README.md)._

Nhịp is a supastarter (Next.js 16 App Router) monorepo where only apps/saas ships, on port 3010, and the product code is two modules inside it: modules/inbox and modules/home. Everything talks to one Postgres through Prisma: the kit's Better Auth tables and the inbox_* tables live in the same schema.prisma (ADR 0012), and the inbox store in packages/database/inbox is the only writer of the inbox tables. A request-scoped runtime singleton (getRuntime) hands every route the store, a config that was validated once at startup by instrumentation.ts, and a vendor-neutral draft adapter. Four flows cover the product: a signed webhook is parsed by a pipe adapter, mapped to an office through PipeConnection, upserted, run through a regex one-shot, and then translated and model-drafted in the background; the operator's Inbox is a client shell that polls GET /api/conversations every 10 seconds through TanStack Query behind a gate that resolves the office from the membership table, never the session's active organization; Approve and send writes an Answer row in status sending before the vendor is called, so a concurrent approval hits the unique index and a vendor timeout becomes unknown rather than a retry; and Home is a server component that counts the office funnel in one SQL query over Answers. Routes are locale-prefixed /en and /vi through next-intl middleware in proxy.ts, and client state is split three ways on purpose: server data in TanStack Query, view and search in the URL through nuqs, selection and reply edits in useState in the Inbox shell, with no Zustand or context because nothing outside that shell needs the state.

## Monorepo shape and what is kit scaffolding

The repo is a pnpm 11 workspace (`apps/*`, `packages/*`, `tooling/*`) driven by Turborepo, Node 22+, TypeScript 7, Oxlint and Oxfmt. It began as the supastarter Next.js kit, and most of the tree is still that kit. What Nhịp actually uses:

- `apps/saas`: the only app that ships (`next dev --port 3010`). Product code is `modules/inbox` (lib, components, scripts) and `modules/home`; `modules/shared` holds the sidebar (`walk-nav.ts`), locale helpers and `env.ts`, which is now just a re-export of `@inbox/lib/config`.
- `packages/database`: `prisma/schema.prisma` owns both the Better Auth tables and the eight `inbox_*` models; `inbox/` is the store (`store.ts`), the zod vocabulary (`schema.ts`), the domain types (`types.ts`) and test helpers. Exported as `@repo/database/inbox`.
- `packages/auth`: Better Auth 1.6.29 with `enableSignup: false`, `organizations.hideOrganization: true`, `enableUsersToCreateOrganizations: false`, `requireOrganization: false`, plus a `before` hook that refuses accepting a second office's invitation (`ONE_OFFICE_PER_OPERATOR`).
- `packages/i18n`: still lists `en, de, es, fr, vi`; the saas app narrows that to `walkLocales = ["en", "vi"]`. Copy lives under `inbox.*` and `home.*` in `translations/{en,vi}/saas.json`.
- `packages/ui`: Shadcn-style components over Base UI (`render` prop, no Radix `asChild`) and the `ThemeProvider` wrapping `@teispace/next-themes`.
- `tooling/tailwind/theme.css`: the Flat palette (blue action, amber pending).

Kit scaffolding left in place but unused: `apps/marketing`, `apps/docs`, `apps/mail-preview`, `packages/{ai,api,mail,notifications,payments,storage,permissions}`, and the `chatbot`, `start`, `choose-plan`, `new-organization` and `(organizations)/[organizationSlug]` routes. The oRPC/Hono API at `apps/saas/app/api/[[...rest]]/route.ts` still serves the kit's admin, organizations and payments procedures; the inbox deliberately does not use oRPC. Its routes are plain Next route handlers under `app/api/conversations/**`, which win over the catch-all because they are more specific. Two kit pieces are in use, not scaffolding: the kit organization is the office (ADR 0008), and the kit admin area at `/admin/organizations` is where a platform admin creates offices and invites agents (ADR 0010).

Why keep the kit: auth, invitations, sessions, the sidebar chrome and theme came for free; the memory rule is "kit first". Why not delete the rest: nothing imports it, it costs nothing at runtime, and deleting is churn with no product value until something needs the space.

Sources: `pnpm-workspace.yaml`, `package.json`, `apps/saas/package.json`, `packages/database/package.json`, `packages/auth/config.ts`, `packages/auth/auth.ts:150-165`, `apps/saas/modules/shared/lib/walk-locales.ts`, `apps/saas/app/api/[[...rest]]/route.ts`, `ARCHITECTURE.md:14-27`, `AGENTS.md:85-111`

## Startup: config validation and the runtime singleton

There are two singletons and they are both on `globalThis`, because Next re-evaluates modules across route bundles and HMR but shares one global.

**Config at startup.** `apps/saas/instrumentation.ts#register` runs once per server instance, only when `NEXT_RUNTIME === "nodejs"` (it is also bundled for edge, where the imports must not run). It calls `validateInboxEnv(process.env)` from `modules/inbox/lib/config.ts`, a zod `superRefine` over the env: `SEND_MODE` must be unset, `mock` or `live`; `live` requires `WHATSAPP_APP_SECRET`, `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `ZALO_OA_ACCESS_TOKEN`, `ZALO_OA_SECRET_KEY`; `DRAFT_API_KEY` without `DRAFT_MODEL` is an error (a model id is never defaulted in code because it goes stale); `NEXT_PUBLIC_SAAS_URL` is required, absolute, https in production, and must agree with `BETTER_AUTH_URL` if that is set; `BETTER_AUTH_SECRET` must be 32+ characters and not the `.env.local.example` literal; `AUTH_TRUSTED_ORIGINS` is refused in production. On success the settled `InboxConfig` is installed with `installInboxConfig`; on failure the errors are printed and in production the process throws, in dev it keeps running so you can fix `.env.local`.

**Runtime on first use.** `getRuntime()` in `modules/inbox/lib/runtime.ts` lazily builds `{ store: createInboxStore(db), config, drafts: draftAdapterFromConfig(config) }` into `globalThis.__nhipRuntime`. `resolveConfig` prefers the installed config; if startup did not run (scripts, tests) it validates again but falls back to `inboxConfigFromEnv` rather than failing, because scripts run against mock by default. A module-level `override` (`setRuntimeForTests`) lets tests swap in a store and a fake adapter without touching globals. `resolveSendMode` is the one place that turns a string into `live`: only the exact string, anything else is `mock`.

**Database client.** `packages/database/prisma/client.ts` exports `db` as a Proxy that creates a `PrismaClient` with the `PrismaPg` adapter on first property access and caches it on `globalThis.prisma`. The Proxy means importing `@repo/database` never opens a connection at import time, which is what lets client-side type imports and the build succeed without `DATABASE_URL`.

The draft adapter is `openai-compatible` when a key and model exist (plain `fetch` to `/chat/completions`, default base URL OpenRouter, no vendor SDK) and `none` otherwise, where every method returns `null` and the fallback stands: no translation, template drafts.

Sources: `apps/saas/instrumentation.ts`, `apps/saas/modules/inbox/lib/config.ts:29-154`, `apps/saas/modules/inbox/lib/config.ts:187-232`, `apps/saas/modules/inbox/lib/runtime.ts`, `packages/database/prisma/client.ts`, `apps/saas/modules/inbox/lib/drafts/index.ts`, `apps/saas/modules/inbox/lib/drafts/adapter.ts`

## Flow 1: inbound webhook to background work

`POST /webhooks/whatsapp` and `POST /webhooks/zalo` are one-liners that call `handleInboundWebhook(pipe, request)` in `modules/inbox/lib/pipes/webhook.ts`. The route only names the pipe; everything vendor-specific lives in that pipe's `PipeAdapter` (`pipes/index.ts`): `verifyInbound`, `parseInbound`, `sendWindow`, `ownsEndpoint`, `send`.

1. **Signature, fail closed.** The raw body is read as text before parsing, because both vendors sign the raw bytes. WhatsApp: `X-Hub-Signature-256: sha256=<hex>` is HMAC-SHA256 of the body with `WHATSAPP_APP_SECRET`. Zalo: `X-ZEvent-Signature: mac=<hex>` is `sha256(app_id + rawBody + timestamp + ZALO_OA_SECRET_KEY)` with `app_id` and `timestamp` taken from the body. Comparison is `crypto.timingSafeEqual` on hex. A missing secret returns `false`, so an unconfigured deployment answers 403 "bad signature" to everything. WhatsApp's `GET` is Meta's one-time handshake: `hub.mode=subscribe` and `hub.verify_token === WHATSAPP_VERIFY_TOKEN` echoes `hub.challenge`.
2. **Parse loosely.** `vendors.ts` uses zod schemas that declare only the fields read, `.catch(undefined)` on decorative fields, and parses list members individually so one malformed entry never sinks a batch. Output is `InboundEvent[]` with `source: "guest"` or `"oa-echo"` (an agent replying from the vendor app), and `pipeExternalId`: the WhatsApp `phone_number_id` or the Zalo OA id, the office's side of the pipe.
3. **Office by pipe.** `ingestEvents` calls `store.officeForPipe(pipe, pipeExternalId)` against `inbox_pipe_connection` (primary key `(pipe, externalId)`, set by `pnpm --filter saas pipe:connect`). No connection means the event is dropped with a `console.warn`; tenancy fails closed and there is no unowned state (ADR 0012).
4. **Upsert.** `store.upsertInbound(event, officeId)` is one Prisma transaction: find the thread by the unique triple `(officeId, pipe, guestId)`, create it with id `office:pipe:guest` if absent, skip a message whose `vendorMessageId` already exists on the thread (webhook redelivery), insert the `inbox_message`, and bump `lastGuestInboundAt` for guest messages.
5. **One-shot, synchronous.** For a guest message `afterGuestInbound` runs `applyOneShot`: regex language detection and extraction (`extract.ts`, `language.ts`), the first-reply template or, once the office has sent, the follow-up template (`draft.ts`), stored via `setOneShot` into `inbox_qualification`, `inbox_draft`, `inbox_paperwork`.
6. **Background.** `scheduleTranslations` queues one job per operator language (`en`, `vi`) that the message is not already in, deduplicated by an `inFlight` map; and if the thread has a `sentAt` and a model exists, `generateModelDraft` asks the adapter for a follow-up from the whole conversation, runs it through `drafts/guardrails.ts` (paperwork and ownership claims are dropped), and stores it only if `unansweredInboundId` is still the same message. `background.ts` tracks every job in a `Set` so tests call `settleBackgroundWork()`; failures are logged, not surfaced, because the fallback is already on disk before the job starts (ADR 0007).

The route returns `{ ok: true }` as soon as the upsert and one-shot are done; the UI sees translations and model drafts on its next poll.

Sources: `apps/saas/app/webhooks/whatsapp/route.ts`, `apps/saas/app/webhooks/zalo/route.ts`, `apps/saas/modules/inbox/lib/pipes/webhook.ts`, `apps/saas/modules/inbox/lib/pipes/index.ts`, `apps/saas/modules/inbox/lib/pipes/vendors.ts:104-260`, `apps/saas/modules/inbox/lib/inbox.ts:14-113`, `packages/database/inbox/store.ts:251-310`, `apps/saas/modules/inbox/lib/translate.ts`, `apps/saas/modules/inbox/lib/background.ts`

## Flow 2: the operator opens the Inbox

**Page.** `/en/inbox` resolves to `app/[locale]/(authenticated)/(main)/(account)/inbox/page.tsx`, a server component that renders `<Inbox />` and sets the title from `app.menu.inbox`. Three layouts wrap it. `[locale]/layout.tsx` validates the locale against `routing.locales` (404 otherwise), calls `setRequestLocale`, loads messages, injects the theme FOUC script into `<head>` and stacks `NuqsAdapter > NextIntlClientProvider (keyed by locale) > ThemeProvider > ApiClientProvider (TanStack QueryClientProvider) > ClientProviders (progress bar)`. `(authenticated)/layout.tsx` is `force-dynamic`, calls `getSession()` and `localeRedirect` to `/login` without one, sets up Permix, and prefetches the session and organization list into a dehydrated TanStack cache. `(main)/layout.tsx` re-checks the session and onboarding; because `requireOrganization` is `false` it never redirects to `/new-organization`. `(account)/layout.tsx` is the `AppWrapper` sidebar.

**Client shell.** `modules/inbox/components/Inbox.tsx` calls `useConversations()` from `lib/inbox-queries.ts`: a `useQuery` keyed `["inbox", "conversations", locale]` that fetches `/api/conversations?locale=<en|vi>` with `refetchInterval: 10_000`. Polling is the delivery mechanism for everything that happens without the operator: new inbounds, translations and model drafts (ADR 0007). No websockets, no SSE; a 10-second poll on an office-sized list is cheap and needs no infrastructure. The shared `QueryClient` (`shared/lib/query-client.ts`) sets `staleTime` 60s and `retry: false`.

**Gate.** `GET /api/conversations` (`export const dynamic = "force-dynamic"`) starts with `requireInboxSession(request)` in `lib/require-session.ts`. Inbox routes live outside the `(authenticated)` layout and outside oRPC, so they check auth themselves: `auth.api.getSession({ headers })` gives 401 `unauthorized`; then `resolveOffice(userId)` in `lib/office.ts` reads `getOrganizationMembershipsForUser` from the membership table on every request. Zero rows is 403 `no_office`, more than one is 403 `ambiguous_office` (logged as a misconfiguration to fix), one row yields the `InboxViewer { userId, officeId }`. The session's `activeOrganizationId` is never consulted: an outside audit showed a signed-in user can set it to any organization id through the kit's update-user endpoint, and a client-writable preference cannot grant access (ADR 0010).

**List.** `store.listConversations(viewer)` is `findMany` where `officeId = viewer.officeId`, ordered by `updatedAt desc`, with one `include` (`CONVERSATION_INCLUDE`) that pulls messages with translations, qualification, draft, paperwork and answers. `mapConversation` derives `unansweredInboundId` from the Answers (ADR 0011) and `oneShot` from the three side tables. After the list is built, `scheduleMissingTranslations` backfills the requested locale in the background, so a locale the office never used before gets its translations on first request.

**Queue rules stay in lib.** `lib/queue.ts#buildQueueView(conversations, view, query)` filters by `matchesThreadSearch`, splits `yourTurn` (guest spoke last, oldest waiting first) from `sent` (most recent first) and `all`, folds threads quiet for more than 48 hours (`QUIET_AFTER_MS`) under a `<details>`, and `nextSelection` keeps or advances the selection so a send in the queue view moves to the next waiting guest.

Sources: `apps/saas/app/[locale]/(authenticated)/(main)/(account)/inbox/page.tsx`, `apps/saas/app/[locale]/layout.tsx`, `apps/saas/app/[locale]/(authenticated)/layout.tsx`, `apps/saas/app/[locale]/(authenticated)/(main)/layout.tsx`, `apps/saas/modules/inbox/lib/inbox-queries.ts`, `apps/saas/modules/shared/lib/query-client.ts`, `apps/saas/app/api/conversations/route.ts`, `apps/saas/modules/inbox/lib/require-session.ts`, `apps/saas/modules/inbox/lib/office.ts`, `packages/database/inbox/store.ts:136-238`, `apps/saas/modules/inbox/lib/queue.ts`

## Flow 3: Approve and send, the Answer lifecycle

`POST /api/conversations/[id]/approve` is the only send path. The body names the guest message (`inboundId`) and the exact text (`reply`); a malformed body is parsed as an approval of nothing and refused downstream. The route passes the gate, calls `approveAndSend(id, { inboundId, text }, viewer)` in `lib/inbox.ts`, logs vendor error bodies server-side only, and returns `{ ok, conversation }` or `{ error, message }` with the status the lib decided.

Order of checks in `approveAndSend`, each a distinct code the UI can word:

1. `store.getConversation(id, viewer)` returns null across offices: 404 `not_found`.
2. No `unansweredInboundId`: 409 `already_answered`, or 409 `delivery_unknown` if the latest inbound has an Answer in `unknown`.
3. Missing `inboundId`: 400 `inbound_required`. Wrong one: 409 `stale_target` ("the guest wrote again since this reply was drafted"). Blank text: 400 `empty_reply`; blank is never filled from the stored suggestion.
4. `adapter.sendWindow(conv)`: WhatsApp refuses free-form text outside the 24-hour customer-care window (`WA_WINDOW_MS`) or with no inbound at all; Zalo is always open.
5. `latestGuestEndpoint` vs `adapter.ownsEndpoint`: in live mode a thread that arrived on a number or OA these credentials do not own is 409 `pipe_not_configured` (`WHATSAPP_PHONE_NUMBER_ID`, `ZALO_OA_ID`; unset Zalo id means unchecked).
6. **`store.beginAnswer`** writes the `inbox_answer` row with `status: sending`, the text, `operatorId`, `approvedAt`, the pipe, `to` and `pipeExternalId`, inside one interactive transaction. `inboundId` is `@unique`, so two taps in the same instant produce a Prisma `P2002`, mapped to `in_progress` (409 `send_in_progress`). An existing `sent` row is `already_answered`, `unknown` is refused, and a `failed` row is reused for the retry: one Answer per inbound, always.
7. **`transmit`** (`pipes/index.ts`): if `config.sendMode !== "live"` it returns `{ mock: true, vendorMessageId: "mock-<ts>" }` without touching a vendor; otherwise `sendWhatsApp` (Graph API v21.0 `/{phoneNumberId}/messages`) or `sendZalo` (`openapi.zalo.me/v3.0/oa/message/cs`).
8. Outcome. A `SendError` (vendor refused, or missing credentials, kind `rejected` | `config`) is definite: `failAnswer` sets `failed`, 502 `send_failed`, and the operator may approve again. Any other throw (network, timeout) is ambiguous: `markAnswerUnknown`, 502 `delivery_unknown`, and the app never retries; a person reconciles against the vendor. On success `completeAnswer` is one transaction: Answer to `sent` with `sentAt` and `vendorMessageId`, the outbound `inbox_message` (`source: nhip`), and `Conversation.sentAt`. If that record fails after the vendor accepted, the row is marked `unknown` with `recorded_failed:` and the route returns 500 `record_failed`, so the text is not sent twice.

Why the row is written first (ADR 0011): an earlier design wrote Approval and Send rows after the vendor call, and an audit showed three gaps: a stale target answered with a reply meant for the previous message, a record failure after vendor success released the claim and sent twice, and "Your turn" read off message order hid a guest message that landed mid-send. Deriving `unansweredInboundId` from Answers with `ANSWERING_STATUSES = [sending, sent, unknown]` (or an `oa-echo` after the message) closes the third.

`POST /api/conversations/[id]/draft` (`regenerateDraft`) is the sibling: it asks the model for a fresh suggestion, never sends, and puts the template back if the model is absent or the guardrails drop the draft, so the box is never empty.

Sources: `apps/saas/app/api/conversations/[id]/approve/route.ts`, `apps/saas/app/api/conversations/[id]/draft/route.ts`, `apps/saas/modules/inbox/lib/inbox.ts:153-376`, `apps/saas/modules/inbox/lib/pipes/index.ts:82-98`, `apps/saas/modules/inbox/lib/pipes/vendors.ts:7-37`, `apps/saas/modules/inbox/lib/pipes/vendors.ts:262-337`, `packages/database/inbox/store.ts:362-475`, `packages/database/prisma/schema.prisma:375-400`, `docs/adr/0011-answer-is-the-record-of-a-send.md`

## Flow 4: Home as a server component over store.funnel

Home is the manager's numbers screen (ADR 0001), and it is rendered entirely on the server. `home/page.tsx` returns `<Home />`, an `async` React server component in `modules/home/components/Home.tsx`. It awaits `getTranslations("home")`, `getLocale()` and `loadHomeFunnel()` in one `Promise.all`.

`modules/home/lib/funnel.ts` starts with `import "server-only"` so it can never be pulled into a client bundle. It resolves the office the same way the API gate does: `getSession()` from `@auth/lib/server`, then `resolveOffice(session.user.id)` from the membership table, never the session's active organization. A denial is returned as data (`{ denied: "no_office" | "ambiguous_office" }`) and Home renders the `home.denied.*` sentence above empty stages instead of throwing; the `(authenticated)` layout has already redirected visitors without a session. The window is `FUNNEL_WINDOW_DAYS = 30`, one fixed period until an office asks for a picker (ADR 0002).

`store.funnel(viewer, { since })` is one raw SQL query (`$queryRaw`) inside the office: a CTE `first` takes `MIN(at)` of inbound messages per conversation, a CTE `reached` takes `MIN(sentAt)` of `sent` Answers per conversation, and the select joins them for conversations where `officeId = viewer.officeId` and the first inbound is on or after `since`, with an `EXISTS` for a later inbound after the first send (`wroteBack`). One row per cohort lead comes back; JavaScript only sorts the durations and takes nearest-rank percentiles. The result is the zod `Funnel` type: `leadsIn`, `engaged` (a `sent` Answer exists), `inConversation` (guest wrote after it), `responseTime { answered, medianMs, p90Ms } | null`. Counting inside the office in SQL means no thread ever leaves the store for a count (ADR 0002 over ADR 0011).

The component draws five stages: the three counted ones with a share bar against `leadsIn`, and `closings` and `lost`, which only ever come from the CRM adapter (ADR 0003, not built), so they show "connect your CRM" rather than a zero that looks like a fact. Response time sits under the funnel as a supporting widget, formatted by `home/lib/duration.ts`.

Why a server component and not the client-polling pattern of the Inbox: Home is read once per visit, needs no interaction, and its data access (`getSession`, the store) is server-only; sending it to the client would mean another route handler and a cache for a number that a page refresh already updates.

Sources: `apps/saas/app/[locale]/(authenticated)/(main)/(account)/home/page.tsx`, `apps/saas/modules/home/components/Home.tsx`, `apps/saas/modules/home/lib/funnel.ts`, `packages/database/inbox/store.ts:513-564`, `packages/database/inbox/store.ts:212-215`, `docs/adr/0002-home-shows-the-funnel.md`

## Locale routing: /en and /vi, always prefixed

SaaS routing is next-intl 4 with `localePrefix: "always"`. `apps/saas/modules/i18n/routing.ts` calls `defineRouting` with `locales: walkLocales` (`["en", "vi"]`), `defaultLocale` from `@repo/i18n` (`en`), the cookie name `NEXT_LOCALE`, and `localeDetection` on because there is more than one locale. `createNavigation(routing)` exports `LocaleLink`, `localeRedirect`, `useLocalePathname`, `useLocaleRouter` and `getPathname`, which is what the layouts use for `/login` redirects so a Vietnamese operator lands on `/vi/login`.

`apps/saas/proxy.ts` (Next 16's name for middleware) runs `createMiddleware(routing)` on every path except `api`, `webhooks`, `dev`, `image-proxy`, `_next`, `_vercel` and anything with a dot. The matcher is a literal regex in that file because Next parses it statically at build time and cannot follow an import; a comment says to keep it in sync with `modules/i18n/lib/proxy-matcher.ts`. Excluding `api`, `webhooks` and `dev` is what keeps the inbox API and vendor webhooks locale-free: a webhook from Meta must never be redirected to `/en/webhooks/whatsapp`.

Bare `/` is a static `next.config.ts` redirect to `/en/inbox` (302, `permanent: false`); it runs before the proxy, so `/` is English by design. Bare `/inbox` reaches the proxy, which prefixes it with the cookie's locale or the default. `/de/inbox` is not routable: `[locale]/layout.tsx` checks `hasLocale(routing.locales, locale)` and calls `notFound()`, even though `packages/i18n` still lists `de`, `es`, `fr` for the rest of the kit. The `settings` redirects in `next.config.ts` use a `localeAlternation` derived from `@repo/i18n` so they cannot drift from the list.

`modules/i18n/request.ts` is the `next-intl/plugin` entry: it reads the request locale, falls back to the default when unsupported, and loads messages with `getMessagesForLocale`. `NextIntlClientProvider` is keyed by `locale` in the root layout so switching remounts the client tree with fresh messages. The operator switch is `WalkLocaleToggle` (EN / VI only) in the user menu; it calls `useSwitchLocale`, which navigates `/en/...` to `/vi/...`. `walk-nav.ts` builds hrefs without a prefix (`/home`, `/inbox`, `/admin/organizations`) and `locale-path.ts#withoutLocalePrefix` strips the prefix for active-state checks.

Why path prefix and not cookie: cookie-only locale was tried and rejected (HANDOFF). A URL that carries the language is shareable and cacheable, and the operator language also selects which translation column the inbox asks for (`?locale=`), so it must be visible in the request, not hidden in a cookie.

Sources: `apps/saas/modules/i18n/routing.ts`, `apps/saas/proxy.ts`, `apps/saas/next.config.ts:29-80`, `apps/saas/app/[locale]/layout.tsx:36-52`, `apps/saas/modules/i18n/request.ts`, `apps/saas/modules/i18n/lib/locale-path.ts`, `apps/saas/modules/shared/lib/walk-locales.ts`, `apps/saas/modules/shared/components/WalkLocaleToggle.tsx`, `packages/i18n/config.ts`, `ARCHITECTURE.md:29-39`

## Client state model and the Inbox component split

The Inbox client has exactly three kinds of state, each in the tool built for it, and one component that owns all three.

1. **Server data: TanStack Query.** `lib/inbox-queries.ts` is the only cache. `useConversations` polls `/api/conversations?locale=` every 10 seconds under the key `["inbox", "conversations", locale]`. `useApproveAndSend` and `useRegenerateDraft` are `useMutation`s that POST to `/approve` and `/draft` and, on success, `invalidateQueries({ queryKey: conversationsQueryKey })` so the list refetches immediately rather than waiting for the poll (AGENTS.md's cache-invalidation rule). Errors are thrown as `InboxApiError` carrying the server's `error` code so the send bar can word `stale_target` or `delivery_unknown`.
2. **View and search: the URL through nuqs.** `useQueryState("view", parseAsStringLiteral(INBOX_VIEWS).withDefault("yourTurn"))` and `useQueryState("q", parseAsString.withDefault(""))`. `NuqsAdapter` sits in the root layout. The tab and the search are navigation state: a refresh, a back button or a pasted link should land on the same queue, and `?view=sent&q=minji` is a URL an operator can share inside the office.
3. **Ephemeral UI: `useState` in the shell.** `selectedId`, `detailOpen` (phone-only two-pane toggle) and `sendError` live in `Inbox.tsx`; the reply edits live in `lib/use-reply-draft.ts`, a `Record<string, string>` keyed by `unansweredInboundId` (ADR 0011) so a guest who writes again gets a fresh box and an edit meant for the previous message is never sent. `dropEdit` clears the key after a send or a regenerate.

**Why no Zustand or React context.** Nothing outside the Inbox shell reads any of this state, the tree under it is two levels deep, and every child is handed exactly what it renders. A store would add a second source of truth for server data that TanStack already owns, and a context would only save a few props. The rule from the split commit is "the shell owns the state and the layout; the components render what they are handed and decide nothing."

**The split** (commit 4f4f5f8, PR #25): a 642-line `Inbox.tsx` became a 176-line shell over eight files in `modules/inbox/components/`:

- `InboxToolbar.tsx`: search input and the three view tabs with counts, `hiddenOnPhone` while a thread is open.
- `ThreadList.tsx`: skeleton, load error with retry, the empty states (`empty`, `allCaughtUp`, `noMatches`, `onlyQuiet`), visible rows, quiet rows under `<details>`.
- `ThreadRow.tsx`: one thread: initials mark, name, time, last inbound preview, flags.
- `ThreadDetail.tsx`: header with back button, every `ThreadMessage`, `ExtractFields`, the operator note, `ReplyBox`, and `SendBar` pinned under it; it takes one `ReplyState` prop bundle.
- `ThreadMessage.tsx`: original text and its translation under it, rendered as text, never markup (ADR 0007).
- `ExtractFields.tsx`: the one-shot rows, present first, missing folded (`arrangeExtractRows`).
- `ReplyBox.tsx`: editable textarea, "suggested by template/model" note until edited, regenerate.
- `SendBar.tsx`: the only send control, wording a `SendStatus` decided by `lib/send-status.ts`.
- `ThreadParts.tsx`: `GuestMark`, `ThreadFlags`, `ThreadListState`, `useOperatorLanguage`.

Every rule that is not rendering lives in `lib/` with a test: queue order (`queue.ts`), search (`search.ts`), send status (`send-status.ts`), extract rows (`extract-rows.ts`), crib text (`crib.ts`).

Sources: `apps/saas/modules/inbox/components/Inbox.tsx`, `apps/saas/modules/inbox/lib/inbox-queries.ts`, `apps/saas/modules/inbox/lib/use-reply-draft.ts`, `apps/saas/modules/inbox/components/ThreadDetail.tsx`, `apps/saas/modules/inbox/components/ThreadList.tsx`, `apps/saas/modules/inbox/components/SendBar.tsx`, `apps/saas/modules/inbox/components/ThreadParts.tsx`, `apps/saas/app/[locale]/layout.tsx:76-93`, `AGENTS.md:184-199`

## Persistence: one Postgres, the store seam, and tests

Until 2026-09-20 the inbox was a hand-written SQLite file next to the kit's Postgres. ADR 0012 moved it into `schema.prisma` because the split had three costs: no relation could be written between an office row in Postgres and a thread in SQLite (deleting an office left its threads), two schema tools (`prisma db push` and hand `CREATE TABLE` migrations on open), and a file on disk that ruled out serverless or a second instance.

The models, all `@@map`ped with an `inbox_` prefix so they never collide with the kit's: `Conversation` (id `office:pipe:guest`, `@@unique([officeId, pipe, guestId])`, `officeId -> Organization onDelete: Cascade`), `Message` (autoincrement `seq` for stable order, `direction`, `source`, `vendorMessageId`, `pipeExternalId`), `Translation` (`@@id([messageId, locale])`), `Qualification`, `Draft`, `Paperwork` (one row per conversation), `Answer` (`inboundId @unique`, `operatorId -> User onDelete: SetNull` so the record outlives the operator), `PipeConnection` (`@@id([pipe, externalId])`). Closed vocabularies are Prisma enums (`Pipe`, `MessageDirection`, `MessageSource` with `oa_echo` on disk and `oa-echo` in the domain, `DraftSource`, `AnswerStatus`); open ones (guest and operator languages, `rentOrBuy`) are text validated by zod in `packages/database/inbox/schema.ts`, so those lists can grow without a schema change. Time is `timestamptz` on disk and ISO strings in the domain; the store maps at its boundary.

**The seam.** `InboxStore` in `inbox/types.ts` is the contract: `listConversations`, `getConversation`, `upsertInbound`, `connectPipe`, `officeForPipe`, `listPipeConnections`, `setOneShot`, `setDraft`, `setTranslation`, `beginAnswer`, `completeAnswer`, `failAnswer`, `markAnswerUnknown`, `guestInboundText`, `funnel`, `close`. `createInboxStore(db)` takes the Prisma client; routes call methods and never touch Prisma. That is why the SQLite-to-Prisma move changed no route, no approve path and no component: the seam held, and the existing approve, loop and funnel tests were the proof.

**Tests.** `apps/saas/vitest.config.ts` runs with `fileParallelism: false` because store tests share one database. `vitest.global-setup.ts` creates `supastarter_test` (`TEST_DATABASE_URL`) and runs `prisma db push` once; each store test truncates the inbox tables. CI (`.github/workflows/ci.yml`) starts a `postgres:16` service and runs lint, format:check, type-check, test and `seed:check`. Schema changes go through `db push` in development; a `prisma migrate` baseline is a go-live checklist step.

Sources: `packages/database/prisma/schema.prisma:250-412`, `packages/database/inbox/types.ts:182-221`, `packages/database/inbox/schema.ts`, `packages/database/inbox/store.ts:41-134`, `apps/saas/vitest.config.ts`, `apps/saas/vitest.global-setup.ts`, `.github/workflows/ci.yml`, `docs/adr/0012-inbox-on-prisma.md`

## Key facts

- Only apps/saas ships, on port 3010; marketing, docs, mail-preview, packages/api (oRPC/Hono), payments, notifications, storage and ai are kit scaffolding left unused, while the kit organization (as the office) and the kit admin area are in use.
- One Postgres via DATABASE_URL holds both Better Auth tables and the eight inbox_* Prisma models (ADR 0012); createInboxStore(db) in packages/database/inbox is the only writer, and routes never touch Prisma directly.
- instrumentation.ts validates env once at startup with validateInboxEnv (zod superRefine): SEND_MODE mock|live, live requires the five vendor vars, DRAFT_API_KEY needs DRAFT_MODEL, BETTER_AUTH_SECRET 32+ chars, NEXT_PUBLIC_SAAS_URL absolute; production throws, dev logs.
- getRuntime() lazily builds { store, config, drafts } on globalThis.__nhipRuntime; the draft adapter is openai-compatible (plain fetch, OpenRouter default) or none, and resolveSendMode makes only the exact string "live" live.
- Inbound: raw body -> pipe adapter verifyInbound (WhatsApp HMAC X-Hub-Signature-256, Zalo sha256(appId+body+timestamp+secret), timingSafeEqual, missing secret = 403) -> loose zod parse -> officeForPipe on inbox_pipe_connection (no connection = dropped) -> upsertInbound transaction deduped by vendorMessageId -> regex one-shot -> background translation and model draft.
- Every inbox route is force-dynamic and starts with requireInboxSession: 401 without a Better Auth session, 403 no_office or ambiguous_office from the membership table; the session's activeOrganizationId is never consulted because a user can set it to any org id.
- Thread identity is (office, pipe, guest) with id office:pipe:guest; the store lists and reads strictly by viewer.officeId so a thread is invisible outside its office and shared by every agent in it.
- The Inbox client polls GET /api/conversations?locale= every 10 seconds through TanStack Query; that poll is how new inbounds, translations and model drafts reach the screen, and mutations invalidate ["inbox","conversations"] on success.
- Approve and send checks not_found, already_answered/delivery_unknown, inbound_required, stale_target, empty_reply, the WhatsApp 24h window and pipe_not_configured, then beginAnswer writes the Answer in status sending before any vendor call; the unique index on Answer.inboundId turns a concurrent approval into P2002 -> 409 send_in_progress.
- SendError (vendor refused or missing credentials) marks the Answer failed and may be retried on the same row; any other throw, or a record failure after vendor success, marks it unknown and the app never retries until a person reconciles.
- "Your turn" (unansweredInboundId) is derived in mapConversation from Answers in status sending/sent/unknown or an oa-echo after the message, not from message order, so a guest message arriving mid-send stays in the queue.
- Home is an async server component; funnel.ts is server-only, resolves the office from membership, and store.funnel runs one raw SQL CTE query over inbox_message and sent inbox_answer rows for leads whose first inbound is within FUNNEL_WINDOW_DAYS = 30; closings and lost say "connect your CRM".
- Locale routing is next-intl localePrefix "always" with walkLocales [en, vi]; proxy.ts excludes api, webhooks, dev, image-proxy, _next, _vercel; / is a static next.config redirect to /en/inbox; /de/inbox is notFound even though packages/i18n lists de, es, fr.
- Client state is split by kind: server data in TanStack Query, view and search in the URL via nuqs useQueryState, selection/detailOpen/sendError and reply edits (keyed by unansweredInboundId) in useState inside the Inbox shell; no Zustand or context because nothing outside the shell reads it.
- PR #25 split a 642-line Inbox.tsx into a 176-line shell over InboxToolbar, ThreadList, ThreadRow, ThreadDetail, ThreadMessage, ExtractFields, ReplyBox, SendBar and ThreadParts; every non-rendering rule (queue, search, send status, extract rows) lives in lib/ with a test.
- Tests run serially (fileParallelism: false) against supastarter_test, pushed once by vitest.global-setup.ts and truncated per test; CI runs a postgres:16 service plus lint, format:check, type-check, test and seed:check.

## Trade-offs

### Move the inbox from a SQLite file into the kit's Postgres through Prisma (ADR 0012)

**Alternatives:** Keep SQLite with hand migrations; Drizzle (removed earlier in PR #13); a separate Postgres database for the inbox

**Why:** Real foreign keys to Organization and User (cascade on office delete, set-null on operator), one schema tool (prisma db push), and no single-process disk dependency; the InboxStore seam meant no route or component changed

**Cost:** Tests need a running Postgres and run serially; the synchronous SQLite transaction became an interactive Prisma transaction; a migrate baseline is still owed before go-live

### Write the Answer row in status sending before calling the vendor, with a unique index on inboundId (ADR 0011)

**Alternatives:** Write Approval and Send rows after the vendor call; claim the thread with a claimedAt column; optimistic client-side locking

**Why:** Closes three audited gaps: stale target, double send after a record failure, and a mid-send guest message hidden by message order; concurrency is handled by the database, not application locks

**Cost:** A network timeout leaves an unknown Answer that a human must reconcile; the operator sees 409 delivery_unknown until then, and there is no automatic retry

### Resolve the office from the membership table on every request, refusing zero or more than one membership

**Alternatives:** Trust session.activeOrganizationId (the kit's default); a subdomain per office; an office picker

**Why:** An audit showed activeOrganizationId is client-writable through the kit's update-user endpoint; a preference cannot grant access; one operator, one office is the MVP shape (ADR 0010)

**Cost:** One extra membership query per request; multi-office operators are a 403 misconfiguration rather than a supported case; the org switcher stays hidden

### Plain Next route handlers for the inbox API instead of the kit's oRPC/Hono procedures

**Alternatives:** oRPC procedures under packages/api with protectedProcedure and TanStack integration

**Why:** The inbox needs raw request bodies for webhook signatures, an office-scoped gate the kit's procedures do not have, and plain fetch is enough for four endpoints

**Cost:** No generated client types or OpenAPI for the inbox; the gate and error shapes are hand-written; two API styles coexist in the same app

### 10-second polling through TanStack Query for the inbox list

**Alternatives:** WebSockets, Server-Sent Events, or a push from the webhook handler

**Why:** Background translation and model drafts land seconds later anyway; an office-sized list is cheap to refetch; no extra infrastructure or connection state

**Cost:** Up to 10 seconds of latency for a new inbound; every open tab refetches even when nothing changed

### View and search in the URL (nuqs), selection and edits in useState, no Zustand or context

**Alternatives:** A Zustand store for all inbox state; React context; everything in the URL

**Why:** Tabs and search are navigation state that should survive refresh and be shareable; selection and half-typed replies are not; nothing outside the Inbox shell reads any of it

**Cost:** Reply edits are lost on refresh; if a second surface ever needs the selection, state will have to be lifted

### A vendor-neutral OpenAI-compatible draft adapter with OpenRouter as the default base URL and no SDK

**Alternatives:** A vendor SDK (the kit ships @ai-sdk with Anthropic and OpenAI); a fixed model id in code

**Why:** Any vendor or a local Ollama is a config change; one prepaid balance is the budget; a model id in code goes stale, so DRAFT_MODEL is required with the key

**Cost:** No streaming or tool-use features; the zod-checked chat-completions shape has to be maintained by hand

### Locale always in the path (/en, /vi) rather than a cookie

**Alternatives:** Cookie-only locale (tried and rejected); Accept-Language negotiation

**Why:** Shareable, cacheable URLs; the operator language also selects the translation column the inbox asks for, so it must be visible in the request

**Cost:** Every internal link and redirect must be locale-aware; bare / is English by design; packages/i18n still carries de, es, fr that the app cannot serve

## Where the docs and the code disagree

- apps/saas/instrumentation.ts docstring still says "The inbox runtime opens SQLite, which only exists on Node"; since ADR 0012 the runtime opens Prisma/Postgres. The Node-runtime gate is still correct, the reason given is stale.
- ARCHITECTURE.md "Inbox modules" table lists `apps/saas/modules/inbox/lib/drafts/` as "Draft adapter: Anthropic or none"; the code (drafts/adapter.ts, drafts/index.ts) has providers `none` and `openai-compatible` only, and the same document's "Drafting and translation" section says so.
- HANDOFF.md go-live checklist says to add `--adopt-unowned` once to pipe:connect; connect-pipe.ts has no such flag and ADR 0012 states adoptUnownedThreads, --adopt-unowned and the seed's adopt step were removed because officeId is required.
- README.md says "Marketing, docs, admin, billing, and organizations are unused kit scaffolding"; HANDOFF.md and ADR 0010 say the kit organization is the office and the admin area (/admin/organizations) is where offices are created and agents invited, and walk-nav.ts lists Admin for platform admins.
- AGENTS.md says the root test task runs Vitest in apps/marketing, apps/saas and packages/api; packages/permissions also has a `test: vitest run` script that Turbo picks up.
- AGENTS.md "Auth & multi-tenancy" says to scope organization data with the active organization helpers under apps/saas/modules/organizations; the inbox rule (office.ts, ADR 0010) is the opposite: the session's active organization is never consulted for access. The AGENTS guidance is kit-generic and does not apply to inbox or home code.
- ARCHITECTURE.md says proxy.ts excludes `api`, `webhooks`, `dev`, `image-proxy`, and `_next`; the matcher also excludes `_vercel` and any path containing a dot.
- apps/saas/config.ts still has `appName: "supastarter for Next.js Demo"`, which is what the `%s – ${config.appName}` title template renders; no doc mentions it.

## Interview questions for this chapter

See [the interview chapter](./07-interview.md) for the 5 questions that target this chapter.
