-- `Answer.to` was a copy of the thread's guestId, written and never read; a send reads the
-- thread's guestId (#141). Dropping a column is a two-deploy change (AGENTS.md); one deploy
-- here, pre-launch, with no live writers. Vercel's instant rollback to a deployment from before
-- #141 is unsafe from here: its approvals write `to` and fail.

-- AlterTable
ALTER TABLE "inbox_answer" DROP COLUMN "to";
