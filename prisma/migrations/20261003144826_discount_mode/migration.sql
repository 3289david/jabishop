-- AlterTable
ALTER TABLE "Tier" ADD COLUMN "originalPrice" INTEGER;

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
    "adminDutyChannelId" TEXT,
    "adminDutyMessageId" TEXT,
    "adminDutyControlChannelId" TEXT,
    "adminDutyControlMessageId" TEXT,
    "purchaseCouponDropEnabled" BOOLEAN NOT NULL DEFAULT false,
    "discountModeEnabled" BOOLEAN NOT NULL DEFAULT false,
    "checkInEventEnabled" BOOLEAN NOT NULL DEFAULT false,
    "flashSaleEventEnabled" BOOLEAN NOT NULL DEFAULT false,
    "referralEventEnabled" BOOLEAN NOT NULL DEFAULT false,
    "gachaEventEnabled" BOOLEAN NOT NULL DEFAULT false,
    "gachaCostPoints" INTEGER NOT NULL DEFAULT 100
);
INSERT INTO "new_ShopSetting" ("adminDutyChannelId", "adminDutyControlChannelId", "adminDutyControlMessageId", "adminDutyMessageId", "announcementChannelId", "bankAccountHolder", "bankAccountNumber", "bankName", "checkInEventEnabled", "dailyStatsLastPosted", "discordAutoDeleteChannelId", "discordBuyerCountChannelId", "discordMemberCountChannelId", "discordPurchaseLogChannelId", "discordRoleBuyer", "discordRoleTier100k", "discordRoleTier10k", "discordRoleTier150k", "discordRoleTier50k", "flashSaleEventEnabled", "gachaCostPoints", "gachaEventEnabled", "id", "noticeMessage", "partnerCategoryId", "partnerDailyMessage", "partnerLastBroadcast", "partnerRoleId", "publicStatsChannelId", "publicStatsMessageId", "purchaseCouponDropEnabled", "referralEventEnabled", "refundAllowedAfterDownload", "shopName") SELECT "adminDutyChannelId", "adminDutyControlChannelId", "adminDutyControlMessageId", "adminDutyMessageId", "announcementChannelId", "bankAccountHolder", "bankAccountNumber", "bankName", "checkInEventEnabled", "dailyStatsLastPosted", "discordAutoDeleteChannelId", "discordBuyerCountChannelId", "discordMemberCountChannelId", "discordPurchaseLogChannelId", "discordRoleBuyer", "discordRoleTier100k", "discordRoleTier10k", "discordRoleTier150k", "discordRoleTier50k", "flashSaleEventEnabled", "gachaCostPoints", "gachaEventEnabled", "id", "noticeMessage", "partnerCategoryId", "partnerDailyMessage", "partnerLastBroadcast", "partnerRoleId", "publicStatsChannelId", "publicStatsMessageId", "purchaseCouponDropEnabled", "referralEventEnabled", "refundAllowedAfterDownload", "shopName" FROM "ShopSetting";
DROP TABLE "ShopSetting";
ALTER TABLE "new_ShopSetting" RENAME TO "ShopSetting";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
