-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Artwork" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "code" TEXT NOT NULL,
    "tierId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "quality" TEXT,
    "widthPx" INTEGER,
    "heightPx" INTEGER,
    "fileFormat" TEXT,
    "series" TEXT,
    "character" TEXT,
    "madeYear" INTEGER,
    "rarityStars" INTEGER NOT NULL DEFAULT 1,
    "limitedEdition" BOOLEAN NOT NULL DEFAULT false,
    "isSeedData" BOOLEAN NOT NULL DEFAULT false,
    "fileKey" TEXT NOT NULL,
    "previewKey" TEXT,
    "status" TEXT NOT NULL DEFAULT 'AVAILABLE',
    "reservedOrderId" TEXT,
    "reservedAt" DATETIME,
    "soldAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Artwork_tierId_fkey" FOREIGN KEY ("tierId") REFERENCES "Tier" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Artwork_reservedOrderId_fkey" FOREIGN KEY ("reservedOrderId") REFERENCES "Order" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Artwork" ("category", "character", "code", "createdAt", "fileFormat", "fileKey", "heightPx", "id", "limitedEdition", "madeYear", "previewKey", "quality", "rarityStars", "reservedAt", "reservedOrderId", "series", "soldAt", "status", "tierId", "title", "updatedAt", "widthPx") SELECT "category", "character", "code", "createdAt", "fileFormat", "fileKey", "heightPx", "id", "limitedEdition", "madeYear", "previewKey", "quality", "rarityStars", "reservedAt", "reservedOrderId", "series", "soldAt", "status", "tierId", "title", "updatedAt", "widthPx" FROM "Artwork";
DROP TABLE "Artwork";
ALTER TABLE "new_Artwork" RENAME TO "Artwork";
CREATE UNIQUE INDEX "Artwork_code_key" ON "Artwork"("code");
CREATE UNIQUE INDEX "Artwork_reservedOrderId_key" ON "Artwork"("reservedOrderId");
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
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_User" ("adminMemo", "createdAt", "discordId", "email", "id", "name", "passwordHash", "phone", "points", "status", "suspendedReason", "updatedAt") SELECT "adminMemo", "createdAt", "discordId", "email", "id", "name", "passwordHash", "phone", "points", "status", "suspendedReason", "updatedAt" FROM "User";
DROP TABLE "User";
ALTER TABLE "new_User" RENAME TO "User";
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
CREATE UNIQUE INDEX "User_discordId_key" ON "User"("discordId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

