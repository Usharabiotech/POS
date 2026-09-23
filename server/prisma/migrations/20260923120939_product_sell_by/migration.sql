-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "sellBy" TEXT NOT NULL DEFAULT 'each',
ADD COLUMN     "unit" TEXT NOT NULL DEFAULT 'g';
