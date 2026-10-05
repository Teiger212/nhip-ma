-- CreateEnum
CREATE TYPE "GuestDeletionCrmResult" AS ENUM ('deleted', 'unlinked', 'pending', 'failed');

-- CreateEnum
CREATE TYPE "GuestDeletionReason" AS ENUM ('guest_request', 'duplicate_or_spam', 'test_data', 'other');

-- CreateTable
CREATE TABLE "inbox_lead_tally" (
    "id" TEXT NOT NULL,
    "officeId" TEXT NOT NULL,
    "pipe" "Pipe" NOT NULL,
    "language" TEXT,
    "firstInboundAt" TIMESTAMP(3) NOT NULL,
    "firstReplyAt" TIMESTAMP(3),
    "inConversation" BOOLEAN NOT NULL,
    "outcome" "CrmOutcomeStatus",

    CONSTRAINT "inbox_lead_tally_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inbox_guest_deletion" (
    "id" TEXT NOT NULL,
    "officeId" TEXT NOT NULL,
    "actorId" TEXT,
    "actorName" TEXT NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reason" "GuestDeletionReason" NOT NULL,
    "note" TEXT,
    "messages" INTEGER NOT NULL,
    "answers" INTEGER NOT NULL,
    "translations" INTEGER NOT NULL,
    "notifications" INTEGER NOT NULL,
    "crmKind" "CrmKind",
    "crmResult" "GuestDeletionCrmResult",

    CONSTRAINT "inbox_guest_deletion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "inbox_lead_tally_officeId_firstInboundAt_idx" ON "inbox_lead_tally"("officeId", "firstInboundAt");

-- CreateIndex
CREATE INDEX "inbox_guest_deletion_officeId_at_idx" ON "inbox_guest_deletion"("officeId", "at");

-- CreateIndex
CREATE INDEX "inbox_guest_deletion_actorId_idx" ON "inbox_guest_deletion"("actorId");

-- AddForeignKey
-- A new, empty table: there are no rows to scan, so NOT VALID would buy nothing.
-- squawk-ignore adding-foreign-key-constraint, constraint-missing-not-valid
ALTER TABLE "inbox_lead_tally" ADD CONSTRAINT "inbox_lead_tally_officeId_fkey" FOREIGN KEY ("officeId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
-- A new, empty table: there are no rows to scan, so NOT VALID would buy nothing.
-- squawk-ignore adding-foreign-key-constraint, constraint-missing-not-valid
ALTER TABLE "inbox_guest_deletion" ADD CONSTRAINT "inbox_guest_deletion_officeId_fkey" FOREIGN KEY ("officeId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
-- A new, empty table: there are no rows to scan, so NOT VALID would buy nothing.
-- squawk-ignore adding-foreign-key-constraint, constraint-missing-not-valid
ALTER TABLE "inbox_guest_deletion" ADD CONSTRAINT "inbox_guest_deletion_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;
