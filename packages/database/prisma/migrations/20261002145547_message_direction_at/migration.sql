-- CreateIndex
CREATE INDEX "inbox_message_conversationId_direction_at_idx" ON "inbox_message"("conversationId", "direction", "at");
