-- Every one-deploy row of AGENTS.md's expand/contract table, written the way it says. Lints clean.

-- New table, nullable column, index.
CREATE TABLE "inbox_note" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "inbox_note_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "inbox_note_conversationId_idx" ON "inbox_note"("conversationId");
-- A new table has no rows to scan.
-- squawk-ignore adding-foreign-key-constraint, constraint-missing-not-valid
ALTER TABLE "inbox_note" ADD CONSTRAINT "inbox_note_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "inbox_conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "inbox_message" ADD COLUMN "note" TEXT;

-- New column with a constant default.
ALTER TABLE "inbox_message" ADD COLUMN "kind" TEXT NOT NULL DEFAULT 'text';

-- New foreign key on existing rows: NOT VALID, then VALIDATE CONSTRAINT.
ALTER TABLE "inbox_draft" ADD CONSTRAINT "inbox_draft_answersMessageId_fkey" FOREIGN KEY ("answersMessageId") REFERENCES "inbox_message"("id") ON DELETE SET NULL ON UPDATE CASCADE NOT VALID;
ALTER TABLE "inbox_draft" VALIDATE CONSTRAINT "inbox_draft_answersMessageId_fkey";

-- Make a column required (the second deploy): SET NOT NULL behind a validated CHECK.
ALTER TABLE "inbox_draft" ADD CONSTRAINT "inbox_draft_officeId_not_null" CHECK ("officeId" IS NOT NULL) NOT VALID;
ALTER TABLE "inbox_draft" VALIDATE CONSTRAINT "inbox_draft_officeId_not_null";
ALTER TABLE "inbox_draft" ALTER COLUMN "officeId" SET NOT NULL;
ALTER TABLE "inbox_draft" DROP CONSTRAINT "inbox_draft_officeId_not_null";

-- Prisma appends a new enum value.
ALTER TYPE "CrmKind" ADD VALUE 'attio';
