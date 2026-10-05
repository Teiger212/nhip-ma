-- CreateEnum
CREATE TYPE "GuestDeletionReason" AS ENUM ('guest_request', 'duplicate_or_spam', 'test_data', 'other');

-- AlterTable
ALTER TABLE "inbox_guest_deletion" ADD COLUMN     "note" TEXT,
ADD COLUMN     "reason" "GuestDeletionReason" NOT NULL DEFAULT 'other';
