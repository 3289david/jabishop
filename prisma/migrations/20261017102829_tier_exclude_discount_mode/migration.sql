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
    "category" TEXT,
    "costPrice" INTEGER,
    "originalPrice" INTEGER,
    "excludeFromDiscountMode" BOOLEAN NOT NULL DEFAULT false,
    "buyOneGetOneEnabled" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_Tier" ("buyOneGetOneEnabled", "category", "costPrice", "createdAt", "description", "id", "name", "originalPrice", "price", "purchaseLimitPerUser", "slug", "sortOrder", "status", "updatedAt") SELECT "buyOneGetOneEnabled", "category", "costPrice", "createdAt", "description", "id", "name", "originalPrice", "price", "purchaseLimitPerUser", "slug", "sortOrder", "status", "updatedAt" FROM "Tier";
DROP TABLE "Tier";
ALTER TABLE "new_Tier" RENAME TO "Tier";
CREATE UNIQUE INDEX "Tier_slug_key" ON "Tier"("slug");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
