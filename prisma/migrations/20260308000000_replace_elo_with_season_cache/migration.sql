-- DropTable
DROP TABLE "player_ratings";

-- CreateTable
CREATE TABLE "player_season_cache" (
    "id" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "seasonId" TEXT NOT NULL,
    "gameMode" TEXT NOT NULL,
    "kd" DOUBLE PRECISION NOT NULL,
    "adr" DOUBLE PRECISION NOT NULL,
    "wins" INTEGER NOT NULL DEFAULT 0,
    "games" INTEGER NOT NULL DEFAULT 0,
    "cachedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "player_season_cache_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "player_season_cache_platform_accountId_idx" ON "player_season_cache"("platform", "accountId");

-- CreateIndex
CREATE UNIQUE INDEX "player_season_cache_platform_accountId_seasonId_gameMode_key" ON "player_season_cache"("platform", "accountId", "seasonId", "gameMode");
