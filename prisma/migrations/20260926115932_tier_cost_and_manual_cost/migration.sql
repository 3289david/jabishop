-- AlterTable
ALTER TABLE "Tier" ADD COLUMN "costPrice" INTEGER;

-- CreateTable
CREATE TABLE "ManualCostAdjustment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "amount" INTEGER NOT NULL,
    "memo" TEXT,
    "createdByAdminId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
