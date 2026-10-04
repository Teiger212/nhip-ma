-- CreateEnum
CREATE TYPE "AlertKind" AS ENUM ('guest', 'returned', 'assigned', 'test');

-- CreateTable
CREATE TABLE "inbox_alert" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "conversationId" TEXT,
    "officeId" TEXT NOT NULL,
    "kind" "AlertKind" NOT NULL,
    "sounded" BOOLEAN NOT NULL,
    "link" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "inbox_alert_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "inbox_alert_userId_conversationId_createdAt_idx" ON "inbox_alert"("userId", "conversationId", "createdAt");

-- CreateIndex
CREATE INDEX "inbox_alert_conversationId_officeId_idx" ON "inbox_alert"("conversationId", "officeId");

-- CreateIndex
CREATE INDEX "inbox_alert_officeId_idx" ON "inbox_alert"("officeId");

-- CreateIndex
CREATE INDEX "inbox_alert_createdAt_idx" ON "inbox_alert"("createdAt");

-- AddForeignKey
-- A new, empty table: there are no rows to scan, so NOT VALID would buy nothing.
-- squawk-ignore adding-foreign-key-constraint, constraint-missing-not-valid
ALTER TABLE "inbox_alert" ADD CONSTRAINT "inbox_alert_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
-- A new, empty table: there are no rows to scan, so NOT VALID would buy nothing.
-- squawk-ignore adding-foreign-key-constraint, constraint-missing-not-valid
ALTER TABLE "inbox_alert" ADD CONSTRAINT "inbox_alert_conversationId_officeId_fkey" FOREIGN KEY ("conversationId", "officeId") REFERENCES "inbox_conversation"("id", "officeId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
-- A new, empty table: there are no rows to scan, so NOT VALID would buy nothing.
-- squawk-ignore adding-foreign-key-constraint, constraint-missing-not-valid
ALTER TABLE "inbox_alert" ADD CONSTRAINT "inbox_alert_officeId_fkey" FOREIGN KEY ("officeId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
