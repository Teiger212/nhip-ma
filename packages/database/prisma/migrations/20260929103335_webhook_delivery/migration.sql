-- CreateTable
CREATE TABLE "inbox_webhook_delivery" (
    "id" TEXT NOT NULL,
    "pipe" "Pipe" NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "outcome" TEXT NOT NULL,
    "endpoints" TEXT[],
    "officeIds" TEXT[],
    "filed" INTEGER NOT NULL DEFAULT 0,
    "dropped" INTEGER NOT NULL DEFAULT 0,
    "vendorMessageIds" TEXT[],
    "errorKind" TEXT,

    CONSTRAINT "inbox_webhook_delivery_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "inbox_webhook_delivery_receivedAt_idx" ON "inbox_webhook_delivery"("receivedAt");
