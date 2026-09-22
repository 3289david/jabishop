-- AlterTable
ALTER TABLE "ShopSetting" ADD COLUMN "partnerCategoryId" TEXT;
ALTER TABLE "ShopSetting" ADD COLUMN "partnerDailyMessage" TEXT;
ALTER TABLE "ShopSetting" ADD COLUMN "partnerLastBroadcast" DATETIME;
ALTER TABLE "ShopSetting" ADD COLUMN "partnerRoleId" TEXT;

-- CreateTable
CREATE TABLE "Partner" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "discordUserId" TEXT NOT NULL,
    "discordTag" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "webhookUrl" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "channelId" TEXT,
    "adminNote" TEXT,
    "processedByAdminId" TEXT,
    "processedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE UNIQUE INDEX "Partner_discordUserId_key" ON "Partner"("discordUserId");
