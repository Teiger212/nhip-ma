-- DropForeignKey
ALTER TABLE "inbox_answer" DROP CONSTRAINT "inbox_answer_conversationId_fkey";

-- DropForeignKey
ALTER TABLE "inbox_answer" DROP CONSTRAINT "inbox_answer_inboundId_fkey";

-- DropForeignKey
ALTER TABLE "inbox_crm_link" DROP CONSTRAINT "inbox_crm_link_conversationId_fkey";

-- DropForeignKey
ALTER TABLE "inbox_draft" DROP CONSTRAINT "inbox_draft_conversationId_fkey";

-- DropForeignKey
ALTER TABLE "inbox_message" DROP CONSTRAINT "inbox_message_conversationId_fkey";

-- DropForeignKey
ALTER TABLE "inbox_paperwork" DROP CONSTRAINT "inbox_paperwork_conversationId_fkey";

-- DropForeignKey
ALTER TABLE "inbox_qualification" DROP CONSTRAINT "inbox_qualification_conversationId_fkey";

-- DropForeignKey
ALTER TABLE "inbox_translation" DROP CONSTRAINT "inbox_translation_messageId_fkey";

-- DropForeignKey
ALTER TABLE "inbox_translation_failure" DROP CONSTRAINT "inbox_translation_failure_messageId_fkey";

-- DropIndex
DROP INDEX "inbox_conversation_officeId_idx";

-- DropIndex
DROP INDEX "member_organizationId_idx";

-- DropIndex
DROP INDEX "purchase_subscriptionId_idx";

-- Every office-owned row carries its thread's office (#95). Added nullable, filled from the
-- thread (translations from their message, so messages go first), then required. The new
-- composite foreign keys below hold each row's office equal to its parent's from here on.
ALTER TABLE "inbox_answer" ADD COLUMN "officeId" TEXT;
ALTER TABLE "inbox_draft" ADD COLUMN "officeId" TEXT;
ALTER TABLE "inbox_message" ADD COLUMN "officeId" TEXT;
ALTER TABLE "inbox_paperwork" ADD COLUMN "officeId" TEXT;
ALTER TABLE "inbox_qualification" ADD COLUMN "officeId" TEXT;
ALTER TABLE "inbox_translation" ADD COLUMN "officeId" TEXT;
ALTER TABLE "inbox_translation_failure" ADD COLUMN "officeId" TEXT;

UPDATE "inbox_message" AS "m" SET "officeId" = "c"."officeId"
  FROM "inbox_conversation" AS "c" WHERE "c"."id" = "m"."conversationId";
UPDATE "inbox_qualification" AS "x" SET "officeId" = "c"."officeId"
  FROM "inbox_conversation" AS "c" WHERE "c"."id" = "x"."conversationId";
UPDATE "inbox_draft" AS "x" SET "officeId" = "c"."officeId"
  FROM "inbox_conversation" AS "c" WHERE "c"."id" = "x"."conversationId";
UPDATE "inbox_paperwork" AS "x" SET "officeId" = "c"."officeId"
  FROM "inbox_conversation" AS "c" WHERE "c"."id" = "x"."conversationId";
UPDATE "inbox_answer" AS "x" SET "officeId" = "c"."officeId"
  FROM "inbox_conversation" AS "c" WHERE "c"."id" = "x"."conversationId";
UPDATE "inbox_translation" AS "x" SET "officeId" = "m"."officeId"
  FROM "inbox_message" AS "m" WHERE "m"."id" = "x"."messageId";
UPDATE "inbox_translation_failure" AS "x" SET "officeId" = "m"."officeId"
  FROM "inbox_message" AS "m" WHERE "m"."id" = "x"."messageId";

ALTER TABLE "inbox_answer" ALTER COLUMN "officeId" SET NOT NULL;
ALTER TABLE "inbox_draft" ALTER COLUMN "officeId" SET NOT NULL;
ALTER TABLE "inbox_message" ALTER COLUMN "officeId" SET NOT NULL;
ALTER TABLE "inbox_paperwork" ALTER COLUMN "officeId" SET NOT NULL;
ALTER TABLE "inbox_qualification" ALTER COLUMN "officeId" SET NOT NULL;
ALTER TABLE "inbox_translation" ALTER COLUMN "officeId" SET NOT NULL;
ALTER TABLE "inbox_translation_failure" ALTER COLUMN "officeId" SET NOT NULL;

-- A draft that answers a message since deleted answers nothing; the new foreign key needs that.
UPDATE "inbox_draft" AS "d" SET "answersMessageId" = NULL
  WHERE "answersMessageId" IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM "inbox_message" AS "m" WHERE "m"."id" = "d"."answersMessageId");

-- CreateIndex
CREATE INDEX "inbox_answer_officeId_idx" ON "inbox_answer"("officeId");

-- CreateIndex
CREATE INDEX "inbox_answer_operatorId_idx" ON "inbox_answer"("operatorId");

-- CreateIndex
CREATE UNIQUE INDEX "inbox_answer_inboundId_officeId_key" ON "inbox_answer"("inboundId", "officeId");

-- CreateIndex
CREATE INDEX "inbox_conversation_ownerId_idx" ON "inbox_conversation"("ownerId");

-- CreateIndex
CREATE UNIQUE INDEX "inbox_conversation_id_officeId_key" ON "inbox_conversation"("id", "officeId");

-- CreateIndex
CREATE UNIQUE INDEX "inbox_crm_link_conversationId_officeId_key" ON "inbox_crm_link"("conversationId", "officeId");

-- CreateIndex
CREATE INDEX "inbox_draft_officeId_idx" ON "inbox_draft"("officeId");

-- CreateIndex
CREATE INDEX "inbox_draft_answersMessageId_idx" ON "inbox_draft"("answersMessageId");

-- CreateIndex
CREATE UNIQUE INDEX "inbox_draft_conversationId_officeId_key" ON "inbox_draft"("conversationId", "officeId");

-- CreateIndex
CREATE INDEX "inbox_message_officeId_idx" ON "inbox_message"("officeId");

-- CreateIndex
CREATE UNIQUE INDEX "inbox_message_id_officeId_key" ON "inbox_message"("id", "officeId");

-- CreateIndex
CREATE INDEX "inbox_paperwork_officeId_idx" ON "inbox_paperwork"("officeId");

-- CreateIndex
CREATE UNIQUE INDEX "inbox_paperwork_conversationId_officeId_key" ON "inbox_paperwork"("conversationId", "officeId");

-- CreateIndex
CREATE INDEX "inbox_pipe_connection_officeId_idx" ON "inbox_pipe_connection"("officeId");

-- CreateIndex
CREATE INDEX "inbox_qualification_officeId_idx" ON "inbox_qualification"("officeId");

-- CreateIndex
CREATE UNIQUE INDEX "inbox_qualification_conversationId_officeId_key" ON "inbox_qualification"("conversationId", "officeId");

-- CreateIndex
CREATE INDEX "inbox_translation_officeId_idx" ON "inbox_translation"("officeId");

-- CreateIndex
CREATE INDEX "inbox_translation_failure_officeId_idx" ON "inbox_translation_failure"("officeId");

-- AddForeignKey
ALTER TABLE "inbox_message" ADD CONSTRAINT "inbox_message_conversationId_officeId_fkey" FOREIGN KEY ("conversationId", "officeId") REFERENCES "inbox_conversation"("id", "officeId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inbox_translation" ADD CONSTRAINT "inbox_translation_messageId_officeId_fkey" FOREIGN KEY ("messageId", "officeId") REFERENCES "inbox_message"("id", "officeId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inbox_translation_failure" ADD CONSTRAINT "inbox_translation_failure_messageId_officeId_fkey" FOREIGN KEY ("messageId", "officeId") REFERENCES "inbox_message"("id", "officeId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inbox_qualification" ADD CONSTRAINT "inbox_qualification_conversationId_officeId_fkey" FOREIGN KEY ("conversationId", "officeId") REFERENCES "inbox_conversation"("id", "officeId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inbox_draft" ADD CONSTRAINT "inbox_draft_conversationId_officeId_fkey" FOREIGN KEY ("conversationId", "officeId") REFERENCES "inbox_conversation"("id", "officeId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inbox_draft" ADD CONSTRAINT "inbox_draft_answersMessageId_fkey" FOREIGN KEY ("answersMessageId") REFERENCES "inbox_message"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inbox_paperwork" ADD CONSTRAINT "inbox_paperwork_conversationId_officeId_fkey" FOREIGN KEY ("conversationId", "officeId") REFERENCES "inbox_conversation"("id", "officeId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inbox_answer" ADD CONSTRAINT "inbox_answer_conversationId_officeId_fkey" FOREIGN KEY ("conversationId", "officeId") REFERENCES "inbox_conversation"("id", "officeId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inbox_answer" ADD CONSTRAINT "inbox_answer_inboundId_officeId_fkey" FOREIGN KEY ("inboundId", "officeId") REFERENCES "inbox_message"("id", "officeId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inbox_crm_link" ADD CONSTRAINT "inbox_crm_link_conversationId_officeId_fkey" FOREIGN KEY ("conversationId", "officeId") REFERENCES "inbox_conversation"("id", "officeId") ON DELETE CASCADE ON UPDATE CASCADE;
