-- CreateEnum
CREATE TYPE "CrmOutcomeStatus" AS ENUM ('open', 'won', 'lost');

-- AlterTable
ALTER TABLE "inbox_crm_link" ADD COLUMN     "outcome" "CrmOutcomeStatus",
ADD COLUMN     "outcomeAt" TIMESTAMP(3),
ADD COLUMN     "outcomeObservedAt" TIMESTAMP(3),
ADD COLUMN     "outcomeReason" TEXT;

-- AlterTable
ALTER TABLE "inbox_mock_crm_lead" ADD COLUMN     "outcome" "CrmOutcomeStatus" NOT NULL DEFAULT 'open',
ADD COLUMN     "outcomeAt" TIMESTAMP(3),
ADD COLUMN     "outcomeReason" TEXT;
