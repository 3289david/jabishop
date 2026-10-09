-- AlterTable
ALTER TABLE "ShopSetting" ADD COLUMN "promoReportLastSentAt" DATETIME;

-- CreateTable
CREATE TABLE "PromoStaff" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "discordUserId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "inviteCode" TEXT NOT NULL,
    "inviteChannelId" TEXT,
    "bankName" TEXT,
    "bankAccountNumber" TEXT,
    "accountHolder" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "removedAt" DATETIME
);

-- CreateTable
CREATE TABLE "PromoInvite" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "promoStaffId" TEXT NOT NULL,
    "discordUserId" TEXT NOT NULL,
    "joinedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PromoInvite_promoStaffId_fkey" FOREIGN KEY ("promoStaffId") REFERENCES "PromoStaff" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "PromoStaff_discordUserId_key" ON "PromoStaff"("discordUserId");

-- CreateIndex
CREATE UNIQUE INDEX "PromoStaff_inviteCode_key" ON "PromoStaff"("inviteCode");

-- CreateIndex
CREATE UNIQUE INDEX "PromoInvite_discordUserId_key" ON "PromoInvite"("discordUserId");
