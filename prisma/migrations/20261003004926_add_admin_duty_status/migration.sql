-- AlterTable
ALTER TABLE "ShopSetting" ADD COLUMN "adminDutyChannelId" TEXT;
ALTER TABLE "ShopSetting" ADD COLUMN "adminDutyControlChannelId" TEXT;
ALTER TABLE "ShopSetting" ADD COLUMN "adminDutyControlMessageId" TEXT;
ALTER TABLE "ShopSetting" ADD COLUMN "adminDutyMessageId" TEXT;

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_AdminUser" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "loginId" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'STAFF',
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "totpSecret" TEXT,
    "totpEnabled" BOOLEAN NOT NULL DEFAULT false,
    "discordId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "dutyStatus" TEXT NOT NULL DEFAULT 'OFF_DUTY',
    "dutyStatusUpdatedAt" DATETIME
);
INSERT INTO "new_AdminUser" ("createdAt", "discordId", "id", "loginId", "name", "passwordHash", "role", "status", "totpEnabled", "totpSecret", "updatedAt") SELECT "createdAt", "discordId", "id", "loginId", "name", "passwordHash", "role", "status", "totpEnabled", "totpSecret", "updatedAt" FROM "AdminUser";
DROP TABLE "AdminUser";
ALTER TABLE "new_AdminUser" RENAME TO "AdminUser";
CREATE UNIQUE INDEX "AdminUser_loginId_key" ON "AdminUser"("loginId");
CREATE UNIQUE INDEX "AdminUser_discordId_key" ON "AdminUser"("discordId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
