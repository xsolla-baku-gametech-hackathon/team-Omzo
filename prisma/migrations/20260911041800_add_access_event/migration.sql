-- CreateEnum
CREATE TYPE "AccessOutcome" AS ENUM ('GRANTED', 'DENIED_INVALID_TOKEN', 'DENIED_UA_MISMATCH', 'DENIED_EXPIRED', 'DENIED_REVOKED', 'DENIED_CONSUMED');

-- CreateTable
CREATE TABLE "AccessEvent" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "userId" TEXT,
    "grantId" TEXT,
    "outcome" "AccessOutcome" NOT NULL,
    "buildKind" "BuildKind" NOT NULL,
    "uaHash" TEXT NOT NULL,
    "ipHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AccessEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AccessEvent_campaignId_createdAt_idx" ON "AccessEvent"("campaignId", "createdAt");

-- CreateIndex
CREATE INDEX "AccessEvent_userId_createdAt_idx" ON "AccessEvent"("userId", "createdAt");
