-- `Answer.to` was a copy of the thread's guestId, written and never read; a send reads the
-- thread's guestId (#141). Dropping a column is a two-deploy change (AGENTS.md); one deploy
-- here, pre-launch, with no live writers.

-- AlterTable
ALTER TABLE "inbox_answer" DROP COLUMN "to";
