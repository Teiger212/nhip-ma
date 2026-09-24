# 0012. The inbox lives in Postgres, through Prisma

Date: 2026-09-20. Status: accepted. Refines ADRs 0008, 0010 and 0011.

## Context

Nhịp keeps two stores: the kit's Postgres, through Prisma, for users, sessions, offices,
memberships and invitations; and a hand-written SQLite file for the inbox (threads,
messages, translations, extraction, drafts, paperwork, Answers, pipe connections). The
split was deliberate: SQLite gave synchronous transactions for the atomic approve (ADR
0011), tests that open a temp file, and no dependency on the kit's schema.

Its three costs grew with the product:

- **No relations across the line.** An office is a Postgres row; its threads are SQLite
  rows that carry the office id as text. Deleting an office leaves its threads behind,
  and no cascade, constraint or join can span the two.
- **Two schema tools.** The kit uses `prisma db push`; the inbox uses
  `CREATE TABLE IF NOT EXISTS` plus additive migrations that run on open. Every inbox
  change is a hand migration with its own test.
- **One process, one disk.** A SQLite file rules out serverless and any second instance.

Eyal decided on 2026-09-20 that the inbox should use an ORM, with Prisma as the tool,
and that the funnel (PR #24) lands first so its tests can prove the move.

## Decision

- **One database.** The inbox tables join `schema.prisma` as Prisma models: Conversation,
  Message, Translation, Qualification, Draft, Paperwork, Answer, PipeConnection. The
  SQLite file, `better-sqlite3`, `ensure-schema.ts` and its migrations, and
  `sqlite-path.ts` are deleted. `DATABASE_URL` is the only database.
- **Real relations.** `Conversation.officeId` and `PipeConnection.officeId` reference
  `Organization` with cascade delete: an office that goes takes its threads and pipes.
  `Answer.operatorId` references `User` with set-null: the record of a send outlives the
  operator. Child tables cascade from Conversation and Message as before.
- **`officeId` is required.** Every thread has an office from birth (ADR 0010: webhooks
  drop inbound on unconnected pipes; the dev route files under the operator's office).
  `adoptUnownedThreads`, `--adopt-unowned` and the seed's adopt step are removed. The
  unique key is (office, pipe, guest); the id keeps the `office:pipe:guest` shape because
  it is part of every route.
- **The seam holds.** `InboxStore` keeps its methods and its domain types; only
  `filePath` goes. `createInboxStore(db)` takes the Prisma client instead of a path, and
  the runtime hands it the kit's singleton. Routes, the approve path, Home, the seed and
  the pipe script do not change.
- **Time is `DateTime` on disk, ISO text in the domain.** Columns are `timestamptz`; the
  store maps to and from `Date#toISOString` at its boundary, so `Timestamp` and every
  type in `types.ts` stay as they are. Message and Answer keep an autoincrement `seq`,
  where the SQLite store relied on `rowid` for order.
- **Closed vocabularies are Prisma enums, open ones are text.** Pipe, message direction
  and source, draft source and Answer status are enums (`oa_echo` stays the on-disk
  spelling, mapped at the boundary as today). Guest and operator languages and rent-or-buy
  stay strings validated by zod, because those lists may grow without a schema change.
- **Approve stays atomic.** `beginAnswer` is one interactive transaction; the unique
  index on `inboundId` refuses a concurrent approval of the same message, surfaced as
  Prisma's unique-violation error and returned as `in_progress`, the reason the SQLite
  store returned. The existing approve and loop tests are the proof.
- **The funnel stays one query.** `store.funnel` is a raw query behind the same method,
  with the same cohort rule; the funnel tests are the regression suite.
- **Schema by `db push` now, migrations before go-live.** The kit's convention holds; a
  baseline `prisma migrate` becomes a go-live checklist step.
- **No import of old files.** There is no production data; `pnpm seed` rebuilds the walk
  office. `data/` leaves the tree and the ignore file.

## Consequences

- Tests need Postgres. Locally they use `TEST_DATABASE_URL` (default
  `supastarter_test` on the same server), pushed once by a vitest global setup; the inbox
  tables are truncated before each test, and test files run serially. CI gains a
  `postgres:16` service. Tests that inspected the SQLite file (WAL mode, index names, the
  two legacy-file migrations) are deleted; the approve tests cover the behaviour they
  guarded, or it no longer exists.
- HANDOFF's "one long-lived process with a real disk" rule is lifted for the inbox.
  Serverless becomes possible but is not chosen here.
- `packages/database/prisma/client.ts` no longer refuses a `file:` URL, and
  `packages/database/prisma/queries/inbox.ts` (a re-export of the SQLite store) goes.
- Deleting an office now deletes its threads. Deleting its operators is left to a later
  ADR; until then a removed operator has a login and no office, and the gate refuses them
  as today. Settled by ADR 0013: the account ends with the office.
