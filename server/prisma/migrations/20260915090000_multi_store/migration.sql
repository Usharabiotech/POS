-- DropIndex
DROP INDEX "DailySummary_date_key";

-- AlterTable
ALTER TABLE "DailySummary" ADD COLUMN     "storeId" TEXT;

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "storeId" TEXT;

-- CreateTable
CREATE TABLE "Store" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT,
    "address" TEXT,
    "gst" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Store_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Store_code_key" ON "Store"("code");

-- CreateIndex
CREATE UNIQUE INDEX "DailySummary_storeId_date_key" ON "DailySummary"("storeId", "date");

-- CreateIndex
CREATE INDEX "Order_storeId_createdAt_idx" ON "Order"("storeId", "createdAt");

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailySummary" ADD CONSTRAINT "DailySummary_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE SET NULL ON UPDATE CASCADE;
