-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_StickyMessage" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "channelId" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'CUSTOM',
    "title" TEXT,
    "content" TEXT,
    "imageUrl" TEXT,
    "color" INTEGER,
    "messageId" TEXT,
    "createdByAdminId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_StickyMessage" ("channelId", "color", "content", "createdAt", "createdByAdminId", "id", "imageUrl", "messageId", "title", "updatedAt") SELECT "channelId", "color", "content", "createdAt", "createdByAdminId", "id", "imageUrl", "messageId", "title", "updatedAt" FROM "StickyMessage";
DROP TABLE "StickyMessage";
ALTER TABLE "new_StickyMessage" RENAME TO "StickyMessage";
CREATE UNIQUE INDEX "StickyMessage_channelId_key" ON "StickyMessage"("channelId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
