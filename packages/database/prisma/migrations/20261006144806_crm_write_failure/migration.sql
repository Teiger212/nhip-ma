-- CreateTable
CREATE TABLE "inbox_mock_crm_outage" (
    "officeId" TEXT NOT NULL,
    "since" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "inbox_mock_crm_outage_pkey" PRIMARY KEY ("officeId")
);

-- CreateTable
CREATE TABLE "inbox_crm_write_failure" (
    "conversationId" TEXT NOT NULL,
    "officeId" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL,
    "lastFailedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "inbox_crm_write_failure_pkey" PRIMARY KEY ("conversationId")
);

-- CreateIndex
CREATE INDEX "inbox_crm_write_failure_officeId_idx" ON "inbox_crm_write_failure"("officeId");

-- CreateIndex
CREATE UNIQUE INDEX "inbox_crm_write_failure_conversationId_officeId_key" ON "inbox_crm_write_failure"("conversationId", "officeId");

-- AddForeignKey
-- A new, empty table: there are no rows to scan, so NOT VALID would buy nothing.
-- squawk-ignore adding-foreign-key-constraint, constraint-missing-not-valid
ALTER TABLE "inbox_mock_crm_outage" ADD CONSTRAINT "inbox_mock_crm_outage_officeId_fkey" FOREIGN KEY ("officeId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
-- A new, empty table: there are no rows to scan, so NOT VALID would buy nothing.
-- squawk-ignore adding-foreign-key-constraint, constraint-missing-not-valid
ALTER TABLE "inbox_crm_write_failure" ADD CONSTRAINT "inbox_crm_write_failure_conversationId_officeId_fkey" FOREIGN KEY ("conversationId", "officeId") REFERENCES "inbox_conversation"("id", "officeId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
-- A new, empty table: there are no rows to scan, so NOT VALID would buy nothing.
-- squawk-ignore adding-foreign-key-constraint, constraint-missing-not-valid
ALTER TABLE "inbox_crm_write_failure" ADD CONSTRAINT "inbox_crm_write_failure_officeId_fkey" FOREIGN KEY ("officeId") REFERENCES "inbox_crm_connection"("officeId") ON DELETE CASCADE ON UPDATE CASCADE;
