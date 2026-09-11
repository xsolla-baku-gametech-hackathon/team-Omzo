-- AlterTable
ALTER TABLE "Campaign" ADD COLUMN "applicationOpensAt" TIMESTAMP(3),
ADD COLUMN "applicationClosesAt" TIMESTAMP(3),
ADD COLUMN "testingStartsAt" TIMESTAMP(3),
ADD COLUMN "testingEndsAt" TIMESTAMP(3);

-- Backfill existing campaigns: open apply/test windows for one year from creation.
UPDATE "Campaign"
SET
  "applicationOpensAt" = "createdAt",
  "applicationClosesAt" = "createdAt" + INTERVAL '1 year',
  "testingStartsAt" = "createdAt",
  "testingEndsAt" = "createdAt" + INTERVAL '1 year'
WHERE "applicationOpensAt" IS NULL;

-- Make required
ALTER TABLE "Campaign" ALTER COLUMN "applicationOpensAt" SET NOT NULL,
ALTER COLUMN "applicationClosesAt" SET NOT NULL,
ALTER COLUMN "testingStartsAt" SET NOT NULL,
ALTER COLUMN "testingEndsAt" SET NOT NULL;

-- CreateEnum
CREATE TYPE "ApplicationStatus" AS ENUM ('PENDING', 'APPROVED', 'DENIED', 'WITHDRAWN');

-- AlterEnum
ALTER TYPE "AccessOutcome" ADD VALUE 'DENIED_OUTSIDE_WINDOW';
ALTER TYPE "AccessOutcome" ADD VALUE 'DENIED_NOT_APPROVED';

-- CreateTable
CREATE TABLE "CampaignApplication" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "testerId" TEXT NOT NULL,
    "status" "ApplicationStatus" NOT NULL DEFAULT 'PENDING',
    "message" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),
    "resolvedById" TEXT,

    CONSTRAINT "CampaignApplication_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CampaignApplication_campaignId_status_idx" ON "CampaignApplication"("campaignId", "status");

-- CreateIndex
CREATE INDEX "CampaignApplication_testerId_createdAt_idx" ON "CampaignApplication"("testerId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "CampaignApplication_campaignId_testerId_key" ON "CampaignApplication"("campaignId", "testerId");

-- AddForeignKey
ALTER TABLE "CampaignApplication" ADD CONSTRAINT "CampaignApplication_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignApplication" ADD CONSTRAINT "CampaignApplication_testerId_fkey" FOREIGN KEY ("testerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignApplication" ADD CONSTRAINT "CampaignApplication_resolvedById_fkey" FOREIGN KEY ("resolvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
