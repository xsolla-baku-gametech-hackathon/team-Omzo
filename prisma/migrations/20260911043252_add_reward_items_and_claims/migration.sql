-- CreateEnum
CREATE TYPE "RewardKind" AS ENUM ('CREDITS_MENTION', 'EARLY_ACCESS', 'ITEM_CODE', 'STEAM_KEY');

-- CreateEnum
CREATE TYPE "ClaimStatus" AS ENUM ('REQUESTED', 'FULFILLED', 'CANCELLED');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "LedgerReason" ADD VALUE 'REWARD_CLAIMED';
ALTER TYPE "LedgerReason" ADD VALUE 'CLAIM_REFUNDED';

-- CreateTable
CREATE TABLE "RewardItem" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "kind" "RewardKind" NOT NULL,
    "label" TEXT NOT NULL,
    "costCoins" INTEGER NOT NULL,
    "totalStock" INTEGER NOT NULL,
    "claimedCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RewardItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RewardClaim" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "rewardItemId" TEXT NOT NULL,
    "status" "ClaimStatus" NOT NULL DEFAULT 'REQUESTED',
    "fulfilledCode" TEXT,
    "idempotencyKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "RewardClaim_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RewardItem_campaignId_idx" ON "RewardItem"("campaignId");

-- CreateIndex
CREATE UNIQUE INDEX "RewardClaim_idempotencyKey_key" ON "RewardClaim"("idempotencyKey");

-- CreateIndex
CREATE INDEX "RewardClaim_rewardItemId_createdAt_idx" ON "RewardClaim"("rewardItemId", "createdAt");

-- CreateIndex
CREATE INDEX "RewardClaim_userId_createdAt_idx" ON "RewardClaim"("userId", "createdAt");

-- AddForeignKey
ALTER TABLE "RewardItem" ADD CONSTRAINT "RewardItem_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RewardClaim" ADD CONSTRAINT "RewardClaim_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RewardClaim" ADD CONSTRAINT "RewardClaim_rewardItemId_fkey" FOREIGN KEY ("rewardItemId") REFERENCES "RewardItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
