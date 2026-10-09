# Data model and the store: eight inbox_* tables, one Answer per guest message, one seam

_Part of the [onboarding walkthrough](./README.md)._

The inbox lives in the same Postgres as the supastarter kit's auth tables, as eight Prisma models mapped to inbox_* tables: Conversation, Message, Translation, Qualification, Draft, Paperwork, Answer and PipeConnection. The office (the kit's Organization) is the tenant: Conversation and PipeConnection reference it with cascade delete, and a thread's identity is the triple (office, pipe, guest), spelled office:pipe:guest in the id because that id is in every route. The Answer is the record of a send: one row per guest message, unique on inboundId, written in status "sending" before the vendor is called and then moved to sent, failed or unknown. Because of that, "Your turn" is derived from Answers rather than message order, a concurrent approve is refused by the unique index (Prisma P2002 becomes in_progress), and a vendor success whose record fails is never resent. The funnel is one raw SQL query with two CTEs, cohorted by first inbound inside the office, with nearest-rank median and p90 computed in JavaScript on the returned durations. Everything above the store talks to an InboxStore interface, which is why the September 2026 move from a hand-written SQLite file to Prisma (ADR 0012) changed the store and the tests but not the routes, the approve path, Home or the seed. Tests run against a second database, supastarter_test, pushed once by a vitest global setup, truncated before each test, with fixture offices and operators upserted because the foreign keys demand them, and with test files run serially because they share one database.

## The eight inbox models and their cascades

The inbox section of `schema.prisma` starts at line 251 with a comment naming the rule: inbox tables carry the `inbox_` prefix (`@@map("inbox_conversation")` and so on) so they never collide with the kit's `user`, `session`, `organization`, `member` tables that share the database.

**Conversation** (`inbox_conversation`): `id String @id` (the `office:pipe:guest` text), `pipe Pipe`, `guestId`, `guestName?`, `officeId` → `Organization` with `onDelete: Cascade`, `language String?`, `lastGuestInboundAt?`, `sentAt?`, `updatedAt DateTime` (no `@updatedAt`; the store sets it by hand, and on an inbound it is the event's `at`, not the wall clock, which is what `listConversations` orders by). `@@unique([officeId, pipe, guestId])` is the real identity; `@@index([officeId])` serves the office-scoped list.

**Message** (`inbox_message`): app-generated cuid2 id, `seq Int @unique @default(autoincrement())` as the tiebreak where SQLite used `rowid`, `conversationId` cascade, `direction MessageDirection`, `source MessageSource`, `text`, `at`, `vendorMessageId?` (dedupe key on webhooks), `mock Boolean`, `pipeExternalId?` (the office endpoint it travelled through, ADR 0010).

**Translation**: composite `@@id([messageId, locale])`, cascade from Message. **Qualification**, **Draft**, **Paperwork**: one-to-one on `conversationId @id`, cascade from Conversation; together with `Conversation.language` they form the domain's `OneShot`, which `mapConversation` only builds when all four exist.

**Answer** (`inbox_answer`): cuid2 id, `seq`, `conversationId` cascade, `inboundId String @unique` → Message cascade, `text`, `operatorId?` → `User` with `onDelete: SetNull` (the record of a send outlives the operator), `status AnswerStatus`, `mock`, `pipe`, `to`, `pipeExternalId?`, `vendorMessageId?`, `approvedAt`, `sentAt?`, `failedAt?`, `failureReason?`.

**PipeConnection** (`inbox_pipe_connection`): `@@id([pipe, externalId])`, `officeId` → Organization cascade. It answers "which office owns this WhatsApp phone-number id or Zalo OA id", which is how a webhook files a thread.

The cascade graph means `TRUNCATE "inbox_conversation", "inbox_pipe_connection" CASCADE` empties the whole inbox, and `organization.delete` takes threads and pipes with it (proved by the last test in `store.test.ts`). `Organization` and `User` gained back-relation arrays (`conversations`, `pipeConnections`, and `Answer` on User) for this.

Sources: `packages/database/prisma/schema.prisma:251-411`, `packages/database/prisma/schema.prisma:140-156`, `packages/database/inbox/store.ts:51-57`, `apps/saas/modules/inbox/lib/store.test.ts:320-329`

## Enums versus zod-validated text: where the vocabulary lives

ADR 0012 draws the line: closed vocabularies are Prisma enums, open ones are text validated by zod. Enums on disk: `Pipe { zalo whatsapp }`, `MessageDirection { in out }`, `MessageSource { guest oa_echo nhip }`, `DraftSource { template model }`, `AnswerStatus { sending sent failed unknown }`. Text on disk: `Conversation.language` (GuestLanguage: en, vi, ja, ko, ru), `Translation.locale` (OperatorLanguage: en, vi), `Qualification.rentOrBuy` (rent, buy). The reason is operational: a new guest language should not require a schema push; a new pipe or Answer status genuinely is a schema change.

The single source of the vocabulary is `packages/database/inbox/schema.ts`: each name is both a zod schema and its inferred type (`export const Pipe = z.enum([...]); export type Pipe = z.infer<typeof Pipe>`). `types.ts` only borrows those types; `index.ts` re-exports them by name so `import type { Pipe }` and `import { Pipe }` both work. This came from two commits before the Prisma move (`dcd319b`, `0210ff7`): the unions used to exist twice, as hand-written TS unions and as unchecked `as` casts, with nothing validating at runtime once the Drizzle schema was dropped. The approve test "the pipe vocabulary is single-sourced in schema.ts" drives a loop off `Pipe.options` so adding a member to schema.ts fails any consumer that restated the old list.

At the store boundary, `vocab(schema, value, where)` parses the text columns on read and throws "holds a value outside the vocabulary" instead of passing corrupt state into the domain. The store is the only writer, so a bad value is a bug, and failing at the read is the honest response.

One spelling difference is deliberate: the domain says `oa-echo` (an agent replying from the OA app), Postgres enums cannot hold a hyphen, so the disk says `oa_echo`. `DbMessageSource` exists only in `schema.ts` and is not exported from `index.ts`; `toDbSource`/`fromDbSource` in `store.ts` are the only translators. `SendMode` (`mock | live`) stays a plain TS union because nothing persists or parses it.

Timestamps: columns are `DateTime` (timestamptz); the domain sees `Date#toISOString` strings, validated as `Timestamp = z.iso.datetime()`. `iso`/`isoOrNull` in the store do the mapping, so every type in `types.ts` survived the SQLite-to-Postgres move unchanged.

Sources: `packages/database/inbox/schema.ts`, `packages/database/inbox/index.ts`, `packages/database/inbox/store.ts:64-95`, `packages/database/prisma/schema.prisma:258-287`, `apps/saas/modules/inbox/lib/approve.test.ts:403-431`, `docs/adr/0012-inbox-on-prisma.md`

## The office as tenant and the thread identity office:pipe:guest

ADR 0008 made the office (the kit's Organization) the unit of tenancy: it owns pipes, agents and threads, and threads are shared inside it, never private to an agent. Before that, `Conversation.ownerUserId` scoped threads to a person and unowned threads were visible to everyone, a fallback that is gone.

ADR 0010 closed an audit finding: the inbox had trusted the session's active organization, a field the kit's update-user endpoint lets a signed-in user set to any id. Now `resolveOffice(userId)` in `office.ts` reads the membership table on every request: zero memberships is `403 no_office`, more than one is `403 ambiguous_office`, and the session field is never consulted. `requireInboxSession` turns that into an `InboxViewer = { userId, officeId }` that every store read takes: `listConversations(viewer)` filters `where: { officeId }`, `getConversation(id, viewer)` returns null when the office does not match, so another office's thread is indistinguishable from a missing one. Without a viewer (scripts, seed) the store shows everything.

Thread identity is the triple. `conversationId(officeId, pipe, guestId)` returns `${officeId}:${pipe}:${guestId}`, and `upsertInbound` finds the thread by the unique index `officeId_pipe_guestId`, never by parsing the id. The id keeps this shape because it is part of every route (`/api/conversations/[id]`, `decodeURIComponent` in the approve route) and is stable across the move. The same guest writing to two offices is two threads (test "one thread per guest per office: the same guest at two offices never merges"); the same guest on WhatsApp and Zalo is two threads too, because a Zalo id cannot be matched to a phone number and ADR 0003 refuses name matching.

ADR 0012 made `officeId` required: webhooks drop inbound on an unconnected pipe (`ingestEvents` logs "inbound dropped, no office owns this pipe"), the dev route files under the operator's office, so every thread has an office from birth and the old `adoptUnownedThreads` path and `--adopt-unowned` flag were deleted. `upsertInbound(event, officeId)` runs in one `$transaction`: find-or-create the thread, dedupe on `vendorMessageId` within the thread, create the message, and for a guest message bump `lastGuestInboundAt` and `updatedAt` to the event's `at`. `Message.pipeExternalId` records the office endpoint per message so a reply can go out on the number the guest last wrote to (`latestGuestEndpoint` in `inbox.ts`).

Sources: `docs/adr/0008-office-is-the-tenant.md`, `docs/adr/0010-office-assignment.md`, `packages/database/inbox/store.ts:41-48`, `packages/database/inbox/store.ts:231-310`, `apps/saas/modules/inbox/lib/office.ts`, `apps/saas/modules/inbox/lib/require-session.ts`, `apps/saas/modules/inbox/lib/inbox.ts:95-118`, `apps/saas/modules/inbox/lib/store.test.ts:63-113`

## The Answer: the record of a send, written before the vendor call

ADR 0011 replaced three things, an `Approval` row, a `Send` row and a `claimedAt` claim on `Message`, with one `Answer` row per guest message. The context was an outside audit of the earlier design: the approval carried only a thread id and text, so a guest message arriving a moment before the tap was answered with a reply written for the previous one; one `try/catch` covered both the vendor call and the record, so a vendor success followed by a record failure released the claim and the retry sent twice; and "Your turn" was read off message order, so a guest message that landed mid-send was hidden by the outbound stored after it.

The lifecycle is the `AnswerStatus` enum: `sending` from the moment the operator approves, then `sent` (vendor acknowledged), `failed` (definite refusal or missing credentials, retryable) or `unknown` (network failure, timeout, or a vendor success the app could not record; never retried automatically). The row carries the approved text, `operatorId`, `pipe`, `to` (the guest id), `pipeExternalId` copied from the inbound, `approvedAt`, `sentAt`, `failedAt`, `failureReason`.

The store exposes four transitions. `beginAnswer` writes the `sending` row inside an interactive transaction before anything talks to a vendor; an existing row returns `already_answered` (sent), `in_progress` (sending) or `unknown`, and a `failed` row is reused for the retry with new text, operator and `approvedAt` and cleared failure fields, so there is always exactly one Answer per inbound (the `@unique` on `inboundId` enforces it). `completeAnswer` throws unless the row is `sending`, then in one batch transaction sets `sent`/`sentAt`/`vendorMessageId`, creates the outbound `Message` (`source: nhip`) and stamps `Conversation.sentAt`. `failAnswer` and `markAnswerUnknown` are `updateMany` with `where: { id, status: "sending" }`, a compare-and-set that makes a late failure on a sent Answer a no-op.

`approveAndSend` in `inbox.ts` orders it: gate, target checks (`inbound_required`, `stale_target`, `empty_reply`), the WhatsApp 24h window, the `pipe_not_configured` endpoint check in live mode, then `beginAnswer`, then `transmit`. A `SendError` (vendor refused, no token) calls `failAnswer` and returns `502 send_failed`; any other throw calls `markAnswerUnknown` and returns `502 delivery_unknown`; a throw from `completeAnswer` after a vendor success marks unknown with `recorded_failed:` and returns `500 record_failed`. The test "a vendor success whose record fails is never sent twice" wraps `completeAnswer` to throw once and checks the retry is `409 delivery_unknown` with zero outbound messages.

Sources: `docs/adr/0011-answer-is-the-record-of-a-send.md`, `packages/database/inbox/store.ts:362-475`, `packages/database/inbox/types.ts:89-128`, `apps/saas/modules/inbox/lib/inbox.ts:200-330`, `apps/saas/modules/inbox/lib/approve.test.ts:223-313`, `apps/saas/modules/inbox/lib/store.test.ts:163-252`

## "Your turn" is derived from Answers, not message order

`unansweredInboundId` on the domain `Conversation` is the queue's whole state: the id of the guest message to approve, or `null` when nothing is open. It is computed in `mapConversation`, which every read bottoms out in, so the app never stores it and can never let it drift.

The algorithm, in `store.ts` lines 173–186: walk the messages backwards to the latest `direction === "in"`. It is answered if an Answer exists with that `inboundId` whose status is in `ANSWERING_STATUSES = ["sending", "sent", "unknown"]`, or if any later message is an `out` with `source === "oa-echo"` (an agent answered from the OA app directly, which Nhịp learns from the webhook echo). Otherwise it is Your turn. `failed` is deliberately absent from the list: a definite refusal hands the turn back so the operator can approve again on the same row.

Why not message order? Consider M1 arrives, the operator approves, the Answer is `sending`, M2 arrives, then the vendor acknowledges and `completeAnswer` stores the outbound as the last message. By order, the office spoke last and the thread looks done; by Answers, M2 has no Answer and stays Your turn. Both `store.test.ts` ("your turn reads the Answers, not message order") and `approve.test.ts` ("a guest message arriving mid-send stays Your turn") stage exactly that sequence and assert `unansweredInboundId === m2` after the outbound lands.

Two consequences worth saying aloud. First, an Answer in `sending` or `unknown` closes the turn even though no outbound message exists yet, so a refresh during a send does not show the message as open, and an unknown outcome is shown by `sendStatusFor` as `{ kind: "unknown" }` rather than as a reply to make. `approveAndSend` uses `hasUnknownAnswer` to return `delivery_unknown` instead of `already_answered` in that case. Second, `Conversation.sentAt` is "when the office last sent through Nhịp" and not terminal (ADR 0006 changed that from the earlier one-send-per-thread design): after a send the guest can write back and the turn reopens on the new message while `sentAt` stays. The oneShot's `Draft.answersMessageId` records which inbound the suggested reply was written for, and `generateModelDraft` refuses to overwrite the draft if `unansweredInboundId` moved while the model was thinking.

Sources: `packages/database/inbox/store.ts:64-65`, `packages/database/inbox/store.ts:136-203`, `packages/database/inbox/types.ts:141-153`, `apps/saas/modules/inbox/lib/store.test.ts:134-161`, `apps/saas/modules/inbox/lib/store.test.ts:254-281`, `apps/saas/modules/inbox/lib/send-status.ts`, `apps/saas/modules/inbox/lib/inbox.ts:44-66`

## The atomic approve: interactive transaction plus unique index, P2002 becomes in_progress

Concurrency on approve is closed by two layers, and it matters which one does the work.

`beginAnswer` runs `db.$transaction(async (tx) => …)`, Prisma's interactive transaction. Inside it: load the inbound with its conversation (refusing anything that is not a guest message on that thread), `findUnique` the Answer by `inboundId`, and either return a refusal reason, reuse a `failed` row, or `create` a `sending` row. Under Postgres's default READ COMMITTED, two concurrent transactions can both see "no Answer yet" and both reach `create`. The transaction alone does not prevent that; the `@unique` on `inboundId` does. The second insert blocks on the index until the first commits, then fails with Prisma error code `P2002`.

That is why the catch sits outside the transaction: `isUniqueViolation(error)` duck-types `error.code === "P2002"` (no error class import needed) and returns `{ ok: false, reason: "in_progress" }`, the same reason the sequential path returns when it finds a `sending` row, so the caller cannot tell the two apart and does not need to. `approveAndSend` maps it to `409 send_in_progress`. ADR 0012 records this as the SQLite-era guarantee carried over: there the store used a synchronous `UPDATE … WHERE` claim; here the same behaviour is proven by the same tests.

The proofs are `store.test.ts` "one Answer per guest message: two approvals in the same instant let one in" (`Promise.all` of two `beginAnswer`, outcomes sorted equal `["in_progress", "ok"]`, `answer.count === 1`) and `approve.test.ts` "two concurrent approvals send exactly once" through the route (`[200, 409]`, one `nhip` message). The history is visible in commit `fb173be` ("close approve race"): the first fix claimed the thread with `UPDATE … WHERE sentAt IS NULL` and a unique index on `Send.conversationId`; ADR 0006 moved the claim to the inbound message; ADR 0011 folded the claim into the Answer row itself so there is no separate thing to release.

The other transactions in the store are the batch form, `db.$transaction([...])`: `completeAnswer` (update Answer, create outbound Message, update Conversation.sentAt) and `setOneShot` (three upserts plus the language). `upsertInbound` is interactive because the message id depends on the find-or-create result. `failAnswer` and `markAnswerUnknown` need no transaction because a single `updateMany` with the status predicate is atomic on its own.

Sources: `packages/database/inbox/store.ts:205-210`, `packages/database/inbox/store.ts:362-420`, `packages/database/inbox/store.ts:422-475`, `apps/saas/modules/inbox/lib/store.test.ts:38-48`, `apps/saas/modules/inbox/lib/approve.test.ts:528-536`, `docs/adr/0012-inbox-on-prisma.md`

## The funnel query: two CTEs, cohort by first inbound, nearest-rank percentiles

ADR 0002 decided Home's headline is the office funnel, not response time; Nhịp can count the first three stages itself and leaves closings and lost to the CRM adapter. Commit `b5d7891` built it as one office-scoped query so no thread leaves the store for a count.

`store.funnel(viewer, { since })` is a `$queryRaw` tagged template (parameterised, so `viewer.officeId` and `since` are bound values, not string-spliced). Two CTEs: `"first"` is `MIN("at")` of `direction = 'in'` grouped by conversation, the first guest message per thread; `"reached"` is `MIN("sentAt")` of `inbox_answer` where `status = 'sent'`, the first delivered Answer per thread. The main select joins `inbox_conversation` to `first` (inner, every thread has an inbound), left-joins `reached`, and computes `wroteBack` as an `EXISTS` of a later inbound with `at > firstSentAt`. The filter is `officeId = $1 AND firstInboundAt >= $2`. One row per cohort lead, never per message.

The cohort rule is by first contact: a guest whose first message was 40 days ago but who was answered and wrote back this week is not a lead of this window. The test comment says why: the funnel must narrow monotonically, leads ≥ engaged ≥ in conversation, which fails if later stages could admit guests the first stage did not. `failed` and `unknown` Answers never count as received, so Thảo in the test (failed, then unknown) is a lead but not engaged.

JavaScript finishes the job: `leadsIn = leads.length`, `engaged` = leads with a `firstSentAt`, `inConversation` = engaged leads with `wroteBack`, and response time over the durations `firstSentAt − firstInboundAt` clamped at 0 and sorted. `nearestRank(sorted, p) = sorted[max(0, ceil(p·n) − 1)]`, never interpolated: for durations 10, 20, 30, 40, 90 minutes the median is index `ceil(2.5)−1 = 2` → 30 and p90 is index `ceil(4.5)−1 = 4` → 90, which the second funnel test asserts within 5 seconds. `responseTime` is `null` when nobody was answered rather than a zero that looks like a fact. The result is validated against the zod `Funnel` schema (`Funnel.parse(funnel)` in the test), which is also how Home types it.

One subtlety to know: `wroteBack` compares a message's `at` (the vendor's or injected timestamp) with `sentAt` (the server clock at `completeAnswer`), so the funnel test dates write-backs a minute ahead.

Sources: `packages/database/inbox/store.ts:212-215`, `packages/database/inbox/store.ts:513-564`, `packages/database/inbox/schema.ts:65-94`, `apps/saas/modules/inbox/lib/funnel.test.ts`, `docs/adr/0002-home-shows-the-funnel.md`, `CONTEXT.md:51-63`

## InboxStore as the seam, and the history: SQLite with hand DDL to Prisma/Postgres (ADR 0012)

`InboxStore` in `types.ts` is an object of async methods over domain types only: `listConversations`, `getConversation`, `upsertInbound`, `connectPipe`, `officeForPipe`, `listPipeConnections`, `setOneShot`, `setDraft`, `setTranslation`, `beginAnswer`, `completeAnswer`, `failAnswer`, `markAnswerUnknown`, `guestInboundText`, `funnel`, `close`. Nothing above it imports Prisma: routes go through `getRuntime().store`, which `runtime.ts` builds once as `createInboxStore(db)` on the kit's lazy `db` Proxy singleton from `packages/database/prisma/client.ts` (Prisma 7.9.1 with the `@prisma/adapter-pg` driver adapter, `DATABASE_URL` from `prisma.config.ts`). Tests swap the store with `setRuntimeForTests`, which is how the record-failure test wraps `completeAnswer`.

History. Commit `96239c8` pinned a `better-sqlite3` file at `data/nhip.db`; `b6ae7e4` hardened it (WAL, `busy_timeout=5000`, cuid message ids instead of `COUNT(*)+1`, and deleted the unused Prisma and Drizzle inbox schemas so the hand DDL in `ensure-schema.ts` was the only schema). Every later inbox change (ownerUserId, Approval/Send, Answer) was a hand migration run on open, each with its own test. ADR 0012 names the three costs that grew: no relations across the Postgres/SQLite line (deleting an office left its threads behind), two schema tools (`prisma db push` for the kit, `CREATE TABLE IF NOT EXISTS` plus additive migrations for the inbox), and one process with one disk, which ruled out serverless and any second instance. Eyal decided on 2026-09-20 that the inbox should use Prisma, and that the funnel (PR #24) land first so its tests could prove the move.

Gained: real foreign keys and cascades, one `schema.prisma`, one `DATABASE_URL`, a store that can run in more than one process, and enums checked by the database. Lost: synchronous transactions (the SQLite store's approve was a plain synchronous statement; now it is an async interactive transaction and the unique index carries the race), zero-setup tests (a temp file became a second Postgres database plus a global `db push`), and the migrate-on-open path for old files, which was dropped outright because there was no production data (`pnpm seed` rebuilds the walk office). Also deferred: `prisma migrate` baselining is a go-live checklist item; development stays on `db push`.

The move was five commits (`f24b93e` models, `d82c168` test database, `db55d18` store, `485503f` app/seed/tests, `88477d3` docs) merged as PR #26, with the plan in `docs/superpowers/plans/2026-09-20-inbox-on-prisma.md`.

Sources: `packages/database/inbox/types.ts:182-221`, `packages/database/inbox/store.ts:217-230`, `apps/saas/modules/inbox/lib/runtime.ts`, `packages/database/prisma/client.ts`, `packages/database/prisma.config.ts`, `docs/adr/0012-inbox-on-prisma.md`, `docs/superpowers/plans/2026-09-20-inbox-on-prisma.md:1-25`

## Test strategy: supastarter_test, global push, truncate per test, fixtures for the foreign keys, serial files

Store tests need a real Postgres because the guarantees under test (unique index, cascades, raw SQL) are database guarantees. The design keeps them off the development database and cheap to reset.

**Which database.** `testDatabaseUrl()` in `packages/database/inbox/testing.ts` takes `TEST_DATABASE_URL`, else `DATABASE_URL` with `_test` appended to the database name (default `supastarter_test`), and throws "refuse to run against DATABASE_URL itself" if the two resolve equal. `test-store.test.ts` pins all three branches. CI sets `TEST_DATABASE_URL` explicitly and runs a `postgres:16` service with `pg_isready` health checks.

**Schema once per run.** `apps/saas/vitest.global-setup.ts` calls `ensureTestDatabase` (a `CREATE DATABASE` through the `postgres` maintenance database via `$executeRawUnsafe`, because `CREATE DATABASE` cannot run inside a transaction) and then `execFileSync("pnpm", ["exec", "prisma", "db", "push"])` in `packages/database` with `DATABASE_URL` overridden to the test URL. It is the plain push, not `--accept-data-loss`: a destructive schema change fails loudly and the fix is `dropdb supastarter_test`.

**Reset per test.** `resetInboxTables(db, { offices, operators })` runs `TRUNCATE "inbox_conversation", "inbox_pipe_connection" CASCADE`, which the foreign keys extend to messages, translations, qualification, drafts, paperwork and answers. Then it upserts the named fixtures: `organization` rows for offices and `user` rows for operators. This is forced by the relations: `Conversation.officeId` must point at a real Organization and `Answer.operatorId` at a real User, so a test cannot invent `"office-a"` inline any more. `test-store.ts` fixes the lists, `TEST_OFFICES = ["office-a", "office-b", WALK_OFFICE_ID]` and `TEST_OPERATORS = ["agent-1", "agent-2", "walk-user"]`, and `testInboxStore()` resets and returns a store on one shared `testDb` client per process; `close()` calls `$disconnect`, which reconnects lazily on the next test.

**Serial files.** `vitest.config.ts` sets `fileParallelism: false` with the comment "Store tests share one database and truncate it; files must not interleave." Tests within a file are already sequential in vitest, so the truncate-per-test model holds.

**What the suites cover.** `store.test.ts` (13 tests) is the store contract: the race, cuid ids, office visibility, the triple identity, endpoints, pipe connections, Your turn, the Answer lifecycle, unknown outcomes, mid-send, translations, drafts, office cascade. `approve.test.ts` (19) drives the real route handlers with a mocked `auth.api.getSession` and mocked memberships, covering stale/missing/empty targets, the 24h window, `pipe_not_configured`, vendor refusal versus transport failure, record failure, and the concurrent approve. `funnel.test.ts` (3) is the regression suite ADR 0012 named for the query. Tests that inspected the SQLite file (WAL mode, index names, legacy-file migrations) were deleted with it.

Sources: `packages/database/inbox/testing.ts`, `apps/saas/vitest.global-setup.ts`, `apps/saas/vitest.config.ts`, `apps/saas/modules/inbox/lib/test-store.ts`, `apps/saas/modules/inbox/lib/test-store.test.ts`, `.github/workflows/ci.yml:13-37`, `.env.local.example:1-5`

## Key facts

- Eight inbox models live in packages/database/prisma/schema.prisma, mapped to inbox_conversation, inbox_message, inbox_translation, inbox_qualification, inbox_draft, inbox_paperwork, inbox_answer and inbox_pipe_connection, in the same Postgres as the kit's auth tables (ADR 0012).
- The office is the kit's Organization; Conversation.officeId and PipeConnection.officeId cascade-delete from it, Answer.operatorId set-nulls from User, and everything under Conversation and Message cascades.
- A thread's identity is the unique triple (officeId, pipe, guestId); the id string is office:pipe:guest only because it sits in every route, and upsertInbound looks threads up by the triple, never by parsing the id.
- The office is resolved from the membership table on every request (resolveOffice: 0 → 403 no_office, >1 → 403 ambiguous_office); the session's active-organization field is never trusted because a user can set it (ADR 0010).
- Closed vocabularies are Prisma enums (Pipe, MessageDirection, MessageSource with oa_echo on disk, DraftSource, AnswerStatus); languages and rentOrBuy are text validated by zod in packages/database/inbox/schema.ts, the single source of the vocabulary.
- An Answer is one row per guest message (inboundId @unique) carrying status sending → sent | failed | unknown, written in status sending inside beginAnswer before transmit is called (ADR 0011).
- failed is retried on the same row; unknown (network failure, timeout, or vendor success the app could not record) is never retried and blocks with 409 delivery_unknown until a person reconciles it.
- Your turn (unansweredInboundId) is computed in mapConversation on every read: the latest inbound is answered only if an Answer in sending/sent/unknown exists for it or an oa-echo outbound follows it; message order is not consulted.
- The concurrent-approve race is closed by the unique index, not by transaction isolation: the losing insert fails with Prisma P2002, which isUniqueViolation turns into reason in_progress and the route into 409 send_in_progress.
- completeAnswer throws unless the Answer is sending; failAnswer and markAnswerUnknown are updateMany guarded by status = sending, so a late transition on a sent Answer is a no-op.
- The funnel is one $queryRaw with CTEs first (MIN(at) of inbound per thread) and reached (MIN(sentAt) of sent Answers), cohorted by first inbound >= since inside the office; only the nearest-rank median and p90 (sorted[ceil(p·n)−1]) are computed in JavaScript.
- InboxStore in packages/database/inbox/types.ts is the seam: routes call getRuntime().store, built once as createInboxStore(db) on the kit's Prisma singleton, and tests replace it with setRuntimeForTests.
- The inbox moved from a better-sqlite3 file with hand DDL in ensure-schema.ts to Prisma 7.9.1 on Postgres in PR #26 (five commits, ADR 0012) because the SQLite file had no relations to the office, a second schema tool, and tied the app to one process on one disk.
- Tests run against supastarter_test (TEST_DATABASE_URL or DATABASE_URL + _test, never DATABASE_URL itself), pushed once by vitest.global-setup.ts with prisma db push, truncated per test with TRUNCATE ... CASCADE, with fixture offices and operators upserted because of the foreign keys, and with fileParallelism: false.
- Message and Answer ids are cuid2 generated in the store (not @default(cuid())), with an autoincrement seq column as the ordering tiebreak that replaced SQLite's rowid.

## Trade-offs

### Move the inbox from a hand-written SQLite file into the kit's Postgres through Prisma (ADR 0012).

**Alternatives:** Keep SQLite and add a second schema tool; use Drizzle (its inbox tables had existed and were deleted in b6ae7e4); keep two databases and join in application code.

**Why:** Offices are Postgres rows and threads carried the office id as text with no FK, so deleting an office orphaned its threads; every inbox change was a hand migration with its own test; a SQLite file rules out serverless and any second instance. Prisma was already the kit's tool.

**Cost:** Lost synchronous transactions (the approve race now rests on the unique index inside an async interactive transaction), tests need a second Postgres database and a global db push instead of a temp file, and the migrate-on-open path for old files was dropped rather than ported.

### Write the Answer row in status sending before calling the vendor, one row per inbound with a unique index.

**Alternatives:** Claim the thread or message with an UPDATE ... WHERE and write Approval and Send rows after the vendor call (the ADR 0006 design); rely on an idempotency key at the vendor.

**Why:** An audit showed the gap between approval and record: a stale target could be answered, a vendor success followed by a record failure was resent, and Your turn read off message order hid mid-send guest messages. One record that exists from approval closes all three.

**Cost:** Unknown outcomes need a human to reconcile against the vendor; there is no automatic retry or vendor-side reconciliation, and a sending row left by a crashed process blocks the message until someone intervenes.

### Derive unansweredInboundId from Answers on every read in mapConversation rather than storing it.

**Alternatives:** Store a queue-state column updated on each transition; compute from message order (the previous behaviour).

**Why:** Message order lies when a guest writes mid-send; a stored column can drift from the Answers it summarises. Computing it from the messages and answers already loaded costs nothing extra.

**Cost:** Every Conversation read loads all messages and answers (CONVERSATION_INCLUDE), and listConversations does so for every thread in the office; there is no cheap queue-only query yet.

### Prisma enums for closed vocabularies, zod-validated text for languages and rent-or-buy.

**Alternatives:** Enums everywhere; text everywhere with zod; a lookup table per vocabulary.

**Why:** Adding a guest language should not need a schema push; a new pipe or Answer status is a real schema change and the database should refuse a bad value.

**Cost:** Two validation layers to keep in mind, a bad text value is caught only at read time by vocab() and surfaces as a thrown error, and the enum spelling oa_echo differs from the domain's oa-echo, needing a translation at the boundary.

### Keep the office:pipe:guest text id on Conversation while the unique key is the triple.

**Alternatives:** A cuid id with the triple as a separate unique; a composite primary key.

**Why:** The id is part of every route and client URL; keeping the shape meant routes, the client and the seed did not change in the Prisma move, and the store never parses it anyway.

**Cost:** Redundant information (the id restates three columns), and the id would need a rewrite if a thread ever had to move between offices, which the model does not allow.

### Cohort the funnel by first inbound in the window and count engaged and in-conversation inside that cohort, in one raw SQL query.

**Alternatives:** Count each stage over its own event date; build the counts in JavaScript from listConversations; Prisma groupBy.

**Why:** Counting stages by their own dates lets the funnel widen (more engaged than leads); the cohort rule keeps it monotonic. Raw SQL keeps it one office-scoped round trip so no thread leaves the store for a count.

**Cost:** Raw SQL is outside Prisma's type checking and depends on the mapped table names; the first CTE scans all inbound messages before the office filter applies, which is fine at pilot scale but has no supporting index on (direction, conversationId).

### Tests share one real Postgres database, pushed once, truncated per test, run file-serially.

**Alternatives:** A database per test file; transaction-rollback per test; an in-memory or SQLite double.

**Why:** The guarantees under test (unique index, cascades, raw SQL) are Postgres guarantees, so a double would not prove them; one push per run plus TRUNCATE CASCADE is fast and simple.

**Cost:** fileParallelism is off, so the suite cannot scale out across files; every test must name its offices and operators up front because the foreign keys demand fixture rows; a destructive schema change means dropdb supastarter_test by hand.

## Where the docs and the code disagree

- ARCHITECTURE.md line 50 says inbox types include "`Draft` + crib"; commit 690e1a9 stopped persisting the operator note and the Draft model/type is { reply, answersMessageId, source } with no crib columns (crib.ts renders the note at read time).
- packages/database/inbox/types.ts still says Draft.answersMessageId is "`null` only on files written before ADR 0006" and Answer.operatorId is "`null` on rows migrated from before ADR 0011"; ADR 0012 imports no old files, so in code operatorId is null when there is no viewer (scripts, tests passing null) or after a User delete set-nulls it, and answersMessageId is nullable only because the column is.
- ADR 0011's Consequences say "Files from before this decision migrate on open" and describe Send-to-Answer migration; ADR 0012 dropped all on-open migrations and the SQLite file, but ADR 0011 is not annotated as superseded on that point the way ADR 0010 is.
- store.test.ts line 134 titles a test "your turn is derived from the messages: the guest spoke last and nothing answers it", while the code comment in store.ts and ADR 0011 say Your turn is derived from Answers, not message order; the test body is correct, the name is pre-ADR-0011 wording.
- CONTEXT.md line 40 defines Your turn as "the guest spoke last, i.e. there is an unanswered inbound"; in code a guest message with an Answer in sending or unknown is not Your turn even though no outbound exists yet, and after an oa-echo the guest did not speak last. The Sending section (line 71) has the precise Answer-based definition.
- ADR 0012 says the interactive transaction plus unique index refuse a concurrent approval; strictly, the transaction does not prevent the double insert under READ COMMITTED, the unique index on inboundId does, and the P2002 catch is outside the transaction for that reason. The ADR's phrasing is accurate about the outcome, not the mechanism.

## Interview questions for this chapter

See [the interview chapter](./07-interview.md) for the 6 questions that target this chapter.
