-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Order" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "orderNo" TEXT NOT NULL,
    "userId" TEXT,
    "guestEmail" TEXT,
    "guestPhone" TEXT,
    "tierId" TEXT NOT NULL,
    "priceAtPurchase" INTEGER NOT NULL,
    "couponId" TEXT,
    "discountAmount" INTEGER NOT NULL DEFAULT 0,
    "pointsUsed" INTEGER NOT NULL DEFAULT 0,
    "finalAmount" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING_PAYMENT',
    "reservationExpiresAt" DATETIME,
    "paidAt" DATETIME,
    "drawnAt" DATETIME,
    "completedAt" DATETIME,
    "cancelledAt" DATETIME,
    "cancelReason" TEXT,
    "firstDownloadedAt" DATETIME,
    "isBonusOrder" BOOLEAN NOT NULL DEFAULT false,
    "bonusForOrderId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Order_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Order_tierId_fkey" FOREIGN KEY ("tierId") REFERENCES "Tier" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Order_couponId_fkey" FOREIGN KEY ("couponId") REFERENCES "Coupon" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Order_bonusForOrderId_fkey" FOREIGN KEY ("bonusForOrderId") REFERENCES "Order" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Order" ("cancelReason", "cancelledAt", "completedAt", "couponId", "createdAt", "discountAmount", "drawnAt", "finalAmount", "firstDownloadedAt", "guestEmail", "guestPhone", "id", "orderNo", "paidAt", "pointsUsed", "priceAtPurchase", "reservationExpiresAt", "status", "tierId", "updatedAt", "userId") SELECT "cancelReason", "cancelledAt", "completedAt", "couponId", "createdAt", "discountAmount", "drawnAt", "finalAmount", "firstDownloadedAt", "guestEmail", "guestPhone", "id", "orderNo", "paidAt", "pointsUsed", "priceAtPurchase", "reservationExpiresAt", "status", "tierId", "updatedAt", "userId" FROM "Order";
DROP TABLE "Order";
ALTER TABLE "new_Order" RENAME TO "Order";
CREATE UNIQUE INDEX "Order_orderNo_key" ON "Order"("orderNo");
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
    "gachaCostPoints" INTEGER NOT NULL DEFAULT 100,
    "buyOneGetOneEventEnabled" BOOLEAN NOT NULL DEFAULT false
);
INSERT INTO "new_ShopSetting" ("adminDutyChannelId", "adminDutyControlChannelId", "adminDutyControlMessageId", "adminDutyMessageId", "announcementChannelId", "bankAccountHolder", "bankAccountNumber", "bankName", "bankWebhookSecret", "checkInEventEnabled", "dailyStatsLastPosted", "discordAutoDeleteChannelId", "discordBuyerCountChannelId", "discordMemberCountChannelId", "discordPurchaseLogChannelId", "discordRoleBuyer", "discordRoleTier100k", "discordRoleTier10k", "discordRoleTier150k", "discordRoleTier50k", "discountModeEnabled", "flashSaleEventEnabled", "gachaCostPoints", "gachaEventEnabled", "id", "noticeMessage", "partnerCategoryId", "partnerDailyMessage", "partnerLastBroadcast", "partnerRoleId", "publicStatsChannelId", "publicStatsMessageId", "purchaseCouponDropEnabled", "referralEventEnabled", "refundAllowedAfterDownload", "sellerCategoryId", "sellerFreeTrialDays", "sellerMonthlyPrice", "sellerRoleId", "sellerTicketCategoryId", "shopName", "verifyRoleId") SELECT "adminDutyChannelId", "adminDutyControlChannelId", "adminDutyControlMessageId", "adminDutyMessageId", "announcementChannelId", "bankAccountHolder", "bankAccountNumber", "bankName", "bankWebhookSecret", "checkInEventEnabled", "dailyStatsLastPosted", "discordAutoDeleteChannelId", "discordBuyerCountChannelId", "discordMemberCountChannelId", "discordPurchaseLogChannelId", "discordRoleBuyer", "discordRoleTier100k", "discordRoleTier10k", "discordRoleTier150k", "discordRoleTier50k", "discountModeEnabled", "flashSaleEventEnabled", "gachaCostPoints", "gachaEventEnabled", "id", "noticeMessage", "partnerCategoryId", "partnerDailyMessage", "partnerLastBroadcast", "partnerRoleId", "publicStatsChannelId", "publicStatsMessageId", "purchaseCouponDropEnabled", "referralEventEnabled", "refundAllowedAfterDownload", "sellerCategoryId", "sellerFreeTrialDays", "sellerMonthlyPrice", "sellerRoleId", "sellerTicketCategoryId", "shopName", "verifyRoleId" FROM "ShopSetting";
DROP TABLE "ShopSetting";
ALTER TABLE "new_ShopSetting" RENAME TO "ShopSetting";
CREATE TABLE "new_Tier" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "price" INTEGER NOT NULL,
    "description" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ON_SALE',
    "purchaseLimitPerUser" INTEGER,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "category" TEXT,
    "costPrice" INTEGER,
    "originalPrice" INTEGER,
    "buyOneGetOneEnabled" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_Tier" ("category", "costPrice", "createdAt", "description", "id", "name", "originalPrice", "price", "purchaseLimitPerUser", "slug", "sortOrder", "status", "updatedAt") SELECT "category", "costPrice", "createdAt", "description", "id", "name", "originalPrice", "price", "purchaseLimitPerUser", "slug", "sortOrder", "status", "updatedAt" FROM "Tier";
DROP TABLE "Tier";
ALTER TABLE "new_Tier" RENAME TO "Tier";
CREATE UNIQUE INDEX "Tier_slug_key" ON "Tier"("slug");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
