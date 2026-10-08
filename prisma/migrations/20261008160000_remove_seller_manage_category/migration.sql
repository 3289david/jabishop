-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_ShopSetting" (
    "id" TEXT NOT NULL PRIMARY KEY DEFAULT 'singleton',
    "shopName" TEXT NOT NULL DEFAULT '자비샵',
    "verifyRoleId" TEXT,
    "bankName" TEXT NOT NULL DEFAULT '',
    "bankAccountNumber" TEXT NOT NULL DEFAULT '',
    "bankAccountHolder" TEXT NOT NULL DEFAULT '',
    "bankWebhookSecret" TEXT,
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
    "sellerCategoryId" TEXT,
    "sellerTicketCategoryId" TEXT,
    "sellerRoleId" TEXT,
    "sellerMonthlyPrice" INTEGER NOT NULL DEFAULT 1000,
    "sellerFreeTrialDays" INTEGER NOT NULL DEFAULT 30,
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
INSERT INTO "new_ShopSetting" ("id", "shopName", "verifyRoleId", "bankName", "bankAccountNumber", "bankAccountHolder", "bankWebhookSecret", "refundAllowedAfterDownload", "noticeMessage", "discordPurchaseLogChannelId", "discordMemberCountChannelId", "discordBuyerCountChannelId", "discordAutoDeleteChannelId", "discordRoleTier150k", "discordRoleTier100k", "discordRoleTier50k", "discordRoleTier10k", "discordRoleBuyer", "partnerCategoryId", "partnerRoleId", "partnerDailyMessage", "partnerLastBroadcast", "sellerCategoryId", "sellerTicketCategoryId", "sellerRoleId", "sellerMonthlyPrice", "sellerFreeTrialDays", "announcementChannelId", "dailyStatsLastPosted", "publicStatsChannelId", "publicStatsMessageId", "adminDutyChannelId", "adminDutyMessageId", "adminDutyControlChannelId", "adminDutyControlMessageId", "purchaseCouponDropEnabled", "discountModeEnabled", "checkInEventEnabled", "flashSaleEventEnabled", "referralEventEnabled", "gachaEventEnabled", "gachaCostPoints")
SELECT "id", "shopName", "verifyRoleId", "bankName", "bankAccountNumber", "bankAccountHolder", "bankWebhookSecret", "refundAllowedAfterDownload", "noticeMessage", "discordPurchaseLogChannelId", "discordMemberCountChannelId", "discordBuyerCountChannelId", "discordAutoDeleteChannelId", "discordRoleTier150k", "discordRoleTier100k", "discordRoleTier50k", "discordRoleTier10k", "discordRoleBuyer", "partnerCategoryId", "partnerRoleId", "partnerDailyMessage", "partnerLastBroadcast", "sellerCategoryId", "sellerTicketCategoryId", "sellerRoleId", "sellerMonthlyPrice", "sellerFreeTrialDays", "announcementChannelId", "dailyStatsLastPosted", "publicStatsChannelId", "publicStatsMessageId", "adminDutyChannelId", "adminDutyMessageId", "adminDutyControlChannelId", "adminDutyControlMessageId", "purchaseCouponDropEnabled", "discountModeEnabled", "checkInEventEnabled", "flashSaleEventEnabled", "referralEventEnabled", "gachaEventEnabled", "gachaCostPoints" FROM "ShopSetting";
DROP TABLE "ShopSetting";
ALTER TABLE "new_ShopSetting" RENAME TO "ShopSetting";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
