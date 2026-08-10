-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "OrderSource" ADD VALUE 'SWIGGY';
ALTER TYPE "OrderSource" ADD VALUE 'ZOMATO';

-- AlterEnum
ALTER TYPE "PaymentMethod" ADD VALUE 'ONLINE';

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "externalRef" TEXT,
ADD COLUMN     "paid" BOOLEAN NOT NULL DEFAULT true;

-- CreateIndex
CREATE INDEX "Order_source_createdAt_idx" ON "Order"("source", "createdAt");

-- CreateIndex
CREATE INDEX "Order_externalRef_idx" ON "Order"("externalRef");
