-- AlterTable
ALTER TABLE "ExchangeRequest" ADD COLUMN "remindedAt" DATETIME;

-- AlterTable
ALTER TABLE "RefundRequest" ADD COLUMN "remindedAt" DATETIME;

-- CreateTable
CREATE TABLE "RestockSubscription" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "tierId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "RestockSubscription_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "RestockSubscription_tierId_fkey" FOREIGN KEY ("tierId") REFERENCES "Tier" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "discordId" TEXT,
    "isSeedData" BOOLEAN NOT NULL DEFAULT false,
    "points" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "suspendedReason" TEXT,
    "adminMemo" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "lastCheckInAt" DATETIME,
    "checkInStreak" INTEGER NOT NULL DEFAULT 0,
    "referralCode" TEXT,
    "referredByUserId" TEXT,
    "referralRewardedAt" DATETIME,
    "leaderboardAnonymous" BOOLEAN NOT NULL DEFAULT false,
    CONSTRAINT "User_referredByUserId_fkey" FOREIGN KEY ("referredByUserId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_User" ("adminMemo", "checkInStreak", "createdAt", "discordId", "email", "id", "isSeedData", "lastCheckInAt", "name", "passwordHash", "phone", "points", "referralCode", "referralRewardedAt", "referredByUserId", "status", "suspendedReason", "updatedAt") SELECT "adminMemo", "checkInStreak", "createdAt", "discordId", "email", "id", "isSeedData", "lastCheckInAt", "name", "passwordHash", "phone", "points", "referralCode", "referralRewardedAt", "referredByUserId", "status", "suspendedReason", "updatedAt" FROM "User";
DROP TABLE "User";
ALTER TABLE "new_User" RENAME TO "User";
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
CREATE UNIQUE INDEX "User_discordId_key" ON "User"("discordId");
CREATE UNIQUE INDEX "User_referralCode_key" ON "User"("referralCode");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "RestockSubscription_userId_tierId_key" ON "RestockSubscription"("userId", "tierId");
