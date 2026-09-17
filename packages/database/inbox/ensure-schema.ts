import type Database from "better-sqlite3";

const STATEMENTS = [
	`CREATE TABLE IF NOT EXISTS "Conversation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "pipe" TEXT NOT NULL,
    "guestId" TEXT NOT NULL,
    "guestName" TEXT,
    "ownerUserId" TEXT,
    "language" TEXT,
    "lastGuestInboundAt" DATETIME,
    "sentAt" DATETIME,
    "updatedAt" DATETIME NOT NULL
  )`,
	`CREATE UNIQUE INDEX IF NOT EXISTS "Conversation_pipe_guestId_key" ON "Conversation"("pipe", "guestId")`,
	`CREATE TABLE IF NOT EXISTS "Message" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "conversationId" TEXT NOT NULL,
    "direction" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "at" DATETIME NOT NULL,
    "vendorMessageId" TEXT,
    "mock" BOOLEAN NOT NULL DEFAULT 0,
    CONSTRAINT "Message_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation" ("id") ON DELETE CASCADE ON UPDATE CASCADE
  )`,
	`CREATE INDEX IF NOT EXISTS "Message_conversationId_idx" ON "Message"("conversationId")`,
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
    "at" DATETIME NOT NULL,
    CONSTRAINT "Send_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation" ("id") ON DELETE CASCADE ON UPDATE CASCADE
  )`,
];

/**
 * One approved send per thread. Backstop for the compare-and-swap in `claimSend`.
 * Created separately so an old file with duplicate sends fails with a clear message.
 */
const SEND_UNIQUE_INDEX = `CREATE UNIQUE INDEX IF NOT EXISTS "Send_conversationId_key" ON "Send"("conversationId")`;

/**
 * Additive column migrations for files created before the column existed.
 * SQLite `CREATE TABLE IF NOT EXISTS` never alters an existing table.
 */
/**
 * Files created before the operator note stopped being stored still have
 * Draft.crib / Draft.cribLanguage as NOT NULL. They are dropped so inserts of the
 * new shape do not fail; the note is rendered from Qualification at read time.
 */
const COLUMN_DROPS: Array<{ table: string; column: string }> = [
	{ table: "Draft", column: "crib" },
	{ table: "Draft", column: "cribLanguage" },
];

const COLUMN_MIGRATIONS: Array<{ table: string; column: string; ddl: string }> = [
	{
		table: "Conversation",
		column: "ownerUserId",
		ddl: `ALTER TABLE "Conversation" ADD COLUMN "ownerUserId" TEXT`,
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
	try {
		database.exec(SEND_UNIQUE_INDEX);
	} catch (error) {
		const reason = error instanceof Error ? error.message : String(error);
		throw new Error(
			`Inbox store has more than one Send row for a conversation, which the current schema forbids. Delete the SQLite file (default data/nhip.db) and re-run pnpm seed. (${reason})`,
		);
	}
}
