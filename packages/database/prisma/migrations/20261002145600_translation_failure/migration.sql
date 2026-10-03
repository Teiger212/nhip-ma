-- CreateTable
CREATE TABLE "inbox_translation_failure" (
    "messageId" TEXT NOT NULL,
    "locale" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL,
    "lastFailedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "inbox_translation_failure_pkey" PRIMARY KEY ("messageId","locale")
);

-- AddForeignKey
ALTER TABLE "inbox_translation_failure" ADD CONSTRAINT "inbox_translation_failure_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "inbox_message"("id") ON DELETE CASCADE ON UPDATE CASCADE;
