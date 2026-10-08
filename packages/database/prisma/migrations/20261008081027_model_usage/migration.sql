-- CreateTable
CREATE TABLE "inbox_model_usage" (
    "officeId" TEXT NOT NULL,
    "day" DATE NOT NULL,
    "task" TEXT NOT NULL,
    "calls" INTEGER NOT NULL,

    CONSTRAINT "inbox_model_usage_pkey" PRIMARY KEY ("officeId","day","task")
);

-- AddForeignKey
-- A new, empty table: there are no rows to scan, so NOT VALID would buy nothing.
-- squawk-ignore adding-foreign-key-constraint, constraint-missing-not-valid
ALTER TABLE "inbox_model_usage" ADD CONSTRAINT "inbox_model_usage_officeId_fkey" FOREIGN KEY ("officeId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
