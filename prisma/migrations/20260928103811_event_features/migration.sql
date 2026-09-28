-- CreateTable
CREATE TABLE "FlashSale" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tierId" TEXT NOT NULL,
    "discountPercent" INTEGER NOT NULL,
    "startsAt" DATETIME NOT NULL,
    "endsAt" DATETIME NOT NULL,
    "createdByAdminId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "FlashSale_tierId_fkey" FOREIGN KEY ("tierId") REFERENCES "Tier" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_ShopSetting" (
    "id" TEXT NOT NULL PRIMARY KEY DEFAULT 'singleton',
    "shopName" TEXT NOT NULL DEFAULT '자비샵',
    "bankName" TEXT NOT NULL DEFAULT '',
    "bankAccountNumber" TEXT NOT NULL DEFAULT '',
    "bankAccountHolder" TEXT NOT NULL DEFAULT '',
    "refundAllowedAfterDownload" BOOLEAN NOT NULL DEFAULT false,
    "noticeMessage" TEXT,
    "discordPurchaseLogChannelId" TEXT,
    "discordMemberCountChannelId" TEXT,
    "discordBuyerCountChannelId" TEXT,
    "discordAutoDeleteChannelId" TEXT,
    "discordRoleTier150k" TEXT,
    "discordRoleTier100k" TEXT,
    "discordRoleTier50k" TEXT,
    "discordRoleTier10k" TEXT,
    "discordRoleBuyer" TEXT,
    "partnerCategoryId" TEXT,
    "partnerRoleId" TEXT,
    "partnerDailyMessage" TEXT,
    "partnerLastBroadcast" DATETIME,
    "announcementChannelId" TEXT,
    "dailyStatsLastPosted" DATETIME,
    "publicStatsChannelId" TEXT,
    "publicStatsMessageId" TEXT,
    "purchaseCouponDropEnabled" BOOLEAN NOT NULL DEFAULT false,
    "checkInEventEnabled" BOOLEAN NOT NULL DEFAULT false,
    "flashSaleEventEnabled" BOOLEAN NOT NULL DEFAULT false,
    "referralEventEnabled" BOOLEAN NOT NULL DEFAULT false,
    "gachaEventEnabled" BOOLEAN NOT NULL DEFAULT false,
    "gachaCostPoints" INTEGER NOT NULL DEFAULT 100
);
INSERT INTO "new_ShopSetting" ("announcementChannelId", "bankAccountHolder", "bankAccountNumber", "bankName", "dailyStatsLastPosted", "discordAutoDeleteChannelId", "discordBuyerCountChannelId", "discordMemberCountChannelId", "discordPurchaseLogChannelId", "discordRoleBuyer", "discordRoleTier100k", "discordRoleTier10k", "discordRoleTier150k", "discordRoleTier50k", "id", "noticeMessage", "partnerCategoryId", "partnerDailyMessage", "partnerLastBroadcast", "partnerRoleId", "publicStatsChannelId", "publicStatsMessageId", "purchaseCouponDropEnabled", "refundAllowedAfterDownload", "shopName") SELECT "announcementChannelId", "bankAccountHolder", "bankAccountNumber", "bankName", "dailyStatsLastPosted", "discordAutoDeleteChannelId", "discordBuyerCountChannelId", "discordMemberCountChannelId", "discordPurchaseLogChannelId", "discordRoleBuyer", "discordRoleTier100k", "discordRoleTier10k", "discordRoleTier150k", "discordRoleTier50k", "id", "noticeMessage", "partnerCategoryId", "partnerDailyMessage", "partnerLastBroadcast", "partnerRoleId", "publicStatsChannelId", "publicStatsMessageId", "purchaseCouponDropEnabled", "refundAllowedAfterDownload", "shopName" FROM "ShopSetting";
DROP TABLE "ShopSetting";
ALTER TABLE "new_ShopSetting" RENAME TO "ShopSetting";
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
    CONSTRAINT "User_referredByUserId_fkey" FOREIGN KEY ("referredByUserId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_User" ("adminMemo", "createdAt", "discordId", "email", "id", "isSeedData", "name", "passwordHash", "phone", "points", "status", "suspendedReason", "updatedAt") SELECT "adminMemo", "createdAt", "discordId", "email", "id", "isSeedData", "name", "passwordHash", "phone", "points", "status", "suspendedReason", "updatedAt" FROM "User";
DROP TABLE "User";
ALTER TABLE "new_User" RENAME TO "User";
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
CREATE UNIQUE INDEX "User_discordId_key" ON "User"("discordId");
CREATE UNIQUE INDEX "User_referralCode_key" ON "User"("referralCode");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
