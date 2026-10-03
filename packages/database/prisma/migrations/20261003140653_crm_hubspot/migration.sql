-- AlterEnum
ALTER TYPE "CrmKind" ADD VALUE 'hubspot';

-- AlterTable
ALTER TABLE "inbox_crm_connection" ADD COLUMN     "accessToken" TEXT;
