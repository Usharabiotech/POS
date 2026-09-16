-- CreateEnum
CREATE TYPE "LoyaltyOutboxStatus" AS ENUM ('PENDING', 'SENT', 'FAILED');

-- CreateTable
CREATE TABLE "LoyaltyOutbox" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "status" "LoyaltyOutboxStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sentAt" TIMESTAMP(3),

    CONSTRAINT "LoyaltyOutbox_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "LoyaltyOutbox_orderId_key" ON "LoyaltyOutbox"("orderId");

-- CreateIndex
CREATE INDEX "LoyaltyOutbox_status_idx" ON "LoyaltyOutbox"("status");
