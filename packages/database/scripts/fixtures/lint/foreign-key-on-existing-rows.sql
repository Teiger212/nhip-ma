-- Scans inbox_draft under a lock that blocks writes to both tables (AGENTS.md: "New foreign key
-- or check on existing rows": add it NOT VALID, then VALIDATE CONSTRAINT).
-- Squawk: adding-foreign-key-constraint, constraint-missing-not-valid.
ALTER TABLE "inbox_draft" ADD CONSTRAINT "inbox_draft_answersMessageId_fkey" FOREIGN KEY ("answersMessageId") REFERENCES "inbox_message"("id") ON DELETE SET NULL ON UPDATE CASCADE;
