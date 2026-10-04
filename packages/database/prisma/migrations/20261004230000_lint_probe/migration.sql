-- THROWAWAY (#98): proves CI's migration lint fails a required column added without a default.
-- Dropped again below, so the schema (and migrate:check) is unchanged. Not for merge.
ALTER TABLE "inbox_message" ADD COLUMN "lintProbe" TEXT NOT NULL;
ALTER TABLE "inbox_message" DROP COLUMN "lintProbe";
