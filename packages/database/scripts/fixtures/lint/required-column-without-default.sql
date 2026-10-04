-- Breaks the code before it: old code inserts messages without "channel" (AGENTS.md, "Make a
-- column required": 2 deploys). Squawk: adding-required-field.
ALTER TABLE "inbox_message" ADD COLUMN "channel" TEXT NOT NULL;
