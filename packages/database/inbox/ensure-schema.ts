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
    "claimedAt" DATETIME,
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
	`CREATE TABLE IF NOT EXISTS "Approval" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "conversationId" TEXT NOT NULL,
    "reply" TEXT NOT NULL,
    "answersMessageId" TEXT,
    "at" DATETIME NOT NULL,
    CONSTRAINT "Approval_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation" ("id") ON DELETE CASCADE ON UPDATE CASCADE
  )`,
	`CREATE TABLE IF NOT EXISTS "Send" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "conversationId" TEXT NOT NULL,
    "mock" BOOLEAN NOT NULL,
    "pipe" TEXT NOT NULL,
    "to" TEXT NOT NULL,
    "text" TEXT,
    "vendorMessageId" TEXT,
    "answersMessageId" TEXT,
    "at" DATETIME NOT NULL,
    CONSTRAINT "Send_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation" ("id") ON DELETE CASCADE ON UPDATE CASCADE
  )`,
];

/**
 * One approved send per inbound message (ADR 0006). Backstop for the compare-and-swap in
 * `claimSend`. Created separately so an old file with duplicate sends fails with a clear
 * message. It replaces the pre-ADR-0006 index that allowed one send per thread.
 */
const LEGACY_SEND_UNIQUE_INDEX = `DROP INDEX IF EXISTS "Send_conversationId_key"`;

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
const SEND_UNIQUE_INDEX = `CREATE UNIQUE INDEX IF NOT EXISTS "Send_answersMessageId_key" ON "Send"("answersMessageId")`;

/**
 * Files written before reply-only have one Send per thread with no record of which guest
 * message it answered. The answer is the last inbound before the send, which is what the
 * thread-level rule meant at the time.
 */
const BACKFILL_ANSWERS: string[] = ["Send", "Approval"].map(
	(table) => `UPDATE "${table}" SET "answersMessageId" = (
    SELECT "id" FROM "Message"
    WHERE "Message"."conversationId" = "${table}"."conversationId"
      AND "Message"."direction" = 'in'
      AND "Message"."at" <= "${table}"."at"
    ORDER BY "Message"."at" DESC LIMIT 1
  ) WHERE "answersMessageId" IS NULL`,
);

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
];

/**
 * Additive column migrations for files created before the column existed.
 * SQLite `CREATE TABLE IF NOT EXISTS` never alters an existing table.
 */
const COLUMN_MIGRATIONS: Array<{ table: string; column: string; ddl: string }> = [
	{
		table: "Conversation",
		column: "officeId",
		ddl: `ALTER TABLE "Conversation" ADD COLUMN "officeId" TEXT`,
	},
	{
		table: "Message",
		column: "claimedAt",
		ddl: `ALTER TABLE "Message" ADD COLUMN "claimedAt" DATETIME`,
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
		if (!hasColumn(database, migration.table, migration.column)) {
			database.exec(migration.ddl);
		}
	}
	for (const drop of COLUMN_DROPS) {
		if (hasColumn(database, drop.table, drop.column)) {
			database.exec(`ALTER TABLE "${drop.table}" DROP COLUMN "${drop.column}"`);
		}
	}
	for (const sql of OFFICE_INDEXES) {
		database.exec(sql);
	}
	database.exec(LEGACY_SEND_UNIQUE_INDEX);
	for (const sql of BACKFILL_ANSWERS) {
		database.exec(sql);
	}
	try {
		database.exec(SEND_UNIQUE_INDEX);
	} catch (error) {
		const reason = error instanceof Error ? error.message : String(error);
		throw new Error(
			`Inbox store has more than one Send row answering the same guest message, which the current schema forbids. Delete the SQLite file (default data/nhip.db) and re-run pnpm seed. (${reason})`,
		);
	}
}
