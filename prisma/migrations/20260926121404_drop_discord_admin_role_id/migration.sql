/*
  Warnings:

  - You are about to drop the column `discordAdminRoleId` on the `ShopSetting` table. All the data in the column will be lost.

*/
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
    "publicStatsMessageId" TEXT
);
INSERT INTO "new_ShopSetting" ("announcementChannelId", "bankAccountHolder", "bankAccountNumber", "bankName", "dailyStatsLastPosted", "discordAutoDeleteChannelId", "discordBuyerCountChannelId", "discordMemberCountChannelId", "discordPurchaseLogChannelId", "discordRoleBuyer", "discordRoleTier100k", "discordRoleTier10k", "discordRoleTier150k", "discordRoleTier50k", "id", "noticeMessage", "partnerCategoryId", "partnerDailyMessage", "partnerLastBroadcast", "partnerRoleId", "publicStatsChannelId", "publicStatsMessageId", "refundAllowedAfterDownload", "shopName") SELECT "announcementChannelId", "bankAccountHolder", "bankAccountNumber", "bankName", "dailyStatsLastPosted", "discordAutoDeleteChannelId", "discordBuyerCountChannelId", "discordMemberCountChannelId", "discordPurchaseLogChannelId", "discordRoleBuyer", "discordRoleTier100k", "discordRoleTier10k", "discordRoleTier150k", "discordRoleTier50k", "id", "noticeMessage", "partnerCategoryId", "partnerDailyMessage", "partnerLastBroadcast", "partnerRoleId", "publicStatsChannelId", "publicStatsMessageId", "refundAllowedAfterDownload", "shopName" FROM "ShopSetting";
DROP TABLE "ShopSetting";
ALTER TABLE "new_ShopSetting" RENAME TO "ShopSetting";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
