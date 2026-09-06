-- AlterTable
ALTER TABLE "Order" ADD COLUMN "firstDownloadedAt" DATETIME;

-- CreateTable
CREATE TABLE "DownloadLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "orderId" TEXT NOT NULL,
    "ip" TEXT,
    "userAgent" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DownloadLog_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ShopSetting" (
    "id" TEXT NOT NULL PRIMARY KEY DEFAULT 'singleton',
    "shopName" TEXT NOT NULL DEFAULT '자비샵',
    "bankName" TEXT NOT NULL DEFAULT '',
    "bankAccountNumber" TEXT NOT NULL DEFAULT '',
    "bankAccountHolder" TEXT NOT NULL DEFAULT '',
    "refundAllowedAfterDownload" BOOLEAN NOT NULL DEFAULT false,
    "noticeMessage" TEXT
);
