/*
  Warnings:

  - You are about to drop the column `maxCount` on the `Tier` table. All the data in the column will be lost.
  - You are about to drop the column `minCount` on the `Tier` table. All the data in the column will be lost.

*/
-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Tier" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "price" INTEGER NOT NULL,
    "description" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ON_SALE',
    "purchaseLimitPerUser" INTEGER,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_Tier" ("id", "slug", "name", "price", "description", "status", "purchaseLimitPerUser", "sortOrder", "createdAt", "updatedAt") SELECT "id", "slug", "name", "price", "description", "status", "purchaseLimitPerUser", "sortOrder", "createdAt", "updatedAt" FROM "Tier";
DROP TABLE "Tier";
ALTER TABLE "new_Tier" RENAME TO "Tier";
CREATE UNIQUE INDEX "Tier_slug_key" ON "Tier"("slug");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
