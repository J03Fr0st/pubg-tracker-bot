# Kill Feed Skill Comparison Design

## Goal

Replace the Elo rating system with inline skill comparison in the kill feed timeline. Show how good each victim/killer is using their match stats and cached season stats.

## Display Format

```
TIMELINE
`05:23` ⚔️ Killed PlayerX (AKM, 45m) — 3K / 450dmg / #12 | 1.8 K/D, 210 ADR
`08:12` ☠️ Killed by PlayerY (M416, 120m) — 8K / 920dmg / #2 | 4.2 K/D, 380 ADR
`12:45` 🔻 Knocked PlayerZ (SKS, 200m) — 1K / 180dmg / #35 | 0.9 K/D, 150 ADR
`14:02` 🔻 Knocked by PlayerW (Beryl, 30m) — 5K / 600dmg / #5
```

- Left of `|` = their stats from **this match** (kills, damage dealt, placement)
- Right of `|` = their **normal season stats** (K/D, ADR)
- If no season data available, the `| ...` part is simply omitted

## What Gets Removed

- `PlayerRating` Prisma model + migration
- `EloService` (`src/services/elo.service.ts`)
- `EloRepository` (`src/data/repositories/elo.repository.ts`)
- Elo bootstrap logic in `index.ts` / startup
- Elo badge rendering in timeline (`formatEloBadge`, `eloRatings` parameters)
- `eloRatings` field on `DiscordMatchGroupSummary`
- `formatPlayerTitle` Elo display logic

## Data Model

### New `PlayerSeasonCache` table

```prisma
model PlayerSeasonCache {
  id         String   @id @default(uuid())
  platform   String
  accountId  String
  seasonId   String
  gameMode   String   // e.g. "squad-fpp"
  kd         Float
  adr        Float
  cachedAt   DateTime @default(now())

  @@unique([platform, accountId, seasonId, gameMode])
  @@map("player_season_cache")
}
```

Cached per player per platform per season per game mode. Refreshed once per day (check `cachedAt`).

## Data Flow

### Match stats (kills, damage, placement)

Already available — all participants are in the match data. Look up each victim/killer's `accountId` in the match participants array to get their `stats.kills`, `stats.damageDealt`, `stats.winPlace`.

Need to pass participant stats map through to the timeline formatting.

### Season stats (K/D, ADR)

1. Collect all unique `accountId`s from kill/death/knock events
2. Check `PlayerSeasonCache` for each — if cached and `cachedAt` < 24h, use it
3. For cache misses, fetch from PUBG API: `GET /players/{accountId}/seasons/{currentSeasonId}`
4. Extract K/D and ADR from the response for the relevant game mode
5. Upsert into `PlayerSeasonCache`
6. Return combined stats for timeline rendering

### Current season ID

Fetch once on startup or cache: `GET /seasons` — find the one with `isCurrentSeason: true`.

## Integration Points

### `discord-bot.service.ts`

- Remove all `eloRatings` parameters from embed creation methods
- Remove `formatEloBadge` helper
- Simplify `formatPlayerTitle` to remove Elo display
- In `formatEnhancedTimeline`: accept participant stats map + season cache map, format inline stats

### `match-monitor.service.ts` / `pubg-storage.service.ts`

- Remove Elo processing calls
- Add season stats fetching for kill/death participants

### New service: `PlayerStatsService`

- `getSeasonStats(accountIds, platform, gameMode)`: batch lookup with cache
- `getCurrentSeasonId(platform)`: cached season ID lookup
- Depends on: PUBG API client, PlayerSeasonCache repository

### New repository: `PlayerSeasonCacheRepository`

- `findByAccountIds(accountIds, platform, seasonId, gameMode)`: batch lookup
- `upsertStats(data[])`: batch upsert

## API Calls

- One `GET /seasons` call on startup (cached)
- One `GET /players/{id}/seasons/{seasonId}` per unique player not in cache
- Typical match: 5-10 unique players in kill/death events = 5-10 API calls max on first encounter, 0 on subsequent matches with same players
