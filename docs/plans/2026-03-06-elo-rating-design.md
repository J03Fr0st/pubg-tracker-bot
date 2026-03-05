# Elo Rating System Design

## Goal

Add a persistent Elo rating for all match participants, displayed alongside tracked player names in Discord embeds.

## Data Model

### New `PlayerRating` table

Stores Elo ratings for every participant encountered in processed matches — not just tracked players. This gives meaningful ratings since players are compared against rated opponents.

```prisma
model PlayerRating {
  id         String   @id @default(uuid())
  platform   String                          // e.g. "steam"
  accountId  String                          // PUBG account ID
  modeKey    String                          // e.g. "squad-fpp"
  rating     Float    @default(1500)
  gamesPlayed Int     @default(0)
  lastSeenAt DateTime @default(now())

  @@unique([platform, accountId, modeKey])
  @@index([platform, accountId])
  @@map("player_ratings")
}
```

No separate history table. Keep it simple — the rating on the player is the source of truth.

## Elo Calculation

### Placement-only (phase 1)

No kill/damage bonuses initially. Combat bonuses can be layered on later once the pipeline is stable.

- **Actual score:** `1 - (placement - 1) / (totalTeams - 1)` — ranges from 1.0 (1st) to 0.0 (last)
- **Expected score:** Based on player's rating vs the match average rating, using standard Elo expectation: `1 / (1 + 10^((avgRating - playerRating) / 400))`
- **K-factor:** `gamesPlayed < 20 ? 40 : 20` — faster calibration for new players
- **Update:** `newRating = oldRating + K * (actualScore - expectedScore)`
- **Squad modes:** Use roster/team placement. All members of a roster get the same placement score.

### Mode separation

Ratings are tracked per mode key (e.g. `squad-fpp`, `duo-tpp`). A player's squad-fpp rating is independent of their solo rating.

## Integration into Existing Pipeline

The match monitor already polls tracked players, deduplicates match IDs, fetches match data once, and saves all participants. Elo calculation slots in after match saving:

1. Match is fetched from PUBG API (existing)
2. Match, Roster, Participant records saved to DB (existing)
3. **NEW:** Extract all participant accountIds from the match
4. **NEW:** Batch-fetch PlayerRatings: `WHERE accountId IN (...) AND modeKey = ?`
5. **NEW:** Missing players get default rating (1500, gamesPlayed=0)
6. **NEW:** Compute Elo deltas for all participants based on roster placement
7. **NEW:** Upsert all PlayerRatings in one DB transaction
8. Discord embeds include rating + change for tracked players only (existing embed creation, modified)

This adds one DB read and one DB write per match — no extra API calls.

## Bootstrap (Retroactive Calculation)

For initial deployment, seed ratings from recent matches:

1. For each tracked player, fetch recent match IDs from PUBG API (up to 20)
2. Sort all unique match IDs chronologically (oldest first)
3. Process each through the same Elo pipeline
4. Skip matches already in ProcessedMatch table

This runs once on startup or via a slash command. After that, the normal match monitor handles updates.

## Discord Display

### Player embed title

Before: `Player: j03fr0st`
After: `Player: j03fr0st [1523 ▲+14]`

- Show numeric rating in brackets
- Show change with directional arrow: `▲+14` (green context from embed) or `▼-8`
- Only displayed for tracked players (not all 100 participants)

### Match summary embed

No changes to the main match summary embed.

## New Service

### EloService (`src/services/elo.service.ts`)

```
- calculateExpectedScore(playerRating, avgRating): number
- calculateActualScore(placement, totalTeams): number
- calculateRatingChange(currentRating, gamesPlayed, placement, totalTeams, avgRating): { newRating, change }
- processMatchRatings(matchId, participants, rosters, platform, modeKey): Promise<Map<accountId, { rating, change }>>
- bootstrapRatings(): Promise<void>
```

Dependencies: PubgStorageService (for DB access), PubgApiService (for bootstrap only).

Injected into MatchMonitorService alongside existing services.

## New Repository

### EloRepository (`src/data/repositories/elo.repository.ts`)

```
- findRatingsByAccountIds(accountIds, platform, modeKey): Promise<PlayerRating[]>
- upsertRatings(ratings: PlayerRating[]): Promise<void>
- getPlayerRating(accountId, platform, modeKey): Promise<PlayerRating | null>
```

## Future Enhancements (not in scope)

- Kill/damage combat bonus on top of placement Elo
- Rank tier labels (Bronze, Silver, Gold, etc.)
- Leaderboard slash command
- Rating trend graphs
- Decay for inactive players
