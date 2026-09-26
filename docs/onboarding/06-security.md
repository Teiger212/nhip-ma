# Security, Tenancy and Operations

_Part of the [onboarding walkthrough](./README.md)._

Nhịp's security model is three closed doors. The first is the session gate: every inbox route handler calls requireInboxSession, which asks Better Auth for the session (401 if none) and then resolves the office from the membership table, never from the session's activeOrganizationId, because that field is a client-writable user preference that the GPT-6-Astra audit showed could be pointed at any organization id. Zero memberships is 403 no_office, more than one is 403 ambiguous_office, and the same resolveOffice function is used by server components (Home). The second door is inbound: both webhook routes go through one handler that verifies the vendor HMAC with a timing-safe compare and fails closed, so a missing secret means every inbound is a 403, and an event on a pipe no office has connected is dropped rather than filed under nobody. The third is outbound: SEND_MODE is mock unless the exact string "live", startup validation in instrumentation.ts throws in production when live lacks the five vendor secrets, a live reply is refused with 409 pipe_not_configured when the thread arrived on a number these process-wide credentials do not own, and WhatsApp free-form sends outside the 24h window are refused. Accounts exist only by invitation, an operator can hold one office, and dev never talks to real guests. What is still open: office deletion cascades to threads but not to operators, credentials are per process not per connection, the draft post-check is a keyword list rather than evidence-checked, and there is no CRM adapter yet.

## The session gate: 401, 403 and why the active organization is never trusted

Inbox route handlers (`/api/conversations`, `/api/conversations/[id]`, `.../approve`, `.../draft`, and `/dev/inbound`) live outside the kit's `(authenticated)` layout and outside oRPC, so nothing checks the session for them. Each one starts with `const gate = await requireInboxSession(request); if (gate.denied) return gate.denied;`.

`requireInboxSession` (`apps/saas/modules/inbox/lib/require-session.ts`) does two things. It calls `auth.api.getSession({ headers: request.headers })` and returns a JSON `{ error: "unauthorized" }` with status 401 when there is no session. Then it calls `resolveOffice(session.user.id)` and turns a denial into a 403 with `{ error: "no_office" | "ambiguous_office", message }`. On success it returns a viewer `{ userId, officeId }` that every store call takes: `store.listConversations(gate.viewer)` filters `where: { officeId }`, and `store.getConversation(id, viewer)` returns null when `conversation.officeId !== viewer.officeId`, so a thread in another office is a 404, not a 403 (no existence leak).

Why membership and not the session's active organization: Better Auth's `session.create.before` hook in `packages/auth/auth.ts:89-98` copies `user.lastActiveOrganizationId` into `session.activeOrganizationId`. `lastActiveOrganizationId` is declared as an additional user field (`auth.ts:202`), which the kit's `/api/auth/update-user` lets the signed-in user write. The 2026-09-20 audit's critical finding #1 showed the earlier gate trusted that value, so a user could set it to a victim office id, sign in again and read, draft and approve that office's threads; removed members also kept access through a stale value. ADR 0010 answered: "a preference cannot grant access." The test `require-session.test.ts` pins this: a session whose `activeOrganizationId` is `victim-office` resolves to the one real membership `office-a`, and with no memberships it is 403 `no_office`.

The cost is one `member.findMany` per request. The gain is that revoking a membership takes effect on the next request, with no session invalidation needed. Note the kit's own `(authenticated)/layout.tsx` still reads `session.session.activeOrganizationId` to compute a Permix membership role for kit screens; the inbox never uses that path.

Sources: `apps/saas/modules/inbox/lib/require-session.ts`, `apps/saas/modules/inbox/lib/require-session.test.ts:40-53`, `packages/auth/auth.ts:87-99`, `packages/auth/auth.ts:192-206`, `packages/database/inbox/store.ts:231-249`, `apps/saas/app/api/conversations/[id]/approve/route.ts`, `docs/adr/0010-office-assignment.md`, `apps/saas/app/[locale]/(authenticated)/layout.tsx:24-40`

## Office resolution shared by the API and server components

`resolveOffice(userId)` in `apps/saas/modules/inbox/lib/office.ts` is the single definition of "which office is this person in". It calls `getOrganizationMembershipsForUser` (`packages/database/prisma/queries/organizations.ts:108`, a `member.findMany` ordered by `createdAt`) and returns one of three shapes: `{ officeId }` for exactly one row, `{ denied: "no_office" }` for zero, `{ denied: "ambiguous_office" }` for more than one (with a `console.warn` naming the user and the offices). The ADR 0010 stance is that two memberships is a misconfiguration to fix, not a case to pick from, so there is no "first membership wins" and no picker.

Two callers, one rule. The API gate wraps the result into HTTP statuses. Home is a server component, so `apps/saas/modules/home/lib/funnel.ts` calls `getSession()` from `@auth/lib/server` (a React-cached `auth.api.getSession` with `disableCookieCache: true`) and then the same `resolveOffice`; a denial becomes a translated empty state (`saas.json` keys `no_office`, `ambiguous_office`) instead of a number. That is deliberate: Home must never show a figure that is not scoped to one office. The funnel then runs `store.funnel({ userId, officeId }, { since })`, a single raw SQL query with `WHERE "c"."officeId" = ${viewer.officeId}`.

Tenancy on disk (ADR 0008, 0010, 0012): `Conversation.officeId` is required and references `Organization` with `onDelete: Cascade`; the unique key is `(officeId, pipe, guestId)` and the id is the string `office:pipe:guest` because it is part of every route. `upsertInbound` finds a thread by the triple, never by the id's shape, so the same guest at two offices is two threads (audit finding #2, fixed; `store.test.ts:85` "the same guest at two offices never merges"). The kit organization is the office; `hideOrganization: true`, `enableUsersToCreateOrganizations: false` and `requireOrganization: false` in `packages/auth/config.ts` keep the switcher hidden and let the inbox resolve the office itself.

The store still accepts an optional viewer on `listConversations`/`getConversation` (unscoped reads for seed, scripts and tests). The audit warned this makes future callers easy to get wrong; every HTTP caller today passes the viewer, and `funnel` requires one.

Sources: `apps/saas/modules/inbox/lib/office.ts`, `apps/saas/modules/home/lib/funnel.ts`, `apps/saas/modules/auth/lib/server.ts:7-16`, `packages/database/prisma/queries/organizations.ts:108-113`, `packages/database/prisma/schema.prisma:289-310`, `packages/database/inbox/store.ts:251-260`, `packages/database/inbox/store.ts:513-541`, `packages/auth/config.ts`, `apps/saas/modules/inbox/lib/store.test.ts:63-115`, `docs/adr/0008-office-is-the-tenant.md`

## Inbound: webhook signatures that fail closed, and pipe connections

There are two webhook routes and one handler. `apps/saas/app/webhooks/whatsapp/route.ts` and `.../zalo/route.ts` only name the pipe: `POST` is `handleInboundWebhook("whatsapp" | "zalo", request)`. WhatsApp's `GET` is Meta's subscription handshake: it echoes `hub.challenge` only when `hub.mode === "subscribe"` and `hub.verify_token` equals `WHATSAPP_VERIFY_TOKEN`, otherwise 403. Both routes are excluded from the locale proxy matcher in `apps/saas/proxy.ts` (as are `api`, `dev`, `image-proxy`), so no locale redirect can eat a vendor callback.

`handleInboundWebhook` (`pipes/webhook.ts`) reads the raw body as text first, because HMACs are over bytes, then calls `adapter.verifyInbound(raw, headers, config)`. A false is `403 "bad signature"` before anything is parsed or stored (`webhook.test.ts:93`). Only then does it `JSON.parse` (a bad body becomes `{}`), `parseInbound` (zod `safeParse` everywhere, unknown keys dropped, one malformed entry skipped rather than sinking the batch) and `ingestEvents`.

Verification (`pipes/vendors.ts`): WhatsApp is `X-Hub-Signature-256: sha256=<hex>`, HMAC-SHA256 of the raw body with `WHATSAPP_APP_SECRET`. Zalo is `X-ZEvent-Signature: mac=<hex>`, plain `sha256(app_id + rawBody + timestamp + ZALO_OA_SECRET_KEY)` where `app_id` and `timestamp` come from the body. Both compare with `hexEqual`, which rejects non-hex, checks length, then `crypto.timingSafeEqual`. Both begin with `if (!secret) return false; if (!header) return false;`: that is "fails closed". The 2026-09-06 audit found Zalo's secret was documented but never read; commit `fb173be` added verification, and `.env.local.example` now states the 403 behaviour above each secret.

Tenancy on the way in (`inbox.ts:ingestEvents`): each parsed event carries `pipeExternalId`, the office's side of the pipe (WhatsApp `metadata.phone_number_id`; for Zalo the recipient of a guest message or the sender of an OA echo). `store.officeForPipe(pipe, externalId)` looks up `PipeConnection` (`@@id([pipe, externalId])`, `officeId` cascade to Organization). No row means the event is dropped with `console.warn("inbox: inbound dropped, no office owns this pipe")` and the route still answers 200 so the vendor does not retry forever (`webhook.test.ts:56`). Connections are made once with `pnpm --filter saas pipe:connect -- --pipe whatsapp --external-id <phone_number_id> --office <organization id>` (`scripts/connect-pipe.ts`, an upsert). Each message stores the endpoint it travelled through in `Message.pipeExternalId`, which the outbound check reads.

Sources: `apps/saas/app/webhooks/whatsapp/route.ts`, `apps/saas/app/webhooks/zalo/route.ts`, `apps/saas/modules/inbox/lib/pipes/webhook.ts`, `apps/saas/modules/inbox/lib/pipes/vendors.ts:209-260`, `apps/saas/modules/inbox/lib/pipes/vendors.ts:52-64`, `apps/saas/modules/inbox/lib/pipes/webhook.test.ts`, `apps/saas/modules/inbox/lib/inbox.ts:91-113`, `apps/saas/modules/inbox/scripts/connect-pipe.ts`, `packages/database/prisma/schema.prisma:401-410`, `apps/saas/proxy.ts:18-20`, `reports/2026-09-06-handoff-analysis.md`

## Outbound: SEND_MODE, startup validation, pipe_not_configured and the 24h window

The mock|live seam is one function, `transmit` in `pipes/index.ts`: `if (input.config.sendMode !== "live") return { mock: true, ... vendorMessageId: "mock-<now>" }`, else `pipeAdapter(pipe).send(...)`. `resolveSendMode` in `config.ts` returns `"live"` only for the exact string `live`; anything else, including unset, is mock, whatever credentials exist. The env schema's `superRefine` also rejects any `SEND_MODE` other than `mock`/`live` (so `Live` is a config error, not a silent mock), and when live it requires `WHATSAPP_APP_SECRET`, `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `ZALO_OA_ACCESS_TOKEN`, `ZALO_OA_SECRET_KEY`. It also requires `NEXT_PUBLIC_SAAS_URL` (https in production), `BETTER_AUTH_SECRET` of 32+ chars that is not the `.env.local.example` placeholder, `DRAFT_MODEL` whenever `DRAFT_API_KEY` is set, and forbids `AUTH_TRUSTED_ORIGINS` in production.

Where it runs: `apps/saas/instrumentation.ts` `register()`, once per Node server instance (skipped on the edge runtime). `validateInboxEnv` never throws; instrumentation prints every `[env]` error and throws only when `NODE_ENV === "production"`, so a bad deploy never serves, while local dev keeps running. On success `installInboxConfig` stores the settled config on `globalThis`, and `getRuntime()` hands it to every route and adapter, so nothing downstream reads `process.env`.

`approveAndSend` (`inbox.ts:209`) refuses in this order: 404 not found (viewer-scoped); 409 `already_answered` or `delivery_unknown` when nothing is open; 400 `inbound_required`; 409 `stale_target` when the named inbound is not the open one; 400 `empty_reply`; then the adapter's `sendWindow`; then the endpoint check; then `beginAnswer` writes the Answer row before any vendor call.

The 24h window (`whatsappWindowState`, `WA_WINDOW_MS = 24*60*60*1000`): WhatsApp only allows free-form messages within 24h of the last guest inbound; outside it Meta requires an approved template, and Nhịp v1 does not invent templates, so the reply is `409 outside_24h_window` (or `no_inbound` if the thread has none). Zalo's window is always open. Tested at `approve.test.ts:373`.

`pipe_not_configured` (ADR 0010): credentials are process-wide for the pilot. `latestGuestEndpoint` reads the `pipeExternalId` of the last inbound; when `sendMode === "live"` and `adapter.ownsEndpoint(endpoint, config)` is false, the reply is `409 pipe_not_configured` with nothing recorded. WhatsApp owns an endpoint when it equals `WHATSAPP_PHONE_NUMBER_ID`; Zalo when `ZALO_OA_ID` is unset (not checked) or equal. Audit finding #3 (B's reply leaving through A's identity) is closed this way; `approve.test.ts:539` proves it. Vendor error bodies are logged in the approve route and never echoed to the client.

Sources: `apps/saas/modules/inbox/lib/pipes/index.ts:82-98`, `apps/saas/modules/inbox/lib/config.ts:29-154`, `apps/saas/modules/inbox/lib/config.ts:190-192`, `apps/saas/instrumentation.ts`, `apps/saas/modules/inbox/lib/runtime.ts`, `apps/saas/modules/inbox/lib/inbox.ts:153-162`, `apps/saas/modules/inbox/lib/inbox.ts:209-273`, `apps/saas/modules/inbox/lib/pipes/vendors.ts:7-37`, `apps/saas/modules/inbox/lib/approve.test.ts:373-385`, `apps/saas/modules/inbox/lib/approve.test.ts:539-570`, `apps/saas/app/api/conversations/[id]/approve/route.ts:33-41`

## Accounts: invitation-only signup, one office per operator, the admin, and dev hygiene

Public sign-up is closed. `packages/auth/config.ts` sets `enableSignup: false` with the comment "an account exists because Nhịp invited it into an office" (ADR 0010). The kit's `invitationOnlyPlugin` (`packages/auth/plugins/invitation-only/index.ts`) hooks `/sign-up/email` and throws `BAD_REQUEST INVALID_INVITATION` unless `getPendingInvitationByEmail(email)` finds one. Because signup is invitation-only, `autoSignIn: !config.enableSignup` is true and `requireEmailVerification` false: the invitation already proved the address. The organization plugin's `sendInvitationEmail` sends existing users to `/login` and new ones to `/signup`, both with `invitationId` and `email` in the query.

The second-office refusal is a `hooks.before` middleware in `auth.ts:151-166`: on `/organization/accept-invitation`, if the signed-in user already has any membership, it throws `APIError("FORBIDDEN", { code: "ONE_OFFICE_PER_OPERATOR" })`. The comment states the reason: the gate would refuse an ambiguous operator anyway, so refuse at the source and keep the membership table true.

Who creates offices: a platform admin, meaning `user.role === "admin"` (Better Auth `admin()` plugin). The admin layout checks `checkPermission({ user }, "admin.access")` (`packages/permissions/create-permission-rules.ts:39` is `isGlobalAdmin = user?.role === "admin"`) and redirects otherwise; the sidebar shows the Admin row only to admins (`walk-nav.ts`). Operators never create or pick an office.

Seed logins (`pnpm seed`): `walk@nhip.local` (role `user`, member) and `admin@nhip.local` (role `admin`, owner), password `walkthrough`, both `emailVerified: true` with a `credential` account, in organization `walk-office` (fixed id, slug `walk`). There is no auth bypass; commit `b774be7` removed the walk-bypass route. HANDOFF's go-live step is to delete both seed users from any shared database and set `role = "admin"` on your own user.

Never messaging real guests from dev is enforced by defaults, not policy alone: `SEND_MODE` defaults to `mock`, `mock` never calls a vendor regardless of credentials, and `POST /dev/inbound` (`isDevInboundEnabled` is `NODE_ENV !== "production"`) is 404 in production, needs a session, validates its body with zod, and files under the caller's own office. Other hardening from commit `06ea3c1`: `baseURL` is `NEXT_PUBLIC_SAAS_URL` and the only trusted origin (`AUTH_TRUSTED_ORIGINS` is a tunnel convenience, banned in production); social providers appear only when both halves of the credential are set; session cookie max age is 30 days; `generateId: false` leaves ids to Prisma. Rate limiting is Better Auth's default (memory store, production only), which suits one long-lived process; behind a proxy, set `ipAddressHeaders`/`trustedProxies`.

Sources: `packages/auth/config.ts`, `packages/auth/plugins/invitation-only/index.ts`, `packages/auth/auth.ts:151-166`, `packages/auth/auth.ts:226-231`, `packages/auth/auth.ts:285-308`, `packages/auth/auth.ts:36-75`, `packages/permissions/create-permission-rules.ts:39-47`, `apps/saas/app/[locale]/(authenticated)/(main)/(account)/admin/layout.tsx`, `apps/saas/modules/inbox/scripts/seed-walk-user.ts`, `apps/saas/modules/inbox/scripts/seed-walk-office.ts`, `apps/saas/modules/inbox/lib/walk-user.ts`, `apps/saas/app/dev/inbound/route.ts`, `apps/saas/modules/inbox/lib/dev.ts`, `apps/saas/modules/inbox/lib/approve.test.ts:386-395`

## Go-live checklist and day-two operations

HANDOFF.md's "Before going live" is the operational contract. Accounts, and which need the company entity: a Meta developer app with WhatsApp Business (Business Verification before real traffic; provides `WHATSAPP_*`), a Zalo Official Account plus developer app (OA verification needs a registered Vietnamese business; provides `ZALO_OA_*`), an Attio workspace and API key for the CRM adapter (not built yet), an OpenRouter account or any OpenAI-compatible endpoint for `DRAFT_API_KEY`/`DRAFT_MODEL`/`DRAFT_BASE_URL` (prepaid balance doubles as budget), Resend or another mail provider for magic links and invitations (verified sending domain), and Google/GitHub OAuth apps only if social login stays. Better Auth itself needs no account. The office is created in-app.

Environment, in the order the code checks it: `BETTER_AUTH_SECRET` from `openssl rand -base64 32` (32+ chars, not the placeholder); `NEXT_PUBLIC_SAAS_URL` as the public https origin, with `BETTER_AUTH_URL` and `AUTH_TRUSTED_ORIGINS` unset; the five vendor secrets plus `WHATSAPP_VERIFY_TOKEN` for Meta's handshake; `SEND_MODE=live` only after those; `ZALO_OA_ID` so replies on any other OA are refused. Startup validation (`instrumentation.ts`) throws in production on any of these, so the deploy itself is the check.

Pipes: run `pipe:connect` once per number and per OA with the office's organization id, otherwise every inbound is dropped with a warn line. Then confirm the WhatsApp `GET /webhooks/whatsapp` handshake and send a signed test event.

Database: ADR 0012 keeps `prisma db push` for development only; before the first production deploy, baseline the schema with `prisma migrate` and point `DATABASE_URL` at production Postgres. Auth and inbox tables share one database, so one backup covers both. CI (`.github/workflows/ci.yml`) runs lint, format:check, type-check and the vitest suite against a `postgres:16` service with `supastarter_test`; every store test truncates `inbox_conversation` and `inbox_pipe_connection` with CASCADE first.

Day two: an Answer in status `unknown` (network failure, timeout, or vendor success whose record failed) is never retried by the app; the operator sees `409 delivery_unknown` until someone reconciles against the vendor and clears it in the database. A `failed` Answer (vendor refused, or missing credentials, both `SendError`) may be approved again on the same row. Removing an operator from an office is done in the kit admin; their next request is `403 no_office`. Vendor error bodies are only in server logs. Seed threads are deleted by removing the office's threads in the database; `pnpm seed` is idempotent.

Sources: `HANDOFF.md:79-140`, `apps/saas/modules/inbox/lib/config.ts:48-154`, `apps/saas/instrumentation.ts:20-32`, `apps/saas/modules/inbox/scripts/connect-pipe.ts`, `docs/adr/0012-inbox-on-prisma.md`, `packages/database/inbox/testing.ts:63`, `.github/workflows/ci.yml:14-30`, `apps/saas/modules/inbox/lib/inbox.ts:300-338`, `packages/database/inbox/store.ts:362-420`

## The GPT-6-Astra audit: what it found, what is closed, what is open

`reports/2026-09-20-gpt6-astra-architecture-audit.md` was a read-only Codex run (model `gpt-6-astra`, high reasoning) against PR #22, verifying with isolated executions. Its headline: the build order was right but office tenancy was not secure enough for the next build. Eight findings, ranked.

Closed in PR #22 (ADR 0010, commit `ad768a5`):

1. Critical, forged active organization: fixed by `resolveOffice` reading memberships on every request; regression test in `require-session.test.ts`.
2. High, same guest at two offices merged: fixed by the `(officeId, pipe, guestId)` unique key and `office:pipe:guest` ids; `store.test.ts:85`.
3. High, replies on global credentials: partially fixed by `Message.pipeExternalId` plus `ownsEndpoint` and `409 pipe_not_configured`; per-connection credentials remain the multi-office step the ADR names.

Closed in PR #23 (ADR 0011, commit `ff49ab9`): 4. High, approval not bound to message or text: `approve` now requires `inboundId` and non-blank `reply`; `409 stale_target`, `400 inbound_required`, `400 empty_reply`; the reply box keys edits by the guest message. 5. High, double transmission after a record failure: the Answer row is written in `sending` before the vendor call; record failure marks it `unknown` and the retry is refused (`approve.test.ts:241-249`). 6. High, inbound during transmission vanishing from Your turn: `unansweredInboundId` is derived from Answers plus OA echoes, not message order (`store.ts:173-184`, `store.test.ts:254`). 7. Medium, guest profile name forging prompt context: `guest_name` now passes through `asData` like message bodies (`prompts.ts:58`; CHANGELOG names finding 7).

Open: 8. Medium, the draft post-check does not enforce factual guardrails: `guardrails.ts` still checks only length (600 chars) and a paperwork/ownership term list; an invented price or a legal promise passes. Human approval is the backstop; evidence-checked drafts need office-provided facts that do not exist yet.

The audit's "before the next build" list: item 1 (office boundary) done; item 2 (send contract) done; item 3 (migration ledger, cross-store lifecycle) resolved differently, since ADR 0012 moved the inbox into Postgres under Prisma with real cascades, against the audit's "retain SQLite" advice; item 4 (office-scoped aggregate query) done as `store.funnel` raw SQL, though mock Answers are still counted and reporting timezone is unaddressed; item 5 (CRM seam) not started; item 6 (evidence boundaries, adversarial multilingual evals) only the escaping part done.

Sources: `reports/2026-09-20-gpt6-astra-architecture-audit.md`, `CHANGELOG.md:1-40`, `apps/saas/modules/inbox/lib/require-session.test.ts`, `apps/saas/modules/inbox/lib/store.test.ts:85-115`, `apps/saas/modules/inbox/lib/store.test.ts:254-282`, `packages/database/inbox/store.ts:166-184`, `apps/saas/modules/inbox/lib/drafts/guardrails.ts`, `apps/saas/modules/inbox/lib/drafts/prompts.ts:17-23`, `apps/saas/modules/inbox/lib/drafts/prompts.ts:58`, `apps/saas/modules/inbox/lib/approve.test.ts:150-320`, `docs/adr/0012-inbox-on-prisma.md`

## Known gaps to say out loud

Office delete does not cascade to operators. `Conversation.officeId` and `PipeConnection.officeId` cascade from `Organization` (`store.test.ts:320` proves threads and pipe rows go), and `Member` rows cascade too because the kit's `Member.organizationId` is `onDelete: Cascade`. What stays is the `User` row: a removed office leaves its agents with a login and no office, and the gate answers `403 no_office`. ADR 0012 records this as "a separate decision (a later ADR)". `Answer.operatorId` is deliberately `SetNull` so the record of a send outlives the account.

Per-connection credentials. `PipeConnection` maps an endpoint to an office but carries no token. `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `ZALO_OA_ACCESS_TOKEN` and `ZALO_OA_ID` are process-wide, so one live deployment can send for one WhatsApp number and one OA. A second office's threads can be received and read but any live reply is `409 pipe_not_configured`. The adapter interface already isolates this: `ownsEndpoint` and `send` take `config`, so moving credentials onto the connection changes those two functions and the store, not the routes.

Evidence-checked drafts. `checkFollowUp` is a regex over paperwork vocabulary in six scripts plus a 600-character cap. It cannot tell an invented viewing slot from a real one. The prompt frames guest text as data and strips the framing tags (`asData`), which handles injection of the tag-breaking kind, not persuasion. Until the office can supply listing facts, the first reply stays a template and only follow-ups go to the model (ADR 0005), and every send is human-approved.

No CRM adapter. ADR 0003 designs the seam (`findLeadForConversation`, `outcomeFor`, `listOutcomes`, with a mock adapter and Attio as the provisional first vendor, phone-first matching, no name matching). Nothing implements it; Home shows "Connect your CRM" for closings and lost, and no thread ever leaves the queue because of an outcome. HANDOFF's next step after the funnel is this adapter.

Smaller items: the funnel counts `mock` Answers as `sent` (fine in a mock-only pilot, wrong once live and mock coexist); dropped inbounds on unconnected pipes leave only a warn line, so a misconfigured webhook loses guest messages quietly; `ambiguous_office` is a hard 403 with no operator self-service; the inbox client surfaces a 403 as a generic error string, not a dedicated screen (only Home has copy for it); Better Auth's rate limiter keys on the connection IP until `trustedProxies` is set.

Sources: `packages/database/prisma/schema.prisma:158-170`, `packages/database/prisma/schema.prisma:377-410`, `apps/saas/modules/inbox/lib/store.test.ts:320-330`, `docs/adr/0012-inbox-on-prisma.md`, `apps/saas/modules/inbox/lib/pipes/index.ts:20-36`, `apps/saas/modules/inbox/lib/drafts/guardrails.ts`, `apps/saas/modules/inbox/lib/drafts/prompts.ts:17-23`, `docs/adr/0003-crm-adapter.md`, `packages/database/inbox/store.ts:513-563`, `apps/saas/modules/inbox/lib/inbox.ts:96-107`, `apps/saas/modules/inbox/lib/inbox-queries.ts:27-29`, `packages/auth/auth.ts:72-75`

## Key facts

- requireInboxSession returns 401 with no session and 403 with error no_office (zero memberships) or ambiguous_office (more than one); every inbox route handler and /dev/inbound starts with it.
- The session's activeOrganizationId is never consulted for access because it is copied from user.lastActiveOrganizationId, a client-writable additional field; the audit's critical finding #1 exploited exactly that.
- resolveOffice reads the Member table on every request and is shared by the API gate and Home's server component, so a revoked membership takes effect on the next request.
- Store reads are viewer-scoped: listConversations filters by officeId and getConversation returns null for another office's thread, so cross-office access is a 404.
- Thread identity is (officeId, pipe, guestId) with a unique index and id office:pipe:guest; the same guest at two offices is two threads (audit finding #2).
- Both webhooks go through handleInboundWebhook, which reads the raw body, verifies the vendor signature with a timing-safe compare, and returns 403 before parsing; a missing WHATSAPP_APP_SECRET or ZALO_OA_SECRET_KEY rejects every inbound.
- WhatsApp signs X-Hub-Signature-256 as HMAC-SHA256 of the body; Zalo signs X-ZEvent-Signature as sha256(app_id + body + timestamp + OA secret).
- Inbound on a pipe with no PipeConnection row is dropped with a warn line and a 200; connections are set by pnpm --filter saas pipe:connect and cascade-delete with the office.
- SEND_MODE is live only for the exact string "live"; transmit returns a mock result for anything else regardless of credentials, and the env schema rejects any third value.
- instrumentation.ts validates env once per Node server, throws in production and only logs in dev; live requires five vendor secrets, and BETTER_AUTH_SECRET must be 32+ chars and not the example placeholder.
- A live reply is refused with 409 pipe_not_configured when the last inbound's pipeExternalId is not WHATSAPP_PHONE_NUMBER_ID (or ZALO_OA_ID when set), because credentials are process-wide in the pilot.
- WhatsApp free-form sends outside 24h of the last guest inbound are 409 outside_24h_window; Nhịp does not invent templates; Zalo's window is always open.
- Sign-up is invitation-only (enableSignup false plus the invitation-only plugin), accepting a second office's invitation throws ONE_OFFICE_PER_OPERATOR, and only a user with role admin can create offices in /admin/organizations.
- Seed logins walk@nhip.local (member) and admin@nhip.local (owner, role admin), password walkthrough, office walk-office; remove them from any shared database before go-live.
- Go-live: create Meta, Zalo OA, OpenRouter, Resend accounts; set the secrets and ZALO_OA_ID; connect each pipe; baseline the schema with prisma migrate instead of db push.

## Trade-offs

### Resolve the office from the membership table on every request

**Alternatives:** Trust session.activeOrganizationId (what the kit and the first tenancy PR did); cache the office in the session and invalidate on membership change

**Why:** activeOrganizationId derives from a client-writable user field, so it can name any organization; membership is the only fact that grants access, and reading it per request makes revocation immediate (ADR 0010, audit finding #1)

**Cost:** One extra member.findMany per inbox request and per Home render; no organization switcher and no multi-office operator until a later ADR

### Webhook verification fails closed: no secret means every inbound is 403

**Alternatives:** Accept unsigned inbound when no secret is configured (the original state for Zalo, where the secret was documented but never read)

**Why:** An unverified webhook lets anyone inject guest messages into an office's inbox and trigger translations and model drafts; a missing secret is a misconfiguration, not a permission

**Cost:** Real vendor webhooks cannot be exercised locally without the secrets; development relies on POST /dev/inbound instead

### Drop inbound on a pipe no office has connected, answering 200

**Alternatives:** File under an unowned or default office (the old INBOX_OWNER_USER_ID fallback); return an error so the vendor retries

**Why:** Every thread must have an office from birth (ADR 0012); unowned data was the source of the visible-to-everyone fallback, and a non-200 would make Meta retry a message that can never be filed

**Cost:** A forgotten pipe:connect loses guest messages with only a console.warn as evidence

### Process-wide vendor credentials with a 409 pipe_not_configured guard

**Alternatives:** Store credentials per PipeConnection and select them per thread (the audit's smallest fix)

**Why:** The pilot is one agency with one number and one OA; the guard closes the wrong-identity send now and the adapter interface (ownsEndpoint, send taking config) leaves the per-connection move local

**Cost:** One live deployment serves one office's endpoints; a second office's threads are readable but unanswerable until per-connection credentials exist

### SEND_MODE mock by default, live only for the exact string, validated at startup

**Alternatives:** Infer live from the presence of credentials; a boolean flag; per-request override

**Why:** Never messaging real guests from dev is a product rule; a mode that is mock unless spelled exactly, plus a production-fatal validation when live lacks secrets, makes an accidental live send require two deliberate mistakes

**Cost:** Startup validation lives in instrumentation.ts (Node runtime only) and scripts fall back to unvalidated config; a dev with SEND_MODE=live and real tokens is still trusted

### Invitation-only signup, one office per operator, ambiguous_office is a hard 403

**Alternatives:** Self-serve signup with organization creation (the kit default); a picker when a user has several memberships

**Why:** Nhịp assigns offices (ADR 0010); an account exists because it was invited, so the membership table is always true and the gate never has to choose

**Cost:** No self-service onboarding; a mis-invited operator needs Nhịp to fix the memberships before they can work

### An Answer of unknown outcome is never retried by the app

**Alternatives:** Retry on any exception (what the pre-ADR-0011 code did); retry with idempotency keys against the vendor

**Why:** A vendor success followed by a record failure was reproduced as a double send; writing the Answer before the vendor call and freezing it as unknown guarantees at most one transmission per guest message

**Cost:** Operational toil: a person must reconcile against the vendor and clear the row; the operator sees 409 delivery_unknown until then

### Move the inbox into Postgres under Prisma with cascade deletes (ADR 0012)

**Alternatives:** Keep SQLite with a migration ledger and explicit cross-store lifecycle handling (the audit's recommendation)

**Why:** Office deletion could not cascade across two databases, every inbox change was a hand migration, and a SQLite file ruled out any second instance

**Cost:** Tests need a real Postgres (supastarter_test, serial files); db push remains dev-only so a migrate baseline is a go-live step; office delete still leaves operators' user rows behind

## Where the docs and the code disagree

- HANDOFF.md:128 tells the go-live operator to add `--adopt-unowned` once to pipe:connect; connect-pipe.ts has no such flag and ADR 0012 removed adoptUnownedThreads, so the instruction is stale.
- apps/saas/instrumentation.ts:9 comment says 'The inbox runtime opens SQLite, which only exists on Node'; since ADR 0012 the runtime opens Prisma/Postgres. The Node-only lazy import is still correct, the reason given is not.
- AGENTS.md 'Auth & multi-tenancy' says to scope organization data with the active organization helpers under apps/saas/modules/organizations; for the inbox that contradicts ADR 0010 and office.ts, which forbid using the active organization for access. The kit guidance applies to kit screens only.
- AGENTS.md:77 says startup env validation lives in apps/saas/modules/shared/lib/env.ts; that file is now a re-export shim and the schema lives in apps/saas/modules/inbox/lib/config.ts.
- CHANGELOG.md 2026-09-20 first bullet block says the gate resolves 'the session's active organization, else the first membership' and that pre-tenancy threads 'wait unowned until adoptUnownedThreads runs'; both are superseded later in the same release (ADR 0010 bullet) and by ADR 0012. Read as history, not current behaviour.
- HANDOFF.md:11 says 'The audit that shaped the current code is reports/2026-09-06-handoff-analysis.md'; the tenancy and send-contract code was shaped by reports/2026-09-20-gpt6-astra-architecture-audit.md, which HANDOFF does not mention.
- reports/2026-09-20 audit recommends 'retain SQLite' and a migration version ledger; ADR 0012 chose Postgres/Prisma instead, so the audit's item 3 is resolved by a different route, and its finding #3 (per-connection credentials) and #8 (evidence-checked drafts) remain open.
- HANDOFF.md states rate limiting 'is on by default with a memory store'; auth.ts sets no rateLimit option, so this is Better Auth 1.6.29's default, which is enabled only when NODE_ENV=production and is off in development.

## Interview questions for this chapter

See [the interview chapter](./07-interview.md) for the 5 questions that target this chapter.
