-- CreateTable
CREATE TABLE "Seller" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "discordUserId" TEXT NOT NULL,
    "discordTag" TEXT NOT NULL,
    "storeName" TEXT NOT NULL,
    "category" TEXT,
    "saleMethod" TEXT,
    "description" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "channelId" TEXT,
    "startedAt" DATETIME,
    "nextBillingAt" DATETIME,
    "lastReminderDays" INTEGER,
    "expiredAt" DATETIME,
    "ratingSum" INTEGER NOT NULL DEFAULT 0,
    "ratingCount" INTEGER NOT NULL DEFAULT 0,
    "dealCount" INTEGER NOT NULL DEFAULT 0,
    "adminNote" TEXT,
    "processedByAdminId" TEXT,
    "processedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "SellerProduct" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sellerId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "price" INTEGER NOT NULL,
    "stock" INTEGER,
    "description" TEXT,
    "purchaseMethod" TEXT,
    "refundPolicy" TEXT,
    "channelId" TEXT,
    "messageId" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SellerProduct_sellerId_fkey" FOREIGN KEY ("sellerId") REFERENCES "Seller" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SellerTicket" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sellerId" TEXT NOT NULL,
    "productId" TEXT,
    "buyerDiscordId" TEXT NOT NULL,
    "buyerTag" TEXT NOT NULL,
    "channelId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedAt" DATETIME,
    CONSTRAINT "SellerTicket_sellerId_fkey" FOREIGN KEY ("sellerId") REFERENCES "Seller" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "SellerTicket_productId_fkey" FOREIGN KEY ("productId") REFERENCES "SellerProduct" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SellerReview" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sellerId" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "buyerDiscordId" TEXT NOT NULL,
    "rating" INTEGER NOT NULL,
    "content" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SellerReview_sellerId_fkey" FOREIGN KEY ("sellerId") REFERENCES "Seller" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "SellerReview_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "SellerTicket" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SellerReport" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sellerId" TEXT NOT NULL,
    "reporterDiscordId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "detail" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "action" TEXT,
    "processedByAdminId" TEXT,
    "processedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SellerReport_sellerId_fkey" FOREIGN KEY ("sellerId") REFERENCES "Seller" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

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
INSERT INTO "new_ShopSetting" ("adminDutyChannelId", "adminDutyControlChannelId", "adminDutyControlMessageId", "adminDutyMessageId", "announcementChannelId", "bankAccountHolder", "bankAccountNumber", "bankName", "bankWebhookSecret", "checkInEventEnabled", "dailyStatsLastPosted", "discordAutoDeleteChannelId", "discordBuyerCountChannelId", "discordMemberCountChannelId", "discordPurchaseLogChannelId", "discordRoleBuyer", "discordRoleTier100k", "discordRoleTier10k", "discordRoleTier150k", "discordRoleTier50k", "discountModeEnabled", "flashSaleEventEnabled", "gachaCostPoints", "gachaEventEnabled", "id", "noticeMessage", "partnerCategoryId", "partnerDailyMessage", "partnerLastBroadcast", "partnerRoleId", "publicStatsChannelId", "publicStatsMessageId", "purchaseCouponDropEnabled", "referralEventEnabled", "refundAllowedAfterDownload", "shopName", "verifyRoleId") SELECT "adminDutyChannelId", "adminDutyControlChannelId", "adminDutyControlMessageId", "adminDutyMessageId", "announcementChannelId", "bankAccountHolder", "bankAccountNumber", "bankName", "bankWebhookSecret", "checkInEventEnabled", "dailyStatsLastPosted", "discordAutoDeleteChannelId", "discordBuyerCountChannelId", "discordMemberCountChannelId", "discordPurchaseLogChannelId", "discordRoleBuyer", "discordRoleTier100k", "discordRoleTier10k", "discordRoleTier150k", "discordRoleTier50k", "discountModeEnabled", "flashSaleEventEnabled", "gachaCostPoints", "gachaEventEnabled", "id", "noticeMessage", "partnerCategoryId", "partnerDailyMessage", "partnerLastBroadcast", "partnerRoleId", "publicStatsChannelId", "publicStatsMessageId", "purchaseCouponDropEnabled", "referralEventEnabled", "refundAllowedAfterDownload", "shopName", "verifyRoleId" FROM "ShopSetting";
DROP TABLE "ShopSetting";
ALTER TABLE "new_ShopSetting" RENAME TO "ShopSetting";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "Seller_discordUserId_key" ON "Seller"("discordUserId");

-- CreateIndex
CREATE UNIQUE INDEX "SellerReview_ticketId_key" ON "SellerReview"("ticketId");
