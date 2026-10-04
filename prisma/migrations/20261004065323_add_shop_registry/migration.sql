-- CreateTable
CREATE TABLE "Shop" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "dbPath" TEXT NOT NULL,
    "discordGuildId" TEXT,
    "ownerUserId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PROVISIONING',
    "subscriptionPrice" INTEGER NOT NULL DEFAULT 4000,
    "nextBillingAt" DATETIME,
    "provisionError" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "Shop_slug_key" ON "Shop"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "Shop_dbPath_key" ON "Shop"("dbPath");

-- CreateIndex
CREATE UNIQUE INDEX "Shop_discordGuildId_key" ON "Shop"("discordGuildId");
