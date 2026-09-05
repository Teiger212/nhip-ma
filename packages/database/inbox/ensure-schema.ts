import type Database from "better-sqlite3";

const STATEMENTS = [
	`CREATE TABLE IF NOT EXISTS "Conversation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "pipe" TEXT NOT NULL,
    "guestId" TEXT NOT NULL,
    "guestName" TEXT,
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
    "crib" TEXT NOT NULL,
    "cribLanguage" TEXT NOT NULL,
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

export function ensureInboxSchema(database: Database.Database): void {
	database.exec("PRAGMA foreign_keys = ON");
	for (const sql of STATEMENTS) {
		database.exec(sql);
	}
}
