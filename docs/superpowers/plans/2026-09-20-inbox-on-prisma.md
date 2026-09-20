# Inbox on Prisma Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the inbox store from a hand-written SQLite file to Prisma models in the kit's Postgres, keeping the `InboxStore` interface so nothing above the store changes.

**Architecture:** Eight models join `packages/database/prisma/schema.prisma` with real relations to Organization and User. `createInboxStore(db)` takes the Prisma client and reimplements every `InboxStore` method on it, mapping `DateTime` to ISO strings at the boundary so the domain types stay. Tests run against a separate Postgres database pushed once by a vitest global setup and truncated before each test.

**Tech Stack:** Prisma 7.9.1 (`prisma-client` generator, `@prisma/adapter-pg`), Postgres 16, zod 4, vitest 4, pnpm 11 workspace.

**Spec:** `docs/adr/0012-inbox-on-prisma.md`

## Global Constraints

- `InboxStore` keeps every method and every domain type in `packages/database/inbox/types.ts`; only `filePath` and `adoptUnownedThreads` are removed.
- `Conversation.officeId` is required and references `Organization` with cascade delete; `PipeConnection.officeId` likewise. `Answer.operatorId` references `User` with set-null.
- The thread id keeps the `office:pipe:guest` shape; the unique key is (officeId, pipe, guestId).
- Timestamps are `DateTime` columns; the domain sees `Date#toISOString` strings. `Message` and `Answer` carry an autoincrement `seq` for ordering.
- Enums: `Pipe`, `MessageDirection`, `MessageSource` (with `oa_echo` on disk), `DraftSource`, `AnswerStatus`. Languages and rent-or-buy stay `String` validated by zod.
- Schema by `prisma db push`; no migrations folder in this PR.
- Inbox tables are mapped to `inbox_*` table names so they never collide with kit tables.
- Tests never touch `DATABASE_URL`; they use `TEST_DATABASE_URL` or `<DATABASE_URL name>_test`.
- Commit messages carry no Claude attribution (user rule). Never `git add -A`; explicit paths only. Never commit `.env.local` or `data/`.
- Gates before each commit: `pnpm format`, `pnpm lint`, `pnpm type-check`, `pnpm --filter saas test` (the last three must exit 0; format rewrites in place).

---

## File map

| Path | Change | Responsibility |
| --- | --- | --- |
| `packages/database/prisma/schema.prisma` | modify | Inbox enums and models; relation fields on `Organization` and `User` |
| `packages/database/prisma/client.ts` | modify | Drop the `file:` URL refusal |
| `packages/database/prisma/queries/inbox.ts` | delete | Was a re-export of the SQLite store |
| `packages/database/prisma/queries/index.ts` | modify | Remove the deleted re-export |
| `packages/database/inbox/store.ts` | rewrite | `createInboxStore(db)` on Prisma |
| `packages/database/inbox/types.ts` | modify | Remove `filePath`, `adoptUnownedThreads` |
| `packages/database/inbox/index.ts` | modify | Remove SQLite exports |
| `packages/database/inbox/ensure-schema.ts`, `sqlite-path.ts` | delete | SQLite DDL and path |
| `packages/database/inbox/testing.ts` | create | Test database URL, creation, reset |
| `packages/database/package.json` | modify | Drop `better-sqlite3`; export `./inbox/testing` |
| `apps/saas/vitest.config.ts`, `apps/saas/vitest.global-setup.ts` | modify / create | Push the test schema once; run files serially |
| `apps/saas/modules/inbox/lib/test-store.ts` | create | `testInboxStore()` for every store-backed test |
| `apps/saas/modules/inbox/lib/{store,funnel,approve,loop,seed}.test.ts`, `pipes/webhook.test.ts` | modify | Use `testInboxStore()` |
| `apps/saas/modules/inbox/lib/runtime.ts` | modify | `createInboxStore(db)` |
| `apps/saas/modules/inbox/lib/walk-user.ts`, `scripts/seed.ts`, `scripts/seed-walk-user.ts`, `scripts/seed-walk-office.ts`, `scripts/connect-pipe.ts` | modify | Postgres is the only database; no adopt step |
| `.github/workflows/ci.yml` | modify | Postgres service, `TEST_DATABASE_URL` |
| `HANDOFF.md`, `ARCHITECTURE.md`, `AGENTS.md`, `README.md`, `.env.local.example`, `.gitignore`, `docs/adr/0010-office-assignment.md` | modify | SQLite is gone; test database; go-live migrate step |

---

### Task 1: Inbox models in the Prisma schema

**Files:**
- Modify: `packages/database/prisma/schema.prisma`
- Modify: `packages/database/prisma/client.ts:10-15`

**Interfaces:**
- Produces: Prisma models `Conversation`, `Message`, `Translation`, `Qualification`, `Draft`, `Paperwork`, `Answer`, `PipeConnection`; enums `Pipe`, `MessageDirection`, `MessageSource`, `DraftSource`, `AnswerStatus`; compound uniques `officeId_pipe_guestId` (Conversation), `messageId_locale` (Translation), `pipe_externalId` (PipeConnection); `Answer.inboundId` unique.

- [ ] **Step 1: Add the enums and models to `schema.prisma`**

Append at the end of the file:

```prisma
// ---------------------------------------------------------------------------
// The inbox (ADR 0012): threads, messages, extraction, drafts, Answers and pipe
// connections, in the same database as the offices they belong to. Table names carry
// the inbox_ prefix so they never collide with the kit's. Closed vocabularies are
// enums; languages and rent-or-buy stay text validated by zod in packages/database/inbox.
// ---------------------------------------------------------------------------

enum Pipe {
  zalo
  whatsapp
}

enum MessageDirection {
  in
  out
}

/// `oa_echo` is the on-disk spelling of the domain's `oa-echo` (an agent replying from
/// the OA app); the store translates at its boundary.
enum MessageSource {
  guest
  oa_echo
  nhip
}

enum DraftSource {
  template
  model
}

/// The lifecycle of an Answer (ADR 0011).
enum AnswerStatus {
  sending
  sent
  failed
  unknown
}

/// One thread per guest per office (ADR 0010). The id is `office:pipe:guest` because it
/// is part of every route; the unique key is the triple.
model Conversation {
  id                 String         @id
  pipe               Pipe
  guestId            String
  guestName          String?
  officeId           String
  office             Organization   @relation(fields: [officeId], references: [id], onDelete: Cascade)
  language           String?
  lastGuestInboundAt DateTime?
  sentAt             DateTime?
  updatedAt          DateTime
  messages           Message[]
  qualification      Qualification?
  draft              Draft?
  paperwork          Paperwork?
  answers            Answer[]

  @@unique([officeId, pipe, guestId])
  @@index([officeId])
  @@map("inbox_conversation")
}

model Message {
  id              String           @id
  seq             Int              @unique @default(autoincrement())
  conversationId  String
  conversation    Conversation     @relation(fields: [conversationId], references: [id], onDelete: Cascade)
  direction       MessageDirection
  source          MessageSource
  text            String
  at              DateTime
  vendorMessageId String?
  mock            Boolean          @default(false)
  pipeExternalId  String?
  translations    Translation[]
  answer          Answer?

  @@index([conversationId])
  @@map("inbox_message")
}

model Translation {
  messageId String
  message   Message @relation(fields: [messageId], references: [id], onDelete: Cascade)
  locale    String
  text      String

  @@id([messageId, locale])
  @@map("inbox_translation")
}

model Qualification {
  conversationId  String       @id
  conversation    Conversation @relation(fields: [conversationId], references: [id], onDelete: Cascade)
  areaOfInterest  String?
  nationality     String?
  inVietnamNow    Boolean?
  rentOrBuy       String?
  timeframe       String?
  budgetBand      String?
  bedsOrHousehold String?

  @@map("inbox_qualification")
}

model Draft {
  conversationId   String       @id
  conversation     Conversation @relation(fields: [conversationId], references: [id], onDelete: Cascade)
  reply            String
  answersMessageId String?
  source           DraftSource  @default(template)

  @@map("inbox_draft")
}

model Paperwork {
  conversationId String       @id
  conversation   Conversation @relation(fields: [conversationId], references: [id], onDelete: Cascade)
  mentioned      Boolean
  flag           String?

  @@map("inbox_paperwork")
}

/// The Answer (ADR 0011): one row per answered guest message, carrying the send's whole
/// lifecycle. The operator link is set-null so the record outlives the account.
model Answer {
  id              String       @id
  seq             Int          @unique @default(autoincrement())
  conversationId  String
  conversation    Conversation @relation(fields: [conversationId], references: [id], onDelete: Cascade)
  inboundId       String       @unique
  inbound         Message      @relation(fields: [inboundId], references: [id], onDelete: Cascade)
  text            String
  operatorId      String?
  operator        User?        @relation(fields: [operatorId], references: [id], onDelete: SetNull)
  status          AnswerStatus
  mock            Boolean      @default(false)
  pipe            Pipe
  to              String
  pipeExternalId  String?
  vendorMessageId String?
  approvedAt      DateTime
  sentAt          DateTime?
  failedAt        DateTime?
  failureReason   String?

  @@index([conversationId])
  @@map("inbox_answer")
}

/// Which office owns a pipe endpoint (ADR 0008). Webhook-created threads take this office.
model PipeConnection {
  pipe       Pipe
  externalId String
  officeId   String
  office     Organization @relation(fields: [officeId], references: [id], onDelete: Cascade)

  @@id([pipe, externalId])
  @@map("inbox_pipe_connection")
}
```

- [ ] **Step 2: Add the back-relations on `Organization` and `User`**

In `model Organization`, after `purchases          Purchase[]` add:

```prisma
  conversations      Conversation[]
  pipeConnections    PipeConnection[]
```

In `model User`, after `notificationPreferences  UserNotificationPreference[]` add:

```prisma
  answers                  Answer[]
```

- [ ] **Step 3: Remove the `file:` refusal from the kit client**

In `packages/database/prisma/client.ts` delete this block:

```ts
	if (process.env.DATABASE_URL.startsWith("file:")) {
		throw new Error(
			"Postgres Prisma is unused for the inbox SQLite walkthrough. Inbox data lives in packages/database/inbox.",
		);
	}

```

- [ ] **Step 4: Validate, generate and push to the dev database**

Run:

```bash
pnpm --filter @repo/database exec prisma validate
pnpm --filter @repo/database generate
pnpm --filter @repo/database push
```

Expected: `validate` prints "The schema ... is valid", `generate` ends with the zod generator line, `push` reports the `inbox_*` tables created. If `push` reports `prisma/zod/index.ts` changed, that is the generated zod file picking up the new models; it is committed with the schema.

- [ ] **Step 5: Commit**

```bash
git add packages/database/prisma/schema.prisma packages/database/prisma/client.ts packages/database/prisma/zod/index.ts
git commit -m "feat(database): inbox models in the Prisma schema (ADR 0012)"
```

---

### Task 2: A test database that is pushed once and reset per test

**Files:**
- Create: `packages/database/inbox/testing.ts`
- Modify: `packages/database/package.json` (exports)
- Create: `apps/saas/vitest.global-setup.ts`
- Modify: `apps/saas/vitest.config.ts`
- Create: `apps/saas/modules/inbox/lib/test-store.ts`
- Test: `apps/saas/modules/inbox/lib/test-store.test.ts`
- Modify: `.github/workflows/ci.yml`

**Interfaces:**
- Produces: `testDatabaseUrl(env?) => string`, `ensureTestDatabase(url?) => Promise<void>`, `createTestInboxClient(url?) => PrismaClient`, `resetInboxTables(db, { offices, operators }) => Promise<void>` from `@repo/database/inbox/testing`; `testInboxStore() => Promise<InboxStore>`, `TEST_OFFICES`, `TEST_OPERATORS` from `apps/saas/modules/inbox/lib/test-store.ts`.
- Consumes: Task 1's models. Task 3's `createInboxStore(db)` (this task's `test-store.ts` calls it; until Task 3 lands, the file type-checks against the old signature only if you leave the call out, so write `test-store.test.ts` against `resetInboxTables` and the raw client and add the `createInboxStore` call in Task 3).

- [ ] **Step 1: Write the failing test**

`apps/saas/modules/inbox/lib/test-store.test.ts`:

```ts
import { createTestInboxClient, resetInboxTables, testDatabaseUrl } from "@repo/database/inbox/testing";
import { expect, test } from "vitest";

test("the test database is never DATABASE_URL, and a reset leaves the fixture rows and no threads", async () => {
	expect(testDatabaseUrl({ DATABASE_URL: "postgresql://u:p@localhost:5432/supastarter" })).toBe(
		"postgresql://u:p@localhost:5432/supastarter_test",
	);
	expect(
		testDatabaseUrl({
			DATABASE_URL: "postgresql://u:p@localhost:5432/supastarter",
			TEST_DATABASE_URL: "postgresql://u:p@localhost:5432/elsewhere",
		}),
	).toBe("postgresql://u:p@localhost:5432/elsewhere");
	expect(() =>
		testDatabaseUrl({
			DATABASE_URL: "postgresql://u:p@localhost:5432/supastarter",
			TEST_DATABASE_URL: "postgresql://u:p@localhost:5432/supastarter",
		}),
	).toThrow(/refuse/);

	const db = createTestInboxClient();
	await resetInboxTables(db, { offices: ["office-a"], operators: ["agent-1"] });
	expect(await db.conversation.count()).toBe(0);
	expect(await db.organization.findUnique({ where: { id: "office-a" } })).not.toBeNull();
	expect(await db.user.findUnique({ where: { id: "agent-1" } })).not.toBeNull();
	// Idempotent: the fixtures are upserted, not recreated.
	await resetInboxTables(db, { offices: ["office-a"], operators: ["agent-1"] });
	expect(await db.organization.count({ where: { id: "office-a" } })).toBe(1);
	await db.$disconnect();
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `pnpm --filter saas exec vitest run modules/inbox/lib/test-store.test.ts`
Expected: FAIL, "Failed to resolve import `@repo/database/inbox/testing`".

- [ ] **Step 3: Write the helper in the database package**

`packages/database/inbox/testing.ts`:

```ts
import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "../prisma/generated/client";

/**
 * Test support for the inbox store. Tests run against their own database, never the one
 * in `DATABASE_URL`: `TEST_DATABASE_URL` when set, else the `DATABASE_URL` database with
 * `_test` appended to its name.
 */
export function testDatabaseUrl(env: NodeJS.ProcessEnv = process.env): string {
	const base = env.DATABASE_URL ?? "postgresql://postgres:postgres@localhost:5432/supastarter";
	const url = env.TEST_DATABASE_URL ?? withDatabaseName(base, (name) => `${name}_test`);
	if (env.DATABASE_URL && url === env.DATABASE_URL) {
		throw new Error(
			"Inbox tests refuse to run against DATABASE_URL itself. Set TEST_DATABASE_URL to a separate database.",
		);
	}
	return url;
}

function withDatabaseName(url: string, rename: (name: string) => string): string {
	const parsed = new URL(url);
	parsed.pathname = `/${rename(parsed.pathname.replace(/^\//, ""))}`;
	return parsed.toString();
}

/** A client for one test process. Reused across tests; `$disconnect` reconnects lazily. */
export function createTestInboxClient(url = testDatabaseUrl()): PrismaClient {
	return new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });
}

/**
 * Create the test database on the server if it is missing, through the `postgres`
 * maintenance database. `CREATE DATABASE` cannot run in a transaction, and
 * `$executeRawUnsafe` does not open one.
 */
export async function ensureTestDatabase(url = testDatabaseUrl()): Promise<void> {
	const name = new URL(url).pathname.replace(/^\//, "");
	const admin = createTestInboxClient(withDatabaseName(url, () => "postgres"));
	try {
		const found = await admin.$queryRaw<Array<{ ok: number }>>`SELECT 1 AS ok FROM pg_database WHERE datname = ${name}`;
		if (found.length === 0) {
			await admin.$executeRawUnsafe(`CREATE DATABASE "${name.replaceAll('"', '""')}"`);
		}
	} finally {
		await admin.$disconnect();
	}
}

/**
 * Empty the inbox tables (children go with them through the foreign keys) and make sure
 * the offices and operators a test names exist, because a thread needs an Organization
 * and an Answer's operator needs a User.
 */
export async function resetInboxTables(
	db: PrismaClient,
	{ offices = [], operators = [] }: { offices?: string[]; operators?: string[] } = {},
): Promise<void> {
	await db.$executeRawUnsafe(`TRUNCATE "inbox_conversation", "inbox_pipe_connection" CASCADE`);
	const now = new Date();
	for (const id of offices) {
		await db.organization.upsert({
			where: { id },
			create: { id, name: id, slug: id, createdAt: now },
			update: {},
		});
	}
	for (const id of operators) {
		await db.user.upsert({
			where: { id },
			create: {
				id,
				name: id,
				email: `${id}@test.nhip.local`,
				emailVerified: true,
				createdAt: now,
				updatedAt: now,
			},
			update: {},
		});
	}
}
```

Add the export to `packages/database/package.json`:

```json
	"exports": {
		".": "./index.ts",
		"./inbox": "./inbox/index.ts",
		"./inbox/testing": "./inbox/testing.ts"
	},
```

- [ ] **Step 4: Push the schema once per test run and run files serially**

`apps/saas/vitest.global-setup.ts`:

```ts
import { execFileSync } from "node:child_process";
import path from "node:path";

import { ensureTestDatabase, testDatabaseUrl } from "@repo/database/inbox/testing";

/**
 * Store tests need the inbox tables in the test database. Push the schema there once per
 * run; each test then truncates what it needs (`resetInboxTables`).
 */
export default async function setup(): Promise<void> {
	const url = testDatabaseUrl();
	await ensureTestDatabase(url);
	execFileSync("pnpm", ["exec", "prisma", "db", "push", "--skip-generate", "--accept-data-loss"], {
		cwd: path.resolve(import.meta.dirname, "../../packages/database"),
		env: { ...process.env, DATABASE_URL: url },
		stdio: "inherit",
	});
}
```

In `apps/saas/vitest.config.ts` change the `test` block to:

```ts
	test: {
		globals: true,
		environment: "node",
		exclude: ["**/node_modules/**", "**/tests/**", "**/.next/**"],
		globalSetup: ["./vitest.global-setup.ts"],
		// Store tests share one database and truncate it; files must not interleave.
		fileParallelism: false,
	},
```

- [ ] **Step 5: Run the test to see it pass**

Run: `pnpm --filter saas exec vitest run modules/inbox/lib/test-store.test.ts`
Expected: the global setup prints Prisma's push output for `supastarter_test`, then PASS.

If it fails with "database ... does not exist" before the push, Postgres refused the maintenance connection; check `brew services list` shows `postgresql@16` started.

- [ ] **Step 6: The saas-side helper**

`apps/saas/modules/inbox/lib/test-store.ts` (the `createInboxStore(db)` call is added in Task 3; for now it only exports the fixtures and the client):

```ts
import { createTestInboxClient, resetInboxTables } from "@repo/database/inbox/testing";

import { WALK_OFFICE_ID } from "./walk-user";

/** One client per test process; every store-backed test runs on it after a reset. */
export const testDb = createTestInboxClient();

/** The offices tests file threads under. Add to this list rather than inventing ids inline. */
export const TEST_OFFICES = ["office-a", "office-b", WALK_OFFICE_ID];

/** The operators tests approve as. `walk-user` is the mocked session in the API tests. */
export const TEST_OPERATORS = ["agent-1", "agent-2", "walk-user"];

/** Empty the inbox and make sure the fixture offices and operators exist. */
export async function resetTestInbox(): Promise<void> {
	await resetInboxTables(testDb, { offices: TEST_OFFICES, operators: TEST_OPERATORS });
}
```

- [ ] **Step 7: CI gets a Postgres**

In `.github/workflows/ci.yml`, under `env:` add:

```yaml
  TEST_DATABASE_URL: postgresql://postgres:postgres@localhost:5432/supastarter_test
```

Under `jobs: ci:` after `timeout-minutes: 20` add:

```yaml
    services:
      postgres:
        image: postgres:16
        env:
          POSTGRES_USER: postgres
          POSTGRES_PASSWORD: postgres
          POSTGRES_DB: supastarter
        ports:
          - 5432:5432
        options: >-
          --health-cmd pg_isready
          --health-interval 5s
          --health-timeout 5s
          --health-retries 10
```

- [ ] **Step 8: Gates and commit**

Run: `pnpm format && pnpm lint && pnpm --filter @repo/database type-check && pnpm --filter saas exec vitest run modules/inbox/lib/test-store.test.ts`
Expected: all exit 0.

```bash
git add packages/database/inbox/testing.ts packages/database/package.json apps/saas/vitest.global-setup.ts apps/saas/vitest.config.ts apps/saas/modules/inbox/lib/test-store.ts apps/saas/modules/inbox/lib/test-store.test.ts .github/workflows/ci.yml
git commit -m "test(inbox): a Postgres test database, pushed once and reset per test (ADR 0012)"
```

---

### Task 3: The store on Prisma

**Files:**
- Rewrite: `packages/database/inbox/store.ts`
- Modify: `packages/database/inbox/types.ts:186-231`
- Modify: `packages/database/inbox/index.ts`
- Delete: `packages/database/inbox/ensure-schema.ts`, `packages/database/inbox/sqlite-path.ts`, `packages/database/prisma/queries/inbox.ts`
- Modify: `packages/database/prisma/queries/index.ts`, `packages/database/package.json` (dependencies)
- Modify: `apps/saas/modules/inbox/lib/test-store.ts` (add `testInboxStore`)
- Test: `apps/saas/modules/inbox/lib/store.test.ts` (ported), `apps/saas/modules/inbox/lib/funnel.test.ts` (ported)

**Interfaces:**
- Produces: `createInboxStore(db: PrismaClient): InboxStore` from `@repo/database/inbox`; `testInboxStore(): Promise<InboxStore>` from `apps/saas/modules/inbox/lib/test-store.ts`.
- Consumes: Task 1 models, Task 2 helpers.

- [ ] **Step 1: Port `store.test.ts` to the test database (the failing tests)**

Replace the head of `apps/saas/modules/inbox/lib/store.test.ts` (everything before the first `test(`) with:

```ts
import { conversationId } from "@repo/database/inbox";
import { expect, test } from "vitest";

import { oneShot } from "./draft";
import { testDb, testInboxStore } from "./test-store";

const OFFICE = "office-a";
const OTHER_OFFICE = "office-b";
/** The id of a Zalo thread in office A. */
const zalo = (guestId: string) => conversationId(OFFICE, "zalo", guestId);

const inbound = (guestId: string, text = "Xin chào", pipeExternalId: string | null = null) => ({
	pipe: "zalo" as const,
	source: "guest" as const,
	guestId,
	guestName: null,
	text,
	vendorMessageId: null,
	pipeExternalId,
});

const mockSend = (to: string) => ({
	mock: true,
	pipe: "zalo" as const,
	to,
	vendorMessageId: `mock-${to}`,
});

type Store = Awaited<ReturnType<typeof testInboxStore>>;

/** Approve and deliver in one go: the happy path of an Answer (ADR 0011). */
async function answer(store: Store, conversationId: string, inboundId: string, text: string) {
	const begun = await store.beginAnswer({ conversationId, inboundId, text, operatorId: "agent-1" });
	if (!begun.ok) throw new Error(`beginAnswer: ${begun.reason}`);
	return store.completeAnswer(begun.answer.id, mockSend(conversationId.split(":").at(-1) ?? ""));
}
```

Then:

1. Delete the three tests that inspected the SQLite file: `"store opens in WAL mode..."`, `"a file from before tenancy drops the person column..."`, `"a file from before the Answer folds its sends into Answers..."` (the last two run to the end of the file).
2. In every remaining test replace `const store = createInboxStore(tempDb());` with `const store = await testInboxStore();`.
3. Replace the first test with this one, which keeps the one fact the WAL test still guarded and adds the concurrency proof the unique index gives:

```ts
test("one Answer per guest message: two approvals in the same instant let one in", async () => {
	const store = await testInboxStore();
	const conv = await store.upsertInbound(inbound("race"), OFFICE);
	const inboundId = conv.unansweredInboundId!;
	const input = { conversationId: zalo("race"), inboundId, text: "reply", operatorId: "agent-1" };
	const [first, second] = await Promise.all([store.beginAnswer(input), store.beginAnswer(input)]);
	const outcomes = [first, second].map((r) => (r.ok ? "ok" : r.reason)).sort();
	expect(outcomes).toEqual(["in_progress", "ok"]);
	expect(await testDb.answer.count({ where: { inboundId } })).toBe(1);
	await store.close();
});
```

4. Add one test for the cascade the ADR promises:

```ts
test("deleting an office deletes its threads and pipe connections", async () => {
	const store = await testInboxStore();
	await store.upsertInbound(inbound("gone"), OFFICE);
	await store.connectPipe({ pipe: "zalo", externalId: "oa-gone", officeId: OFFICE });
	await store.upsertInbound(inbound("stays"), OTHER_OFFICE);
	await testDb.organization.delete({ where: { id: OFFICE } });
	expect(await store.listConversations()).toHaveLength(1);
	expect(await store.officeForPipe("zalo", "oa-gone")).toBeNull();
	await store.close();
});
```

- [ ] **Step 2: Port `funnel.test.ts`**

Replace its imports and helpers (everything before the first `test(`) with:

```ts
import { Funnel, conversationId } from "@repo/database/inbox";
import { expect, test } from "vitest";

import { testInboxStore } from "./test-store";

/**
 * The funnel (ADR 0002) counted from Answers (ADR 0011): a lead is a guest who first
 * wrote in during the window; engaged is a lead with a `sent` Answer; in conversation is
 * a lead who wrote again after that send; response time is first inbound to first sent
 * Answer. Everything is scoped to the viewer's office.
 */

const OFFICE = "office-a";
const OTHER_OFFICE = "office-b";
const viewer = { userId: "agent-1", officeId: OFFICE };
const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;

const inbound = (guestId: string, at: number, text = "Xin chào") => ({
	pipe: "zalo" as const,
	source: "guest" as const,
	guestId,
	guestName: null,
	text,
	vendorMessageId: null,
	at,
});

type Store = Awaited<ReturnType<typeof testInboxStore>>;
```

Keep the `sent`, `notSent` and `lastInboundId` helpers as they are (they already take `Store`). In each test replace `const store = createInboxStore(tempDb());` with `const store = await testInboxStore();`.

- [ ] **Step 3: Add `testInboxStore` to the saas helper**

Append to `apps/saas/modules/inbox/lib/test-store.ts`:

```ts
import { createInboxStore, type InboxStore } from "@repo/database/inbox";

/** A store over the test database with the inbox emptied and the fixtures present. */
export async function testInboxStore(): Promise<InboxStore> {
	await resetTestInbox();
	return createInboxStore(testDb);
}
```

(Move the import to the top of the file with the others when you edit.)

- [ ] **Step 4: Run the two files to see them fail**

Run: `pnpm --filter saas exec vitest run modules/inbox/lib/store.test.ts modules/inbox/lib/funnel.test.ts`
Expected: FAIL with a type or runtime error from `createInboxStore(testDb)`, which still expects a file path.

- [ ] **Step 5: Trim the interface and the exports**

In `packages/database/inbox/types.ts` replace the `InboxStore` type with:

```ts
export type InboxStore = {
	listConversations: (viewer?: InboxViewer) => Promise<Conversation[]>;
	getConversation: (id: string, viewer?: InboxViewer) => Promise<Conversation | null>;
	/** Files the message under `officeId`; a thread that already has an office keeps it. */
	upsertInbound: (event: InboundEvent, officeId: string) => Promise<Conversation>;
	connectPipe: (connection: PipeConnection) => Promise<void>;
	officeForPipe: (pipe: Pipe, externalId: string) => Promise<string | null>;
	listPipeConnections: () => Promise<PipeConnection[]>;
	setOneShot: (id: string, oneShot: OneShot) => Promise<Conversation | null>;
	/** Replace the suggested reply without touching extraction or paperwork. */
	setDraft: (id: string, draft: Draft) => Promise<Conversation | null>;
	/** Store one guest message's rendering in one operator language. */
	setTranslation: (messageId: string, locale: OperatorLanguage, text: string) => Promise<void>;
	/**
	 * The operator approved `text` as the answer to `inboundId`: write the Answer in status
	 * `sending` before anything talks to a vendor. Atomic: a second approval of the same
	 * message, concurrent or later, is refused with a reason; a `failed` Answer is reused
	 * for the retry.
	 */
	beginAnswer: (input: {
		conversationId: string;
		inboundId: string;
		text: string;
		operatorId: string | null;
	}) => Promise<BeginAnswerResult>;
	/** The vendor acknowledged: `sent`, the outbound message on the thread, `sentAt` on it. */
	completeAnswer: (answerId: string, result: SendResult) => Promise<Conversation | null>;
	/** The vendor definitely refused: `failed`. The operator may approve again. */
	failAnswer: (answerId: string, reason: string) => Promise<void>;
	/** The vendor did not answer, or the acknowledgement could not be recorded: `unknown`. */
	markAnswerUnknown: (answerId: string, reason: string) => Promise<void>;
	guestInboundText: (id: string) => Promise<string>;
	/**
	 * The office funnel (ADR 0002) for leads whose first message landed on or after
	 * `since`, counted in SQL inside the office; no thread leaves the store for a count.
	 */
	funnel: (viewer: InboxViewer, window: { since: Date }) => Promise<Funnel>;
	/** Release the database connection. Scripts call it; the app never does. */
	close: () => Promise<void>;
};
```

Also in `types.ts`, on `Conversation.officeId`, replace the doc comment and type with:

```ts
	/** The office (ADR 0008) this thread belongs to: the kit organization's id. Required (ADR 0012). */
	officeId: string;
```

`packages/database/inbox/index.ts` becomes:

```ts
/**
 * The vocabulary comes straight from `./schema`, where each name is both a zod schema and
 * the type inferred from it. One plain `export` therefore hands consumers the runtime
 * check and the type under a single name, so `import type { Pipe }` keeps working while
 * `import { Pipe }` now also gets something that can parse. Re-exporting these by name
 * rather than as a namespace is what makes that source-compatible.
 *
 * `DbMessageSource` is deliberately not here: the `oa_echo` spelling is how the store
 * writes to disk, not something the domain should be able to reach for.
 */
export {
	AnswerStatus,
	DraftSource,
	Funnel,
	GuestLanguage,
	MessageDirection,
	MessageSource,
	OperatorLanguage,
	Pipe,
	RentOrBuy,
	ResponseTime,
	Timestamp,
} from "./schema";
export type {
	Answer,
	BeginAnswerResult,
	Conversation,
	Draft,
	InboundEvent,
	InboxStore,
	InboxViewer,
	Message,
	OneShot,
	Paperwork,
	PipeConnection,
	Qualification,
	SendMode,
	SendResult,
	Translations,
} from "./types";
export { conversationId, createInboxStore, nowIso } from "./store";
```

Delete `packages/database/inbox/ensure-schema.ts`, `packages/database/inbox/sqlite-path.ts` and `packages/database/prisma/queries/inbox.ts`. In `packages/database/prisma/queries/index.ts` remove the line that re-exports `./inbox`. In `packages/database/package.json` remove `"better-sqlite3": "^12.4.1",` from dependencies and `"@types/better-sqlite3": "^7.6.13",` from devDependencies, then run `pnpm install` so the lockfile follows.

- [ ] **Step 6: Rewrite `store.ts` on Prisma**

`packages/database/inbox/store.ts`:

```ts
import { createId as cuid } from "@paralleldrive/cuid2";
import { z } from "zod";

import type { Prisma, PrismaClient } from "../prisma/generated/client";
import {
	AnswerStatus,
	DbMessageSource,
	GuestLanguage,
	MessageSource,
	OperatorLanguage,
	RentOrBuy,
} from "./schema";
import type {
	Answer,
	BeginAnswerResult,
	Conversation,
	Draft,
	Funnel,
	InboundEvent,
	InboxStore,
	InboxViewer,
	Message,
	OneShot,
	SendResult,
	Translations,
} from "./types";

export function nowIso(at?: number | string | Date): string {
	if (at instanceof Date) {
		return at.toISOString();
	}
	if (typeof at === "number") {
		return new Date(at).toISOString();
	}
	if (typeof at === "string" && at) {
		return new Date(at).toISOString();
	}
	return new Date().toISOString();
}

/**
 * One thread per guest per office (ADR 0010). The office is part of the identity, so the
 * same guest writing to two offices is two threads that never see each other. The id is
 * part of every route, so it keeps this shape; the unique key is the triple.
 */
export function conversationId(officeId: string, pipe: string, guestId: string): string {
	return `${officeId}:${pipe}:${guestId}`;
}

/** Everything a `Conversation` is built from, in one read. */
const CONVERSATION_INCLUDE = {
	messages: { orderBy: [{ at: "asc" }, { seq: "asc" }], include: { translations: true } },
	qualification: true,
	draft: true,
	paperwork: true,
	answers: { orderBy: [{ approvedAt: "asc" }, { seq: "asc" }] },
} satisfies Prisma.ConversationInclude;

type ConversationRecord = Prisma.ConversationGetPayload<{ include: typeof CONVERSATION_INCLUDE }>;
type MessageRecord = ConversationRecord["messages"][number];
type AnswerRecord = ConversationRecord["answers"][number];
type Db = PrismaClient | Prisma.TransactionClient;

/** An Answer that counts as the office's reply: in flight, delivered, or possibly delivered. */
const ANSWERING_STATUSES: readonly AnswerStatus[] = ["sending", "sent", "unknown"];

/**
 * Languages and rent-or-buy are text on disk (ADR 0012) so the lists can grow without a
 * schema change. This store is their only writer, so a value outside the vocabulary is
 * corrupt state: fail at the read rather than hand the domain something it cannot name.
 */
function vocab<Schema extends z.ZodType>(schema: Schema, value: unknown, where: string): z.infer<Schema> {
	const parsed = schema.safeParse(value);
	if (!parsed.success) {
		throw new Error(
			`Inbox store: ${where} holds a value outside the vocabulary.\n${z.prettifyError(parsed.error)}`,
		);
	}
	return parsed.data;
}

const iso = (at: Date): string => at.toISOString();
const isoOrNull = (at: Date | null): string | null => (at ? at.toISOString() : null);

function toDbSource(source: MessageSource): DbMessageSource {
	return source === "oa-echo" ? "oa_echo" : source;
}

function fromDbSource(source: DbMessageSource): MessageSource {
	return source === "oa_echo" ? "oa-echo" : source;
}

function mapMessage(row: MessageRecord): Message {
	const translations: Translations = {};
	for (const translation of row.translations) {
		translations[vocab(OperatorLanguage, translation.locale, "Translation.locale")] =
			translation.text;
	}
	return {
		id: row.id,
		direction: row.direction,
		source: fromDbSource(row.source),
		text: row.text,
		at: iso(row.at),
		vendorMessageId: row.vendorMessageId,
		mock: row.mock ? true : undefined,
		pipeExternalId: row.pipeExternalId,
		translations,
	};
}

function mapAnswer(row: AnswerRecord): Answer {
	return {
		id: row.id,
		conversationId: row.conversationId,
		inboundId: row.inboundId,
		text: row.text,
		operatorId: row.operatorId,
		status: row.status,
		mock: row.mock,
		pipe: row.pipe,
		to: row.to,
		pipeExternalId: row.pipeExternalId,
		vendorMessageId: row.vendorMessageId,
		approvedAt: iso(row.approvedAt),
		sentAt: isoOrNull(row.sentAt),
		failedAt: isoOrNull(row.failedAt),
		failureReason: row.failureReason,
	};
}

/**
 * Every method that returns a `Conversation` bottoms out here. "Your turn" is derived
 * here too (ADR 0011): the guest's latest message is unanswered unless an Answer is in
 * flight, sent or of unknown outcome for it, or the agent replied from the OA app after
 * it. Message order alone does not decide, so a guest message that lands mid-send is not
 * hidden by the outbound that answers an earlier one.
 */
function mapConversation(record: ConversationRecord): Conversation {
	const messages = record.messages.map(mapMessage);
	const answers = record.answers.map(mapAnswer);

	const oneShot: OneShot | null =
		record.language && record.qualification && record.draft && record.paperwork
			? {
					language: vocab(GuestLanguage, record.language, "Conversation.language"),
					qualification: {
						areaOfInterest: record.qualification.areaOfInterest,
						nationality: record.qualification.nationality,
						inVietnamNow: record.qualification.inVietnamNow,
						rentOrBuy: vocab(
							RentOrBuy.nullable(),
							record.qualification.rentOrBuy,
							"Qualification.rentOrBuy",
						),
						timeframe: record.qualification.timeframe,
						budgetBand: record.qualification.budgetBand,
						bedsOrHousehold: record.qualification.bedsOrHousehold,
					},
					paperwork: { mentioned: record.paperwork.mentioned, flag: record.paperwork.flag },
					draft: {
						reply: record.draft.reply,
						answersMessageId: record.draft.answersMessageId,
						source: record.draft.source,
					},
				}
			: null;

	let unansweredInboundId: string | null = null;
	for (let i = messages.length - 1; i >= 0; i -= 1) {
		const message = messages[i];
		if (message.direction === "in") {
			const answered = answers.some(
				(answer) => answer.inboundId === message.id && ANSWERING_STATUSES.includes(answer.status),
			);
			const echoedAfter = messages
				.slice(i + 1)
				.some((later) => later.direction === "out" && later.source === "oa-echo");
			unansweredInboundId = answered || echoedAfter ? null : message.id;
			break;
		}
	}

	return {
		id: record.id,
		pipe: record.pipe,
		guestId: record.guestId,
		guestName: record.guestName,
		officeId: record.officeId,
		messages,
		lastGuestInboundAt: isoOrNull(record.lastGuestInboundAt),
		sentAt: isoOrNull(record.sentAt),
		unansweredInboundId,
		oneShot,
		answers,
		lastAnswer: answers.at(-1) ?? null,
		updatedAt: iso(record.updatedAt),
	};
}

/** Prisma's unique-violation code. Duck-typed so no error class has to be imported. */
function isUniqueViolation(error: unknown): boolean {
	return typeof error === "object" && error !== null && (error as { code?: unknown }).code === "P2002";
}

/** The nearest-rank percentile of an ascending list: `p` in (0, 1], never interpolated. */
function nearestRank(sorted: number[], p: number): number {
	return sorted[Math.max(0, Math.ceil(p * sorted.length) - 1)];
}

export function createInboxStore(db: PrismaClient): InboxStore {
	async function load(id: string, client: Db = db): Promise<Conversation | null> {
		const record = await client.conversation.findUnique({
			where: { id },
			include: CONVERSATION_INCLUDE,
		});
		return record ? mapConversation(record) : null;
	}

	async function exists(id: string): Promise<boolean> {
		return (await db.conversation.count({ where: { id } })) > 0;
	}

	return {
		async listConversations(viewer?: InboxViewer) {
			const records = await db.conversation.findMany({
				where: viewer ? { officeId: viewer.officeId } : undefined,
				orderBy: { updatedAt: "desc" },
				include: CONVERSATION_INCLUDE,
			});
			return records.map(mapConversation);
		},

		async getConversation(id, viewer?: InboxViewer) {
			const conversation = await load(id);
			if (!conversation) {
				return null;
			}
			if (viewer && conversation.officeId !== viewer.officeId) {
				return null;
			}
			return conversation;
		},

		async upsertInbound(event: InboundEvent, officeId: string) {
			const at = new Date(nowIso(event.at));
			const id = await db.$transaction(async (tx) => {
				// The thread is found by (office, pipe, guest), never by the id's shape.
				const existing = await tx.conversation.findUnique({
					where: { officeId_pipe_guestId: { officeId, pipe: event.pipe, guestId: event.guestId } },
					select: { id: true, guestName: true },
				});
				const threadId = existing?.id ?? conversationId(officeId, event.pipe, event.guestId);
				if (existing) {
					await tx.conversation.update({
						where: { id: threadId },
						data: { guestName: existing.guestName ?? (event.guestName || null), updatedAt: at },
					});
				} else {
					await tx.conversation.create({
						data: {
							id: threadId,
							pipe: event.pipe,
							guestId: event.guestId,
							guestName: event.guestName || null,
							officeId,
							updatedAt: at,
						},
					});
				}

				if (event.vendorMessageId) {
					const duplicate = await tx.message.findFirst({
						where: { conversationId: threadId, vendorMessageId: event.vendorMessageId },
						select: { id: true },
					});
					if (duplicate) {
						return threadId;
					}
				}

				await tx.message.create({
					data: {
						id: cuid(),
						conversationId: threadId,
						direction: event.source === "guest" ? "in" : "out",
						source: toDbSource(event.source),
						text: event.text,
						at,
						vendorMessageId: event.vendorMessageId || null,
						pipeExternalId: event.pipeExternalId ?? null,
					},
				});

				if (event.source === "guest") {
					await tx.conversation.update({
						where: { id: threadId },
						data: { lastGuestInboundAt: at, updatedAt: at },
					});
				}
				return threadId;
			});
			return (await load(id)) as Conversation;
		},

		async setOneShot(id, shot: OneShot) {
			if (!(await exists(id))) {
				return null;
			}
			const q = shot.qualification;
			const paperwork = { mentioned: shot.paperwork.mentioned, flag: shot.paperwork.flag };
			await db.$transaction([
				db.qualification.upsert({
					where: { conversationId: id },
					create: { conversationId: id, ...q },
					update: { ...q },
				}),
				db.draft.upsert({
					where: { conversationId: id },
					create: { conversationId: id, ...shot.draft },
					update: { ...shot.draft },
				}),
				db.paperwork.upsert({
					where: { conversationId: id },
					create: { conversationId: id, ...paperwork },
					update: paperwork,
				}),
				db.conversation.update({
					where: { id },
					data: { language: shot.language, updatedAt: new Date() },
				}),
			]);
			return load(id);
		},

		async setDraft(id, draft: Draft) {
			if (!(await exists(id))) {
				return null;
			}
			await db.draft.upsert({
				where: { conversationId: id },
				create: { conversationId: id, ...draft },
				update: { ...draft },
			});
			return load(id);
		},

		async setTranslation(messageId, locale, text) {
			await db.translation.upsert({
				where: { messageId_locale: { messageId, locale } },
				create: { messageId, locale, text },
				update: { text },
			});
		},

		async beginAnswer(input) {
			try {
				return await db.$transaction(async (tx): Promise<BeginAnswerResult> => {
					const inbound = await tx.message.findFirst({
						where: { id: input.inboundId, conversationId: input.conversationId },
						select: {
							direction: true,
							pipeExternalId: true,
							conversation: { select: { pipe: true, guestId: true } },
						},
					});
					if (!inbound || inbound.direction !== "in") {
						throw new Error("Inbox store: beginAnswer needs a guest message on this thread.");
					}
					const existing = await tx.answer.findUnique({ where: { inboundId: input.inboundId } });
					const now = new Date();
					if (existing) {
						if (existing.status === "sent") return { ok: false, reason: "already_answered" };
						if (existing.status === "sending") return { ok: false, reason: "in_progress" };
						if (existing.status === "unknown") return { ok: false, reason: "unknown" };
						// A definite failure is retried on the same row: one Answer per inbound, always.
						const retried = await tx.answer.update({
							where: { id: existing.id },
							data: {
								status: "sending",
								text: input.text,
								operatorId: input.operatorId,
								approvedAt: now,
								failedAt: null,
								failureReason: null,
								vendorMessageId: null,
							},
						});
						return { ok: true, answer: mapAnswer(retried) };
					}
					const created = await tx.answer.create({
						data: {
							id: cuid(),
							conversationId: input.conversationId,
							inboundId: input.inboundId,
							text: input.text,
							operatorId: input.operatorId,
							status: "sending",
							pipe: inbound.conversation.pipe,
							to: inbound.conversation.guestId,
							pipeExternalId: inbound.pipeExternalId,
							approvedAt: now,
						},
					});
					return { ok: true, answer: mapAnswer(created) };
				});
			} catch (error) {
				// Two approvals in the same instant: the unique index on inboundId lets one in.
				if (isUniqueViolation(error)) {
					return { ok: false, reason: "in_progress" };
				}
				throw error;
			}
		},

		async completeAnswer(answerId, result: SendResult) {
			const answer = await db.answer.findUnique({ where: { id: answerId } });
			if (!answer) {
				return null;
			}
			if (answer.status !== "sending") {
				throw new Error(`Inbox store: completeAnswer on an Answer that is ${answer.status}.`);
			}
			const at = new Date();
			await db.$transaction([
				db.answer.update({
					where: { id: answerId },
					data: {
						status: "sent",
						sentAt: at,
						mock: result.mock,
						vendorMessageId: result.vendorMessageId,
						to: result.to,
					},
				}),
				db.message.create({
					data: {
						id: cuid(),
						conversationId: answer.conversationId,
						direction: "out",
						source: "nhip",
						text: answer.text,
						at,
						vendorMessageId: result.vendorMessageId || null,
						mock: result.mock,
						pipeExternalId: answer.pipeExternalId,
					},
				}),
				db.conversation.update({
					where: { id: answer.conversationId },
					data: { sentAt: at, updatedAt: at },
				}),
			]);
			return load(answer.conversationId);
		},

		async failAnswer(answerId, reason) {
			await db.answer.updateMany({
				where: { id: answerId, status: "sending" },
				data: { status: "failed", failedAt: new Date(), failureReason: reason },
			});
		},

		async markAnswerUnknown(answerId, reason) {
			await db.answer.updateMany({
				where: { id: answerId, status: "sending" },
				data: { status: "unknown", failedAt: new Date(), failureReason: reason },
			});
		},

		async connectPipe(connection) {
			await db.pipeConnection.upsert({
				where: { pipe_externalId: { pipe: connection.pipe, externalId: connection.externalId } },
				create: connection,
				update: { officeId: connection.officeId },
			});
		},

		async officeForPipe(pipe, externalId) {
			const found = await db.pipeConnection.findUnique({
				where: { pipe_externalId: { pipe, externalId } },
				select: { officeId: true },
			});
			return found?.officeId ?? null;
		},

		async listPipeConnections() {
			return db.pipeConnection.findMany({
				orderBy: [{ pipe: "asc" }, { externalId: "asc" }],
				select: { pipe: true, externalId: true, officeId: true },
			});
		},

		async guestInboundText(id) {
			const messages = await db.message.findMany({
				where: { conversationId: id, source: "guest" },
				orderBy: [{ at: "asc" }, { seq: "asc" }],
				select: { text: true },
			});
			return messages.map((message) => message.text).join("\n");
		},

		async funnel(viewer, window) {
			const since = new Date(nowIso(window.since));
			const until = new Date();
			// One row per cohort lead, never per message; the percentiles are the only thing
			// left for JavaScript.
			const leads = await db.$queryRaw<
				Array<{ firstInboundAt: Date; firstSentAt: Date | null; wroteBack: boolean }>
			>`
				WITH "first" AS (
					SELECT "conversationId", MIN("at") AS "firstInboundAt"
					FROM "inbox_message" WHERE "direction" = 'in' GROUP BY "conversationId"
				),
				"reached" AS (
					SELECT "conversationId", MIN("sentAt") AS "firstSentAt"
					FROM "inbox_answer" WHERE "status" = 'sent' GROUP BY "conversationId"
				)
				SELECT "first"."firstInboundAt" AS "firstInboundAt",
				       "reached"."firstSentAt" AS "firstSentAt",
				       EXISTS (
				         SELECT 1 FROM "inbox_message" "later"
				         WHERE "later"."conversationId" = "c"."id"
				           AND "later"."direction" = 'in'
				           AND "later"."at" > "reached"."firstSentAt"
				       ) AS "wroteBack"
				FROM "inbox_conversation" "c"
				JOIN "first" ON "first"."conversationId" = "c"."id"
				LEFT JOIN "reached" ON "reached"."conversationId" = "c"."id"
				WHERE "c"."officeId" = ${viewer.officeId} AND "first"."firstInboundAt" >= ${since}
			`;
			const durations = leads
				.flatMap((lead) =>
					lead.firstSentAt ? [lead.firstSentAt.getTime() - lead.firstInboundAt.getTime()] : [],
				)
				.map((ms) => Math.max(0, ms))
				.sort((a, b) => a - b);
			const funnel: Funnel = {
				since: iso(since),
				until: iso(until),
				leadsIn: leads.length,
				engaged: durations.length,
				inConversation: leads.filter((lead) => lead.firstSentAt && lead.wroteBack).length,
				responseTime:
					durations.length === 0
						? null
						: {
								answered: durations.length,
								medianMs: nearestRank(durations, 0.5),
								p90Ms: nearestRank(durations, 0.9),
							},
			};
			return funnel;
		},

		async close() {
			await db.$disconnect();
		},
	};
}
```

- [ ] **Step 7: Run the two files to see them pass**

Run: `pnpm --filter saas exec vitest run modules/inbox/lib/store.test.ts modules/inbox/lib/funnel.test.ts`
Expected: PASS, all tests. If Prisma rejects the `in` enum value name at `generate` time in Task 1, rename the enum values to `inbound`/`outbound` with `@map("in")`/`@map("out")` and map `"in" ↔ "inbound"` next to `toDbSource`; this plan assumes `in` is accepted, which Prisma's grammar permits.

- [ ] **Step 8: Type-check the database package and commit**

Run: `pnpm format && pnpm lint && pnpm --filter @repo/database type-check`
Expected: exit 0. (`saas` type-check still fails until Task 4 re-points the runtime; that is expected here.)

```bash
git add packages/database/inbox/store.ts packages/database/inbox/types.ts packages/database/inbox/index.ts packages/database/prisma/queries/index.ts packages/database/package.json pnpm-lock.yaml apps/saas/modules/inbox/lib/test-store.ts apps/saas/modules/inbox/lib/store.test.ts apps/saas/modules/inbox/lib/funnel.test.ts
git rm -q packages/database/inbox/ensure-schema.ts packages/database/inbox/sqlite-path.ts packages/database/prisma/queries/inbox.ts
git commit -m "feat(inbox): the store runs on Prisma in Postgres (ADR 0012)"
```

---

### Task 4: The app, the seed and the remaining tests on the new store

**Files:**
- Modify: `apps/saas/modules/inbox/lib/runtime.ts:1,42`
- Modify: `apps/saas/modules/inbox/lib/approve.test.ts:75-100`, `loop.test.ts:60-100`, `pipes/webhook.test.ts:30-55`, `seed.test.ts`
- Modify: `apps/saas/modules/inbox/lib/walk-user.ts`, `apps/saas/modules/inbox/scripts/seed.ts`, `seed-walk-user.ts`, `seed-walk-office.ts`, `connect-pipe.ts`

**Interfaces:**
- Consumes: `createInboxStore(db)` from Task 3, `resetTestInbox`, `testDb` from Task 2/3.

- [ ] **Step 1: Point the runtime at the kit's client**

In `apps/saas/modules/inbox/lib/runtime.ts` replace the first import with:

```ts
import { db } from "@repo/database";
import { createInboxStore, type InboxStore } from "@repo/database/inbox";
```

and `store: createInboxStore(sqlitePathFromEnv()),` with `store: createInboxStore(db),`.

- [ ] **Step 2: Re-point the API tests**

In `approve.test.ts`, `loop.test.ts` and `pipes/webhook.test.ts`:

1. Remove the `fs`, `os`, `path` imports and the `createInboxStore` import from `@repo/database/inbox` (keep any other name imported from it, such as `Pipe`).
2. Add `import { testDb, resetTestInbox } from "../lib/test-store";` (from `pipes/`) or `"./test-store"` (from `lib/`), and `import { createInboxStore } from "@repo/database/inbox";`.
3. Make each `beforeEach` async, and replace `const dir = fs.mkdtempSync(...)` plus `store: createInboxStore(path.join(dir, "nhip.db")),` with `await resetTestInbox();` before `setRuntimeForTests({ store: createInboxStore(testDb), ...` (the rest of the runtime object unchanged).

The `afterEach` blocks that call `runtime.store.close()` stay; `$disconnect` on the shared client is followed by a lazy reconnect.

- [ ] **Step 3: Re-point `seed.test.ts` and drop its legacy-id case**

Replace the imports and `afterEach` at the top of `seed.test.ts` with:

```ts
import { createInboxStore } from "@repo/database/inbox";
import { afterEach, expect, test } from "vitest";

import { mockInboxConfig } from "./config";
import { oneShot } from "./draft";
import { noDraftAdapter } from "./drafts";
import { peekTestRuntime, setRuntimeForTests } from "./runtime";
import { DEMO_THREADS, seedInbox } from "./seed";
import { resetTestInbox, testDb } from "./test-store";
import { WALK_OFFICE_ID } from "./walk-user";

afterEach(async () => {
	const runtime = peekTestRuntime();
	if (runtime) {
		await runtime.store.close();
	}
	setRuntimeForTests(null);
});
```

Replace the test `"seed finds an adopted pre-tenancy thread by guest and does not write it twice"` with:

```ts
test("seed finds an existing thread by guest and does not write it twice", async () => {
	await resetTestInbox();
	const store = createInboxStore(testDb);
	setRuntimeForTests({ store, config: mockInboxConfig(), drafts: noDraftAdapter });
	const earlier = await store.upsertInbound(
		{
			pipe: "zalo",
			source: "guest",
			guestId: "demo-vi-tayho",
			guestName: "Thảo",
			text: "old message",
			vendorMessageId: null,
		},
		WALK_OFFICE_ID,
	);
	const seeded = await seedInbox(WALK_OFFICE_ID);
	expect(seeded).toHaveLength(4);
	const thao = seeded.find((conversation) => conversation.guestId === "demo-vi-tayho");
	expect(thao?.id).toBe(earlier.id);
	expect(thao?.messages.map((message) => message.text)).toEqual(["old message"]);
	expect(await store.listConversations({ userId: "seed", officeId: WALK_OFFICE_ID })).toHaveLength(
		4,
	);
});
```

In `"seed writes invented threads once"` replace the `mkdtempSync` line and the `setRuntimeForTests({ store: createInboxStore(path.join(dir, "nhip.db")), ...` call with:

```ts
	await resetTestInbox();
	setRuntimeForTests({
		store: createInboxStore(testDb),
		config: mockInboxConfig(),
		drafts: noDraftAdapter,
	});
```

Any test in that file that used `sqliteFilePath` or `sqlitePathFromEnv` is deleted; those exports no longer exist.

- [ ] **Step 4: Run the whole suite to see it pass**

Run: `pnpm --filter saas test`
Expected: PASS. If a test fails with a foreign-key error naming an office or operator id, add that id to `TEST_OFFICES` or `TEST_OPERATORS` in `test-store.ts` rather than creating rows inline.

- [ ] **Step 5: Postgres is the only database in the scripts**

`apps/saas/modules/inbox/lib/walk-user.ts`: delete `isPostgresDatabaseUrl` and `canUseKitAuthDatabase`, and delete `walk-user.test.ts` (its only subject was `isPostgresDatabaseUrl`). Rewrite the doc comment on `WALK_OFFICE_ID` to:

```ts
/**
 * The walk office (ADR 0008): the kit organization the walk operator belongs to and the
 * invented threads are filed under. Its id is fixed so seeding is idempotent.
 */
```

`apps/saas/modules/inbox/scripts/seed-walk-user.ts`: change the result type to `"created" | "exists"`, remove the `databaseUrl` parameter and the `canUseKitAuthDatabase` check from `seedLogin`, `seedWalkUser` and `seedWalkAdmin`, and drop `canUseKitAuthDatabase` from the import.

`apps/saas/modules/inbox/scripts/seed-walk-office.ts`: same: result type `"created" | "exists"`, no `databaseUrl` parameter, no `canUseKitAuthDatabase` check or import.

`apps/saas/modules/inbox/scripts/seed.ts` becomes:

```ts
import { settleBackgroundWork } from "../lib/background";
import { getRuntime } from "../lib/runtime";
import { DEMO_THREADS, seedInbox } from "../lib/seed";
import {
	WALK_ADMIN_EMAIL,
	WALK_OFFICE_ID,
	WALK_USER_EMAIL,
	WALK_USER_PASSWORD,
} from "../lib/walk-user";
import { seedWalkOffice } from "./seed-walk-office";
import { seedWalkAdmin, seedWalkUser } from "./seed-walk-user";

async function main(): Promise<void> {
	const { store } = getRuntime();

	const walkUser = await seedWalkUser();
	const walkAdmin = await seedWalkAdmin();
	const walkOffice = await seedWalkOffice();
	console.info(
		`Agent login ${walkUser === "exists" ? "already exists" : "created"}: ${WALK_USER_EMAIL} / ${WALK_USER_PASSWORD}`,
	);
	console.info(
		`Admin login ${walkAdmin === "exists" ? "already exists" : "created"}: ${WALK_ADMIN_EMAIL} / ${WALK_USER_PASSWORD} (platform admin, owner of the walk office)`,
	);
	console.info(
		`Walk office ${walkOffice === "exists" ? "already exists" : "created"}: ${WALK_OFFICE_ID}\n`,
	);

	const owned = await store.listConversations({ userId: "seed", officeId: WALK_OFFICE_ID });
	const existing = DEMO_THREADS.filter((thread) =>
		owned.some((conv) => conv.pipe === thread.pipe && conv.guestId === thread.guestId),
	).length;
	const conversations = await seedInbox(WALK_OFFICE_ID);
	for (const conv of conversations) {
		const q = conv.oneShot?.qualification;
		const paper = conv.oneShot?.paperwork?.mentioned ? "paperwork flagged" : "no paperwork";
		console.info(
			`${conv.id}  ${conv.guestName}  ${q?.rentOrBuy ?? "—"}  ${q?.timeframe ?? "—"}  ${q?.areaOfInterest ?? "—"}  ${paper}`,
		);
	}
	const created = conversations.length - existing;
	console.info(
		`\n${conversations.length} demo threads in ${WALK_OFFICE_ID}` +
			(existing ? ` (wrote ${created}, skipped ${existing} existing)` : " (fresh write)"),
	);
	console.info(
		"Re-run skips threads that already exist. Delete the office's threads in the database for a fresh set.",
	);
	console.info("Open http://localhost:3010 — sign in, then Inbox. Nothing here is a real guest.");
	// Translations (ADR 0007) run in the background after each inbound; let them land
	// before the connection is released under them.
	await settleBackgroundWork();
	await store.close();
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
```

`apps/saas/modules/inbox/scripts/connect-pipe.ts`: remove the `--adopt-unowned` branch (the `if (process.argv.includes("--adopt-unowned")) {...}` block), the `[--adopt-unowned]` in the usage string, and the two doc-comment lines that mention it.

- [ ] **Step 6: Gates, seed, commit**

Run: `pnpm format && pnpm lint && pnpm type-check && pnpm --filter saas test && pnpm --filter saas seed:check`
Expected: all exit 0.

Run: `pnpm seed` (against `DATABASE_URL`, your dev database)
Expected: the four demo threads print with `walk-office:...` ids and "(fresh write)"; a second run prints "skipped 4 existing".

```bash
git add apps/saas/modules/inbox/lib/runtime.ts apps/saas/modules/inbox/lib/approve.test.ts apps/saas/modules/inbox/lib/loop.test.ts apps/saas/modules/inbox/lib/pipes/webhook.test.ts apps/saas/modules/inbox/lib/seed.test.ts apps/saas/modules/inbox/lib/walk-user.ts apps/saas/modules/inbox/scripts/seed.ts apps/saas/modules/inbox/scripts/seed-walk-user.ts apps/saas/modules/inbox/scripts/seed-walk-office.ts apps/saas/modules/inbox/scripts/connect-pipe.ts
git rm -q apps/saas/modules/inbox/lib/walk-user.test.ts
git commit -m "feat(inbox): the app, the seed and the tests run on the Prisma store (ADR 0012)"
```

---

### Task 5: Docs, the dev-server walk, the PR

**Files:**
- Modify: `HANDOFF.md`, `ARCHITECTURE.md`, `AGENTS.md`, `README.md`, `.env.local.example`, `.gitignore`, `docs/adr/0010-office-assignment.md`

- [ ] **Step 1: HANDOFF.md**

In "Run locally", replace the paragraph starting `pnpm seed` writes four invented threads with:

```markdown
`pnpm seed` writes four invented threads (Minji, Yuki, Alexei, Thảo) into the walk office
once. Delete that office's threads in the database for a fresh set. `POST /dev/inbound`
injects an inbound locally (404 in production). Default `SEND_MODE=mock`; only the exact
value `live` talks to a vendor, and live needs the webhook secrets set or inbound is
refused.

Tests need a second database on the same server, `supastarter_test` by default
(`TEST_DATABASE_URL` overrides it). The vitest global setup creates it and pushes the
schema; every store test truncates the inbox tables before it runs.
```

In the same section, replace the line `Gates before a commit: ... Do not commit untracked local scripts or `data/`.` ending with `Do not commit untracked local scripts.`

In "Key paths", replace the `packages/database/inbox/` row's "Why" with `Prisma inbox store, zod vocabulary, test helpers`.

In "Rules that hold", replace the office paragraph's sentence `Webhooks file under the office that owns the pipe (`pnpm --filter saas pipe:connect`), inbound on an unconnected pipe is dropped, and a reply is refused when the thread's number is not the one the credentials belong to.` with:

```markdown
  Webhooks file under the office that owns the pipe (`pnpm --filter saas pipe:connect`),
  inbound on an unconnected pipe is dropped, and a reply is refused when the thread's
  number is not the one the credentials belong to. Every thread has an office from birth
  (ADR 0012); deleting an office deletes its threads.
```

In the go-live "Checklist", remove the `--adopt-unowned` sentence from the pipe-connect bullet, replace the last bullet (`Run on one long-lived Node process with a real disk...`) with:

```markdown
- Before the first production deploy, baseline the schema with `prisma migrate` (ADR 0012
  keeps `db push` for development only) and point `DATABASE_URL` at the production
  Postgres. The inbox and the auth tables live in the same database.
```

- [ ] **Step 2: ARCHITECTURE.md**

Line 22: `packages/database  Auth schema (Prisma/Postgres) + inbox SQLite store` becomes `packages/database  Prisma schema: auth (kit) and inbox (ADR 0012), one Postgres`.

Replace the "Auth vs inbox data" section's table row for inbox threads and the two paragraphs after it with:

```markdown
| Inbox threads   | The same Postgres, `inbox_*` tables via `@repo/database/inbox`                                                | Conversations, messages, extract, draft, Answers |

One database (ADR 0012). The inbox models live in `schema.prisma` next to the kit's;
`Conversation.officeId` and `PipeConnection.officeId` reference `Organization` with
cascade delete, `Answer.operatorId` references `User` with set-null. Schema changes go
through `prisma db push` in development; production baselines with `prisma migrate`
before the first deploy. Inbox types live in `packages/database/inbox/types.ts`: `Pipe`,
`Conversation`, `Message`, `Qualification` (`rentOrBuy` split from move-in `timeframe`),
`Draft` + crib, `Paperwork`, `OneShot`, `SendResult`, `InboxViewer`; the funnel
vocabulary (`Funnel`, `ResponseTime`) is zod in `schema.ts` and `store.funnel(viewer, {
since })` counts it in SQL inside the office (ADR 0002 over ADR 0011). The store
(`createInboxStore(db)`) is the only writer of these tables; routes call its methods and
never touch Prisma directly.
```

In the office paragraph of that section, delete the sentence `Files from before tenancy carry `officeId = NULL` until `adoptUnownedThreads` runs (the seed does it for the walk office).`

- [ ] **Step 3: AGENTS.md, README.md, env example, gitignore, ADR 0010**

`AGENTS.md` line 12: replace `plus a hand-written SQLite store for the inbox` with `for auth and the inbox alike (ADR 0012)`. Lines 24-25: replace `Auth sessions need local Postgres. Inbox threads stay in repo-root SQLite `data/nhip.db`. A postgres `DATABASE_URL` is ignored by the inbox store.` with `Everything needs local Postgres: auth sessions and inbox threads share `DATABASE_URL`. Tests use `supastarter_test` on the same server.` Line 160: replace `hand-written SQLite DDL plus zod schemas, with no ORM.` with `Prisma models plus zod vocabularies for the open-ended fields.`

`README.md` line 11: replace `Inbox threads live in repo-root SQLite `data/nhip.db`.` with `Inbox threads live in the same Postgres.` Line 32: replace `writes those threads into `data/nhip.db` and creates the walk user` with `writes those threads into the walk office and creates the walk user`.

`.env.local.example`: delete line 3 (`# SQLite data/nhip.db — ...`) and line 6 (`# DATABASE_URL="file:./data/nhip.db"`); after the `DATABASE_URL=` line add `# TEST_DATABASE_URL="postgresql://postgres:postgres@localhost:5432/supastarter_test"`.

`.gitignore`: delete the `data/` line.

`docs/adr/0010-office-assignment.md`: after the bullet that ends `...in which case they stay unowned and are reported.` add:

```markdown
  Superseded on this point by ADR 0012: `officeId` is required and there is no adopt
  path; every thread has an office from birth.
```

- [ ] **Step 4: Gates and the dev-server walk**

Run: `pnpm format && pnpm lint && pnpm type-check && pnpm --filter saas test`
Expected: exit 0.

Run the worktree server on a free port and walk it (no `Origin` header on the sign-in, see the toolchain memory):

```bash
pnpm --filter saas exec next dev --port 3012 > /tmp/nhip-dev.log 2>&1 &
sleep 15
curl -s -c /tmp/jar.txt -H 'Content-Type: application/json' -d '{"email":"walk@nhip.local","password":"walkthrough"}' http://localhost:3012/api/auth/sign-in/email -o /dev/null -w '%{http_code}\n'
curl -s -b /tmp/jar.txt 'http://localhost:3012/api/conversations?locale=en' | head -c 400; echo
curl -s -b /tmp/jar.txt http://localhost:3012/en/home -o /tmp/home.html -w '%{http_code}\n'
```

Expected: `200`, a JSON array whose first thread id starts with `walk-office:`, `200`. Then approve the Zalo thread and confirm Home moves (as in PR #24's walk):

```bash
ID=walk-office:zalo:demo-vi-tayho
INB=$(curl -s -b /tmp/jar.txt 'http://localhost:3012/api/conversations?locale=en' | python3 -c "import json,sys; print([c for c in json.load(sys.stdin) if c['id']=='$ID'][0]['unansweredInboundId'])")
curl -s -b /tmp/jar.txt -H 'Content-Type: application/json' -d "{\"inboundId\":\"$INB\",\"reply\":\"Chào bạn\"}" "http://localhost:3012/api/conversations/$ID/approve" -o /dev/null -w '%{http_code}\n'
curl -s -b /tmp/jar.txt http://localhost:3012/en/home | grep -o 'Engaged[^<]*<[^>]*>[^<]*<[^>]*>[0-9]*' | head -1
kill %1
```

Expected: `200`, then a fragment containing `Engaged` followed by `1`.

- [ ] **Step 5: Commit, push, PR**

```bash
git add HANDOFF.md ARCHITECTURE.md AGENTS.md README.md .env.local.example .gitignore docs/adr/0010-office-assignment.md docs/superpowers/plans/2026-09-20-inbox-on-prisma.md
git commit -m "docs: the inbox lives in Postgres through Prisma (ADR 0012)"
git push -u origin worktree-feat+inbox-prisma
gh pr create --draft --base main --title "feat(inbox): the inbox lives in Postgres, through Prisma (ADR 0012)" --body-file /Users/eyal/.claude/jobs/ebe29341/tmp/pr-body-prisma.md
```

Write `/Users/eyal/.claude/jobs/ebe29341/tmp/pr-body-prisma.md` first. It lists: the ADR, the model list and cascade rules, the test database convention (`TEST_DATABASE_URL`, `supastarter_test`, CI service), what was deleted (SQLite file, `better-sqlite3`, `ensure-schema.ts`, the adopt path), the gate output, and the walk output. After merge, Eyal runs `pnpm --filter @repo/database push` and `pnpm seed` once on main.
