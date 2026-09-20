import type Database from "better-sqlite3";

const STATEMENTS = [
	`CREATE TABLE IF NOT EXISTS "Conversation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "pipe" TEXT NOT NULL,
    "guestId" TEXT NOT NULL,
    "guestName" TEXT,
    "officeId" TEXT,
    "language" TEXT,
    "lastGuestInboundAt" DATETIME,
    "sentAt" DATETIME,
    "updatedAt" DATETIME NOT NULL
  )`,
	`CREATE TABLE IF NOT EXISTS "PipeConnection" (
    "pipe" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "officeId" TEXT NOT NULL,
    PRIMARY KEY ("pipe", "externalId")
  )`,
	`CREATE TABLE IF NOT EXISTS "Message" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "conversationId" TEXT NOT NULL,
    "direction" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "at" DATETIME NOT NULL,
    "vendorMessageId" TEXT,
    "mock" BOOLEAN NOT NULL DEFAULT 0,
    "pipeExternalId" TEXT,
    CONSTRAINT "Message_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation" ("id") ON DELETE CASCADE ON UPDATE CASCADE
  )`,
	`CREATE INDEX IF NOT EXISTS "Message_conversationId_idx" ON "Message"("conversationId")`,
	`CREATE TABLE IF NOT EXISTS "Translation" (
    "messageId" TEXT NOT NULL,
    "locale" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    PRIMARY KEY ("messageId", "locale"),
    CONSTRAINT "Translation_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "Message" ("id") ON DELETE CASCADE ON UPDATE CASCADE
  )`,
	`CREATE TABLE IF NOT EXISTS "Qualification" (
    "conversationId" TEXT NOT NULL PRIMARY KEY,
    "areaOfInterest" TEXT,
    "nationality" TEXT,
    "inVietnamNow" BOOLEAN,
    "rentOrBuy" TEXT,
    "timeframe" TEXT,
    "budgetBand" TEXT,
    "bedsOrHousehold" TEXT,
    CONSTRAINT "Qualification_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation" ("id") ON DELETE CASCADE ON UPDATE CASCADE
  )`,
	`CREATE TABLE IF NOT EXISTS "Draft" (
    "conversationId" TEXT NOT NULL PRIMARY KEY,
    "reply" TEXT NOT NULL,
    "answersMessageId" TEXT,
    "source" TEXT NOT NULL DEFAULT 'template',
    CONSTRAINT "Draft_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation" ("id") ON DELETE CASCADE ON UPDATE CASCADE
  )`,
	`CREATE TABLE IF NOT EXISTS "Paperwork" (
    "conversationId" TEXT NOT NULL PRIMARY KEY,
    "mentioned" BOOLEAN NOT NULL,
    "flag" TEXT,
    CONSTRAINT "Paperwork_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation" ("id") ON DELETE CASCADE ON UPDATE CASCADE
  )`,
	// The Answer (ADR 0011): one row per answered guest message, carrying the send's whole
	// lifecycle. It replaced the Approval and Send tables and the claim on Message.
	`CREATE TABLE IF NOT EXISTS "Answer" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "conversationId" TEXT NOT NULL,
    "inboundId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "operatorId" TEXT,
    "status" TEXT NOT NULL,
    "mock" BOOLEAN NOT NULL DEFAULT 0,
    "pipe" TEXT NOT NULL,
    "to" TEXT NOT NULL,
    "pipeExternalId" TEXT,
    "vendorMessageId" TEXT,
    "approvedAt" DATETIME NOT NULL,
    "sentAt" DATETIME,
    "failedAt" DATETIME,
    "failureReason" TEXT,
    CONSTRAINT "Answer_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Answer_inboundId_fkey" FOREIGN KEY ("inboundId") REFERENCES "Message" ("id") ON DELETE CASCADE ON UPDATE CASCADE
  )`,
	`CREATE UNIQUE INDEX IF NOT EXISTS "Answer_inboundId_key" ON "Answer"("inboundId")`,
	`CREATE INDEX IF NOT EXISTS "Answer_conversationId_idx" ON "Answer"("conversationId")`,
];

/**
 * Created after the column migrations: a pre-tenancy file has no `officeId` column yet.
 * One thread per guest per office (ADR 0010) replaces the pre-tenancy one-per-guest rule;
 * SQLite treats NULLs as distinct, so unowned legacy rows never collide with each other.
 */
const OFFICE_INDEXES = [
	`DROP INDEX IF EXISTS "Conversation_pipe_guestId_key"`,
	`CREATE INDEX IF NOT EXISTS "Conversation_officeId_idx" ON "Conversation"("officeId")`,
	`CREATE UNIQUE INDEX IF NOT EXISTS "Conversation_officeId_pipe_guestId_key" ON "Conversation"("officeId", "pipe", "guestId")`,
];

/**
 * Files from before ADR 0011 recorded a send as an Approval row plus a Send row, claimed
 * through `Message.claimedAt`. Each such Send becomes a `sent` Answer; a Send from before
 * reply-only (ADR 0006) first learns which guest message it answered, the last inbound
 * before it. The old tables and the claim column then go.
 */
const LEGACY_SEND_MIGRATION = {
	backfillAnswered: (table: string) => `UPDATE "${table}" SET "answersMessageId" = (
    SELECT "id" FROM "Message"
    WHERE "Message"."conversationId" = "${table}"."conversationId"
      AND "Message"."direction" = 'in'
      AND "Message"."at" <= "${table}"."at"
    ORDER BY "Message"."at" DESC LIMIT 1
  ) WHERE "answersMessageId" IS NULL`,
	toAnswers: `INSERT INTO "Answer" ("id", "conversationId", "inboundId", "text", "operatorId", "status", "mock", "pipe", "to", "pipeExternalId", "vendorMessageId", "approvedAt", "sentAt")
    SELECT "s"."id", "s"."conversationId", "s"."answersMessageId",
      COALESCE("s"."text", (SELECT "a"."reply" FROM "Approval" AS "a" WHERE "a"."answersMessageId" = "s"."answersMessageId" LIMIT 1), ''),
      NULL, 'sent', "s"."mock", "s"."pipe", "s"."to", NULL, "s"."vendorMessageId", "s"."at", "s"."at"
    FROM "Send" AS "s"
    WHERE "s"."answersMessageId" IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM "Answer" AS "x" WHERE "x"."inboundId" = "s"."answersMessageId")`,
	toAnswersWithoutApproval: `INSERT INTO "Answer" ("id", "conversationId", "inboundId", "text", "operatorId", "status", "mock", "pipe", "to", "pipeExternalId", "vendorMessageId", "approvedAt", "sentAt")
    SELECT "s"."id", "s"."conversationId", "s"."answersMessageId", COALESCE("s"."text", ''),
      NULL, 'sent', "s"."mock", "s"."pipe", "s"."to", NULL, "s"."vendorMessageId", "s"."at", "s"."at"
    FROM "Send" AS "s"
    WHERE "s"."answersMessageId" IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM "Answer" AS "x" WHERE "x"."inboundId" = "s"."answersMessageId")`,
};

/**
 * Files created before the operator note stopped being stored still have
 * Draft.crib / Draft.cribLanguage as NOT NULL. They are dropped so inserts of the
 * new shape do not fail; the note is rendered from Qualification at read time.
 */
const COLUMN_DROPS: Array<{ table: string; column: string }> = [
	{ table: "Draft", column: "crib" },
	{ table: "Draft", column: "cribLanguage" },
	// Pre-ADR-0008 files scoped threads to a person. A user id is not an office id, so the
	// column goes and the threads wait unowned until `adoptUnownedThreads` runs (the seed
	// and `pnpm --filter saas pipe:connect --adopt-unowned` both do).
	{ table: "Conversation", column: "ownerUserId" },
	// The claim moved onto the Answer row (ADR 0011).
	{ table: "Message", column: "claimedAt" },
];

/**
 * Additive column migrations for files created before the column existed.
 * SQLite `CREATE TABLE IF NOT EXISTS` never alters an existing table. A migration on a
 * table the file does not have is skipped: legacy tables are only ever read, never made.
 */
const COLUMN_MIGRATIONS: Array<{ table: string; column: string; ddl: string }> = [
	{
		table: "Conversation",
		column: "officeId",
		ddl: `ALTER TABLE "Conversation" ADD COLUMN "officeId" TEXT`,
	},
	{
		table: "Message",
		column: "pipeExternalId",
		ddl: `ALTER TABLE "Message" ADD COLUMN "pipeExternalId" TEXT`,
	},
	{
		table: "Draft",
		column: "answersMessageId",
		ddl: `ALTER TABLE "Draft" ADD COLUMN "answersMessageId" TEXT`,
	},
	{
		table: "Draft",
		column: "source",
		ddl: `ALTER TABLE "Draft" ADD COLUMN "source" TEXT NOT NULL DEFAULT 'template'`,
	},
	{
		table: "Approval",
		column: "answersMessageId",
		ddl: `ALTER TABLE "Approval" ADD COLUMN "answersMessageId" TEXT`,
	},
	{
		table: "Send",
		column: "answersMessageId",
		ddl: `ALTER TABLE "Send" ADD COLUMN "answersMessageId" TEXT`,
	},
];

function hasTable(database: Database.Database, table: string): boolean {
	return Boolean(
		database.prepare(`SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?`).get(table),
	);
}

function hasColumn(database: Database.Database, table: string, column: string): boolean {
	const rows = database.prepare(`PRAGMA table_info("${table}")`).all() as Array<{ name: string }>;
	return rows.some((row) => row.name === column);
}

export function ensureInboxSchema(database: Database.Database): void {
	database.exec("PRAGMA foreign_keys = ON");
	// WAL lets readers proceed during a write; busy_timeout makes a second writer
	// (e.g. `pnpm seed` next to `next dev`) wait instead of failing with SQLITE_BUSY.
	database.pragma("journal_mode = WAL");
	database.pragma("busy_timeout = 5000");
	for (const sql of STATEMENTS) {
		database.exec(sql);
	}
	for (const migration of COLUMN_MIGRATIONS) {
		if (
			hasTable(database, migration.table) &&
			!hasColumn(database, migration.table, migration.column)
		) {
			database.exec(migration.ddl);
		}
	}
	for (const drop of COLUMN_DROPS) {
		if (hasTable(database, drop.table) && hasColumn(database, drop.table, drop.column)) {
			database.exec(`ALTER TABLE "${drop.table}" DROP COLUMN "${drop.column}"`);
		}
	}
	for (const sql of OFFICE_INDEXES) {
		database.exec(sql);
	}
	if (hasTable(database, "Send")) {
		const migrate = database.transaction(() => {
			database.exec(LEGACY_SEND_MIGRATION.backfillAnswered("Send"));
			if (hasTable(database, "Approval")) {
				database.exec(LEGACY_SEND_MIGRATION.backfillAnswered("Approval"));
				database.exec(LEGACY_SEND_MIGRATION.toAnswers);
				database.exec(`DROP TABLE "Approval"`);
			} else {
				database.exec(LEGACY_SEND_MIGRATION.toAnswersWithoutApproval);
			}
			database.exec(`DROP TABLE "Send"`);
		});
		try {
			migrate();
		} catch (error) {
			const reason = error instanceof Error ? error.message : String(error);
			throw new Error(
				`Inbox store could not fold its Send rows into Answers, which the current schema requires (one Answer per guest message). Delete the SQLite file (default data/nhip.db) and re-run pnpm seed. (${reason})`,
			);
		}
	} else if (hasTable(database, "Approval")) {
		database.exec(`DROP TABLE "Approval"`);
	}
}
