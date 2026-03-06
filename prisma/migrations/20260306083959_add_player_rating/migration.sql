-- CreateTable
CREATE TABLE "player_ratings" (
    "id" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "modeKey" TEXT NOT NULL,
    "rating" DOUBLE PRECISION NOT NULL DEFAULT 1500,
    "gamesPlayed" INTEGER NOT NULL DEFAULT 0,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "player_ratings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "player_ratings_platform_accountId_idx" ON "player_ratings"("platform", "accountId");

-- CreateIndex
CREATE UNIQUE INDEX "player_ratings_platform_accountId_modeKey_key" ON "player_ratings"("platform", "accountId", "modeKey");
