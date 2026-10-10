-- CreateTable
CREATE TABLE "VerificationLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "discordUserId" TEXT NOT NULL,
    "discordUsername" TEXT NOT NULL,
    "ip" TEXT,
    "userAgent" TEXT,
    "verifiedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
