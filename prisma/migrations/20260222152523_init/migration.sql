-- CreateTable
CREATE TABLE "players" (
    "id" TEXT NOT NULL,
    "pubgId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "shardId" TEXT NOT NULL,
    "patchVersion" TEXT NOT NULL,
    "titleId" TEXT NOT NULL,
    "lastMatchAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "players_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "processed_matches" (
    "id" TEXT NOT NULL,
    "matchId" TEXT NOT NULL,
    "processedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "processed_matches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "matches" (
    "id" TEXT NOT NULL,
    "matchId" TEXT NOT NULL,
    "gameMode" TEXT NOT NULL,
    "mapName" TEXT NOT NULL,
    "duration" INTEGER NOT NULL,
    "isCustomMatch" BOOLEAN NOT NULL,
    "seasonState" TEXT NOT NULL,
    "shardId" TEXT NOT NULL,
    "telemetryUrl" TEXT NOT NULL,
    "playedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "matches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rosters" (
    "id" TEXT NOT NULL,
    "matchId" TEXT NOT NULL,
    "rank" INTEGER NOT NULL,
    "won" BOOLEAN NOT NULL,

    CONSTRAINT "rosters_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "participants" (
    "id" TEXT NOT NULL,
    "matchId" TEXT NOT NULL,
    "rosterId" TEXT NOT NULL,
    "pubgId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kills" INTEGER NOT NULL,
    "DBNOs" INTEGER NOT NULL,
    "damageDealt" DOUBLE PRECISION NOT NULL,
    "headshotKills" INTEGER NOT NULL,
    "assists" INTEGER NOT NULL,
    "revives" INTEGER NOT NULL,
    "timeSurvived" DOUBLE PRECISION NOT NULL,
    "walkDistance" DOUBLE PRECISION NOT NULL,
    "longestKill" DOUBLE PRECISION NOT NULL,
    "winPlace" INTEGER NOT NULL,
    "killPlace" INTEGER NOT NULL,
    "killStreaks" INTEGER NOT NULL,
    "boosts" INTEGER NOT NULL,
    "heals" INTEGER NOT NULL,
    "rideDistance" DOUBLE PRECISION NOT NULL,
    "swimDistance" DOUBLE PRECISION NOT NULL,
    "roadKills" INTEGER NOT NULL,
    "teamKills" INTEGER NOT NULL,
    "vehicleDestroys" INTEGER NOT NULL,
    "weaponsAcquired" INTEGER NOT NULL,
    "deathType" TEXT NOT NULL,

    CONSTRAINT "participants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "match_telemetry" (
    "id" TEXT NOT NULL,
    "matchId" TEXT NOT NULL,
    "rawEvents" JSONB NOT NULL,
    "playerAnalyses" JSONB NOT NULL,
    "processedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "match_telemetry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "players_pubgId_key" ON "players"("pubgId");

-- CreateIndex
CREATE UNIQUE INDEX "players_name_key" ON "players"("name");

-- CreateIndex
CREATE UNIQUE INDEX "processed_matches_matchId_key" ON "processed_matches"("matchId");

-- CreateIndex
CREATE UNIQUE INDEX "matches_matchId_key" ON "matches"("matchId");

-- CreateIndex
CREATE INDEX "rosters_matchId_idx" ON "rosters"("matchId");

-- CreateIndex
CREATE INDEX "participants_matchId_idx" ON "participants"("matchId");

-- CreateIndex
CREATE INDEX "participants_rosterId_idx" ON "participants"("rosterId");

-- CreateIndex
CREATE UNIQUE INDEX "match_telemetry_matchId_key" ON "match_telemetry"("matchId");

-- AddForeignKey
ALTER TABLE "rosters" ADD CONSTRAINT "rosters_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "matches"("matchId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "participants" ADD CONSTRAINT "participants_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "matches"("matchId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "participants" ADD CONSTRAINT "participants_rosterId_fkey" FOREIGN KEY ("rosterId") REFERENCES "rosters"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "match_telemetry" ADD CONSTRAINT "match_telemetry_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "matches"("matchId") ON DELETE CASCADE ON UPDATE CASCADE;
