-- CreateTable
CREATE TABLE "ServerBackup" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "guildId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "progress" TEXT,
    "error" TEXT,
    "channelCount" INTEGER NOT NULL DEFAULT 0,
    "roleCount" INTEGER NOT NULL DEFAULT 0,
    "messageCount" INTEGER NOT NULL DEFAULT 0,
    "memberCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" DATETIME
);

-- CreateTable
CREATE TABLE "BackupRole" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "backupId" TEXT NOT NULL,
    "originalId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "color" INTEGER NOT NULL,
    "permissions" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "hoist" BOOLEAN NOT NULL,
    "mentionable" BOOLEAN NOT NULL,
    CONSTRAINT "BackupRole_backupId_fkey" FOREIGN KEY ("backupId") REFERENCES "ServerBackup" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "BackupCategory" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "backupId" TEXT NOT NULL,
    "originalId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "overwrites" TEXT NOT NULL,
    CONSTRAINT "BackupCategory_backupId_fkey" FOREIGN KEY ("backupId") REFERENCES "ServerBackup" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "BackupChannel" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "backupId" TEXT NOT NULL,
    "categoryId" TEXT,
    "originalId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" INTEGER NOT NULL,
    "topic" TEXT,
    "position" INTEGER NOT NULL,
    "nsfw" BOOLEAN NOT NULL DEFAULT false,
    "overwrites" TEXT NOT NULL,
    CONSTRAINT "BackupChannel_backupId_fkey" FOREIGN KEY ("backupId") REFERENCES "ServerBackup" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "BackupChannel_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "BackupCategory" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "BackupMessage" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "channelId" TEXT NOT NULL,
    "originalId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "authorName" TEXT NOT NULL,
    "authorAvatarUrl" TEXT,
    "content" TEXT NOT NULL,
    "attachmentUrls" TEXT,
    "reactions" TEXT,
    "postedAt" DATETIME NOT NULL,
    CONSTRAINT "BackupMessage_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "BackupChannel" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "BackupMember" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "backupId" TEXT NOT NULL,
    "discordUserId" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "nickname" TEXT,
    "roleIds" TEXT NOT NULL,
    "joinedAt" DATETIME,
    CONSTRAINT "BackupMember_backupId_fkey" FOREIGN KEY ("backupId") REFERENCES "ServerBackup" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "RestoreJob" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "backupId" TEXT NOT NULL,
    "targetGuildId" TEXT NOT NULL,
    "mode" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "progress" TEXT,
    "error" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" DATETIME,
    CONSTRAINT "RestoreJob_backupId_fkey" FOREIGN KEY ("backupId") REFERENCES "ServerBackup" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
