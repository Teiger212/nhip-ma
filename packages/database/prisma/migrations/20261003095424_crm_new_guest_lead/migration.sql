-- CreateEnum
CREATE TYPE "CrmKind" AS ENUM ('mock');

-- CreateEnum
CREATE TYPE "CrmLinkMethod" AS ENUM ('created', 'phone', 'zaloId');

-- CreateTable
CREATE TABLE "inbox_crm_connection" (
    "officeId" TEXT NOT NULL,
    "kind" "CrmKind" NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "inbox_crm_connection_pkey" PRIMARY KEY ("officeId")
);

-- CreateTable
CREATE TABLE "inbox_crm_link" (
    "conversationId" TEXT NOT NULL,
    "officeId" TEXT NOT NULL,
    "leadId" TEXT,
    "leadName" TEXT,
    "method" "CrmLinkMethod",
    "claimedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "linkedAt" TIMESTAMP(3),

    CONSTRAINT "inbox_crm_link_pkey" PRIMARY KEY ("conversationId")
);

-- CreateTable
CREATE TABLE "inbox_mock_crm_lead" (
    "id" TEXT NOT NULL,
    "officeId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "zaloUserId" TEXT,
    "pipe" "Pipe" NOT NULL,
    "language" TEXT,
    "fields" JSONB,
    "threadUrl" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "inbox_mock_crm_lead_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "inbox_crm_link_officeId_idx" ON "inbox_crm_link"("officeId");

-- CreateIndex
CREATE INDEX "inbox_mock_crm_lead_officeId_phone_idx" ON "inbox_mock_crm_lead"("officeId", "phone");

-- CreateIndex
CREATE INDEX "inbox_mock_crm_lead_officeId_zaloUserId_idx" ON "inbox_mock_crm_lead"("officeId", "zaloUserId");

-- AddForeignKey
ALTER TABLE "inbox_crm_connection" ADD CONSTRAINT "inbox_crm_connection_officeId_fkey" FOREIGN KEY ("officeId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inbox_crm_link" ADD CONSTRAINT "inbox_crm_link_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "inbox_conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inbox_crm_link" ADD CONSTRAINT "inbox_crm_link_officeId_fkey" FOREIGN KEY ("officeId") REFERENCES "inbox_crm_connection"("officeId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inbox_mock_crm_lead" ADD CONSTRAINT "inbox_mock_crm_lead_officeId_fkey" FOREIGN KEY ("officeId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
