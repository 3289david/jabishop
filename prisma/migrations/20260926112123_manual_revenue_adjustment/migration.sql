-- CreateTable
CREATE TABLE "ManualRevenueAdjustment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "amount" INTEGER NOT NULL,
    "memo" TEXT,
    "createdByAdminId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
