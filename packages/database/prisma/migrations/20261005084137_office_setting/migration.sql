-- CreateTable
CREATE TABLE "inbox_office_setting" (
    "officeId" TEXT NOT NULL,
    "autoReply" BOOLEAN NOT NULL DEFAULT true,
    "autoReplyOnSince" TIMESTAMP(3),

    CONSTRAINT "inbox_office_setting_pkey" PRIMARY KEY ("officeId")
);

-- AddForeignKey
-- A new, empty table: there are no rows to scan, so NOT VALID would buy nothing.
-- squawk-ignore adding-foreign-key-constraint, constraint-missing-not-valid
ALTER TABLE "inbox_office_setting" ADD CONSTRAINT "inbox_office_setting_officeId_fkey" FOREIGN KEY ("officeId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
