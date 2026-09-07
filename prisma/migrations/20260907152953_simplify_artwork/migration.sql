/*
  Warnings:

  - You are about to drop the column `category` on the `Artwork` table. All the data in the column will be lost.
  - You are about to drop the column `character` on the `Artwork` table. All the data in the column will be lost.
  - You are about to drop the column `fileFormat` on the `Artwork` table. All the data in the column will be lost.
  - You are about to drop the column `heightPx` on the `Artwork` table. All the data in the column will be lost.
  - You are about to drop the column `limitedEdition` on the `Artwork` table. All the data in the column will be lost.
  - You are about to drop the column `madeYear` on the `Artwork` table. All the data in the column will be lost.
  - You are about to drop the column `quality` on the `Artwork` table. All the data in the column will be lost.
  - You are about to drop the column `rarityStars` on the `Artwork` table. All the data in the column will be lost.
  - You are about to drop the column `series` on the `Artwork` table. All the data in the column will be lost.
  - You are about to drop the column `widthPx` on the `Artwork` table. All the data in the column will be lost.

*/
-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Artwork" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "code" TEXT NOT NULL,
    "tierId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
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
INSERT INTO "new_Artwork" ("code", "createdAt", "fileKey", "id", "isSeedData", "previewKey", "reservedAt", "reservedOrderId", "soldAt", "status", "tierId", "title", "updatedAt") SELECT "code", "createdAt", "fileKey", "id", "isSeedData", "previewKey", "reservedAt", "reservedOrderId", "soldAt", "status", "tierId", "title", "updatedAt" FROM "Artwork";
DROP TABLE "Artwork";
ALTER TABLE "new_Artwork" RENAME TO "Artwork";
CREATE UNIQUE INDEX "Artwork_code_key" ON "Artwork"("code");
CREATE UNIQUE INDEX "Artwork_reservedOrderId_key" ON "Artwork"("reservedOrderId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
