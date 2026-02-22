# Design: PostgreSQL Migration + Telemetry Storage

**Date:** 2026-02-22
**Status:** Approved
**Scope:** Replace MongoDB/Mongoose with PostgreSQL/Prisma; store match API data and telemetry (raw events + derived analysis) in the database.

---

## Context

The app currently uses MongoDB via Mongoose with three collections:
- `players` — tracked PUBG players
- `processed_matches` — IDs of matches already posted to Discord (deduplication)
- `matches` — match API schema exists but is not actively written to

Telemetry data is fetched live from the PUBG telemetry URL on every Discord post and is never persisted. This design replaces MongoDB entirely with PostgreSQL, adds full match persistence, and caches telemetry to avoid repeated HTTP fetches.

---

## Decisions

| Question | Decision |
|---|---|
| What to store | Match API data + raw telemetry events + derived PlayerAnalysis |
| ORM | Prisma (schema-first, type-safe, best-in-class migrations) |
| Raw telemetry storage | JSONB column (flexible, no row-per-event overhead) |
| Existing MongoDB data | Discard — start fresh |
| Migration approach | Full rip-and-replace (clean cut, no legacy code) |

---

## Database Schema

Five tables managed by Prisma:

### `players`
| Column | Type | Notes |
|---|---|---|
| id | String (UUID) | PK |
| pubgId | String | Unique |
| name | String | Unique |
| shardId | String | |
| patchVersion | String | |
| titleId | String | |
| lastMatchAt | DateTime? | |
| createdAt | DateTime | auto |
| updatedAt | DateTime | auto |

### `processed_matches`
| Column | Type | Notes |
|---|---|---|
| id | String (UUID) | PK |
| matchId | String | Unique |
| processedAt | DateTime | auto |

### `matches`
| Column | Type | Notes |
|---|---|---|
| id | String (UUID) | PK |
| matchId | String | Unique |
| gameMode | String | |
| mapName | String | |
| duration | Int | seconds |
| isCustomMatch | Boolean | |
| seasonState | String | |
| shardId | String | |
| telemetryUrl | String | |
| playedAt | DateTime | from API `createdAt` |
| createdAt | DateTime | auto |

### `participants`
One row per player per match. Typed columns for all stats.

| Column | Type |
|---|---|
| id | String (UUID) PK |
| matchId | String → matches.matchId |
| rosterId | String → rosters.id |
| pubgId | String |
| name | String |
| kills | Int |
| DBNOs | Int |
| damageDealt | Float |
| headshotKills | Int |
| assists | Int |
| revives | Int |
| timeSurvived | Float |
| walkDistance | Float |
| longestKill | Float |
| winPlace | Int |
| killPlace | Int |
| killStreaks | Int |
| boosts | Int |
| heals | Int |
| rideDistance | Float |
| swimDistance | Float |
| roadKills | Int |
| teamKills | Int |
| vehicleDestroys | Int |
| weaponsAcquired | Int |
| deathType | String |

### `rosters`
| Column | Type | Notes |
|---|---|---|
| id | String (UUID) | PK |
| matchId | String | → matches.matchId |
| rank | Int | |
| won | Boolean | |

### `match_telemetry`
Optional 1-to-1 with `matches`. Telemetry processing can fail without blocking match storage.

| Column | Type | Notes |
|---|---|---|
| id | String (UUID) | PK |
| matchId | String | Unique → matches.matchId |
| rawEvents | Json | JSONB: full `TelemetryEvent[]` array |
| playerAnalyses | Json | JSONB: `Record<playerName, PlayerAnalysis>` |
| processedAt | DateTime | auto |

---

## Application Layer Changes

### Removed
- `src/data/models/player.model.ts`
- `src/data/models/match.model.ts`
- `src/data/models/processed-match.model.ts`
- `src/data/repositories/player.repository.ts` (rewritten)
- `src/data/repositories/processed-match.repository.ts` (rewritten)
- Mongoose connection in `src/index.ts`
- `mongoose` npm package
- `MONGODB_URI` environment variable

### Added
- `prisma/schema.prisma` — single source of truth for schema
- `src/data/prisma.client.ts` — shared Prisma client singleton
- `src/data/repositories/player.repository.ts` — rewritten with Prisma
- `src/data/repositories/processed-match.repository.ts` — rewritten with Prisma
- `src/data/repositories/match.repository.ts` — new, saves match + participants + rosters
- `src/data/repositories/telemetry.repository.ts` — new, saves/retrieves raw events and player analyses
- `DATABASE_URL` environment variable

### Unchanged
- `PubgStorageService` public interface — same existing methods, plus two new: `saveMatch()` and `saveTelemetry()`
- `MatchMonitorService`, `TelemetryProcessorService` — no changes
- `DiscordBotService` — minor addition: check telemetry cache before HTTP fetch

---

## Data Flow

### Match monitoring (updated)
```
MatchMonitorService polls PUBG API
  → New match found for tracked player
  → Fetch full match details from PUBG API
  → Save match + participants + rosters to DB
  → Mark match as processed
  → Trigger Discord notification

DiscordBotService.sendMatchSummary()
  → Check match_telemetry for cached playerAnalyses
  → [HIT]  Use cached PlayerAnalysis → build embeds
  → [MISS] Fetch raw telemetry from telemetryUrl (HTTP)
           → TelemetryProcessorService.processMatchTelemetry()
           → Save rawEvents + playerAnalyses to match_telemetry
           → Build embeds from fresh analysis
```

### /process-match command (updated)
```
User runs /process-match <matchId>
  → Check matches table for existing record
  → [EXISTS] Load participants from DB (no PUBG API call)
  → [MISSING] Fetch from PUBG API → save to DB → continue
  → Follow same telemetry cache path above
```

### Error handling
- Match save failure → log error, Discord post still sent
- Telemetry save failure → log error, embed still sent (analysis already computed)
- Telemetry fetch failure → fallback to basic embeds (existing behaviour preserved)

---

## Environment

```bash
# Remove
MONGODB_URI=...

# Add
DATABASE_URL=postgresql://user:password@host:5432/pubg_tracker
```

`docker-compose.yml`: replace MongoDB service with PostgreSQL service.

---

## Testing

- **Unit tests** — Telemetry processor tests unchanged (no DB dependency)
- **Repository tests** — Use real PostgreSQL test DB (Docker in CI); avoid mocking Prisma
- **Integration tests** — Updated to PostgreSQL; DB seeded and torn down per suite
- **New integration tests:**
  - Match + telemetry save → Discord embed uses cached analysis (no HTTP call)
  - `/process-match` command loads match from DB cache

**CI:** Add PostgreSQL service to GitHub Actions workflow. Docker image build unchanged.

---

## Migration Path

1. Install Prisma, remove Mongoose
2. Write `prisma/schema.prisma`
3. Run `prisma migrate dev` to generate initial migration
4. Implement Prisma client singleton
5. Rewrite repositories (player, processed-match) + add new ones (match, telemetry)
6. Extend `PubgStorageService` with `saveMatch()` and `saveTelemetry()`
7. Wire `saveMatch()` into `MatchMonitorService`
8. Wire telemetry cache check into `DiscordBotService`
9. Update `docker-compose.yml` and env config
10. Update tests
