-- AlterTable
ALTER TABLE "inbox_conversation" ADD COLUMN     "ownerId" TEXT;

-- CreateIndex
CREATE INDEX "inbox_conversation_officeId_ownerId_idx" ON "inbox_conversation"("officeId", "ownerId");

-- AddForeignKey
ALTER TABLE "inbox_conversation" ADD CONSTRAINT "inbox_conversation_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Backfill (ADR 0015 amendment, "Rollout"): a thread that was answered belongs to the operator
-- who approved its first sent Answer, if they are still an operator of its office (a member who
-- is not the platform admin). Everything else starts in the pool. Idempotent: only unowned
-- threads are touched.
-- BACKFILL START
UPDATE "inbox_conversation" AS c
SET "ownerId" = first_sent."operatorId"
FROM (
  SELECT DISTINCT ON ("conversationId") "conversationId", "operatorId"
  FROM "inbox_answer"
  WHERE "status" = 'sent' AND "operatorId" IS NOT NULL
  ORDER BY "conversationId", "sentAt" ASC NULLS LAST, "seq" ASC
) AS first_sent
WHERE c."id" = first_sent."conversationId"
  AND c."ownerId" IS NULL
  AND EXISTS (
    SELECT 1
    FROM "member" AS m
    JOIN "user" AS u ON u."id" = m."userId"
    WHERE m."organizationId" = c."officeId"
      AND m."userId" = first_sent."operatorId"
      AND NOT ('admin' = ANY (string_to_array(COALESCE(u."role", ''), ',')))
  );
-- BACKFILL END
