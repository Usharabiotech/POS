-- AlterEnum
ALTER TYPE "OrderStatus" ADD VALUE 'AWAITING_PAYMENT';

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "customerName" TEXT,
ADD COLUMN     "gatewayOrderId" TEXT,
ADD COLUMN     "tender" TEXT;
