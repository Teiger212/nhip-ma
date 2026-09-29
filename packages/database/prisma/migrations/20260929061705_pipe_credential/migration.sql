-- CreateTable
CREATE TABLE "inbox_pipe_credential" (
    "pipe" "Pipe" NOT NULL,
    "externalId" TEXT NOT NULL,
    "accessToken" TEXT NOT NULL,
    "refreshToken" TEXT NOT NULL,
    "accessTokenExpiresAt" TIMESTAMP(3) NOT NULL,
    "disconnectedAt" TIMESTAMP(3),
    "disconnectedReason" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "inbox_pipe_credential_pkey" PRIMARY KEY ("pipe","externalId")
);

-- AddForeignKey
ALTER TABLE "inbox_pipe_credential" ADD CONSTRAINT "inbox_pipe_credential_pipe_externalId_fkey" FOREIGN KEY ("pipe", "externalId") REFERENCES "inbox_pipe_connection"("pipe", "externalId") ON DELETE CASCADE ON UPDATE CASCADE;
