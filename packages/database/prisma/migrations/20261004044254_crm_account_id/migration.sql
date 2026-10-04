-- AlterTable
ALTER TABLE "inbox_crm_connection" ADD COLUMN     "accountId" TEXT;

-- CreateIndex
CREATE INDEX "inbox_crm_connection_kind_accountId_idx" ON "inbox_crm_connection"("kind", "accountId");
