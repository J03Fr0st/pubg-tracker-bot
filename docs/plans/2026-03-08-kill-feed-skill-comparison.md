# Kill Feed Skill Comparison Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the Elo rating system with inline victim/killer match stats and cached season stats in the kill feed timeline.

**Architecture:** Remove EloService/EloRepository/PlayerRating model entirely. Add a PlayerStatsService that fetches and caches normal season stats from the PUBG API. Pass participant match stats and cached season stats through to the timeline formatter in discord-bot.service.ts.

**Tech Stack:** TypeScript, Prisma (PostgreSQL), @j03fr0st/pubg-ts (PUBG API client), discord.js, Jest

---

### Task 1: Remove Elo System — Database Model

**Files:**
- Modify: `prisma/schema.prisma` (remove PlayerRating model, lines 115-127)
- Delete: `src/data/repositories/elo.repository.ts`
- Delete: `test/unit/repositories/elo.repository.test.ts`
- Delete: `src/services/elo.service.ts`
- Delete: `test/unit/services/elo.service.test.ts`

**Step 1: Remove PlayerRating model from Prisma schema**

In `prisma/schema.prisma`, delete the entire `PlayerRating` model block (lines 115-127):

```prisma
// DELETE THIS ENTIRE BLOCK:
model PlayerRating {
  id          String   @id @default(uuid())
  platform    String
  accountId   String
  modeKey     String
  rating      Float    @default(1500)
  gamesPlayed Int      @default(0)
  lastSeenAt  DateTime @default(now())

  @@unique([platform, accountId, modeKey])
  @@index([platform, accountId])
  @@map("player_ratings")
}
```

**Step 2: Delete Elo files**

```bash
rm src/data/repositories/elo.repository.ts
rm test/unit/repositories/elo.repository.test.ts
rm src/services/elo.service.ts
rm test/unit/services/elo.service.test.ts
```

**Step 3: Generate Prisma client and create migration**

```bash
npx prisma generate
npx prisma migrate dev --name remove-player-ratings
```

Expected: Migration created successfully, Prisma client regenerated without PlayerRating model.

**Step 4: Verify build compiles (it won't yet — that's fine)**

We'll fix the references in subsequent tasks.

**Step 5: Commit**

```bash
git add -A
git commit -m "refactor: remove Elo rating system (model, service, repository, tests)"
```

---

### Task 2: Add PlayerSeasonCache Model

**Files:**
- Modify: `prisma/schema.prisma`

**Step 1: Add PlayerSeasonCache model to schema**

Add this at the end of `prisma/schema.prisma`:

```prisma
model PlayerSeasonCache {
  id        String   @id @default(uuid())
  platform  String
  accountId String
  seasonId  String
  gameMode  String
  kd        Float
  adr       Float
  wins      Int      @default(0)
  games     Int      @default(0)
  cachedAt  DateTime @default(now())

  @@unique([platform, accountId, seasonId, gameMode])
  @@index([platform, accountId])
  @@map("player_season_cache")
}
```

**Step 2: Generate Prisma client and create migration**

```bash
npx prisma generate
npx prisma migrate dev --name add-player-season-cache
```

Expected: Migration created, new table `player_season_cache` added.

**Step 3: Commit**

```bash
git add -A
git commit -m "feat: add PlayerSeasonCache model for season stats caching"
```

---

### Task 3: Create PlayerSeasonCacheRepository

**Files:**
- Create: `src/data/repositories/season-cache.repository.ts`
- Create: `test/unit/repositories/season-cache.repository.test.ts`

**Step 1: Write the failing test**

Create `test/unit/repositories/season-cache.repository.test.ts`:

```typescript
import { SeasonCacheRepository } from '../../../src/data/repositories/season-cache.repository';

jest.mock('../../../src/data/prisma.client', () => ({
  __esModule: true,
  default: {
    playerSeasonCache: {
      findMany: jest.fn(),
      upsert: jest.fn(),
    },
    $transaction: jest.fn((fn: any) => fn({
      playerSeasonCache: {
        upsert: jest.fn(),
      },
    })),
  },
}));

import prisma from '../../../src/data/prisma.client';

describe('SeasonCacheRepository', () => {
  let repo: SeasonCacheRepository;

  beforeEach(() => {
    repo = new SeasonCacheRepository();
    jest.clearAllMocks();
  });

  describe('findByAccountIds', () => {
    it('queries for matching records by accountIds, platform, seasonId, and gameMode', async () => {
      const mockResults = [
        {
          id: '1',
          platform: 'steam',
          accountId: 'acc-1',
          seasonId: 'season-1',
          gameMode: 'squad-fpp',
          kd: 2.5,
          adr: 300,
          wins: 10,
          games: 50,
          cachedAt: new Date(),
        },
      ];
      (prisma.playerSeasonCache.findMany as jest.Mock).mockResolvedValue(mockResults);

      const results = await repo.findByAccountIds(
        ['acc-1', 'acc-2'],
        'steam',
        'season-1',
        'squad-fpp'
      );

      expect(prisma.playerSeasonCache.findMany).toHaveBeenCalledWith({
        where: {
          accountId: { in: ['acc-1', 'acc-2'] },
          platform: 'steam',
          seasonId: 'season-1',
          gameMode: 'squad-fpp',
        },
      });
      expect(results).toEqual(mockResults);
    });
  });

  describe('upsertStats', () => {
    it('upserts each stat entry in a transaction', async () => {
      const mockUpsert = jest.fn();
      (prisma.$transaction as jest.Mock).mockImplementation((fn: any) =>
        fn({ playerSeasonCache: { upsert: mockUpsert } })
      );

      await repo.upsertStats([
        {
          platform: 'steam',
          accountId: 'acc-1',
          seasonId: 'season-1',
          gameMode: 'squad-fpp',
          kd: 2.5,
          adr: 300,
          wins: 10,
          games: 50,
        },
      ]);

      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      expect(mockUpsert).toHaveBeenCalledTimes(1);
      expect(mockUpsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            platform_accountId_seasonId_gameMode: {
              platform: 'steam',
              accountId: 'acc-1',
              seasonId: 'season-1',
              gameMode: 'squad-fpp',
            },
          },
        })
      );
    });
  });
});
```

**Step 2: Run test to verify it fails**

```bash
npx jest test/unit/repositories/season-cache.repository.test.ts --no-coverage
```

Expected: FAIL — cannot find module `season-cache.repository`

**Step 3: Write the implementation**

Create `src/data/repositories/season-cache.repository.ts`:

```typescript
import prisma from '../prisma.client';

export interface UpsertSeasonCacheData {
  platform: string;
  accountId: string;
  seasonId: string;
  gameMode: string;
  kd: number;
  adr: number;
  wins: number;
  games: number;
}

export class SeasonCacheRepository {
  public async findByAccountIds(
    accountIds: string[],
    platform: string,
    seasonId: string,
    gameMode: string
  ) {
    return prisma.playerSeasonCache.findMany({
      where: {
        accountId: { in: accountIds },
        platform,
        seasonId,
        gameMode,
      },
    });
  }

  public async upsertStats(stats: UpsertSeasonCacheData[]): Promise<void> {
    await prisma.$transaction(async (tx) => {
      for (const s of stats) {
        await tx.playerSeasonCache.upsert({
          where: {
            platform_accountId_seasonId_gameMode: {
              platform: s.platform,
              accountId: s.accountId,
              seasonId: s.seasonId,
              gameMode: s.gameMode,
            },
          },
          update: {
            kd: s.kd,
            adr: s.adr,
            wins: s.wins,
            games: s.games,
            cachedAt: new Date(),
          },
          create: {
            platform: s.platform,
            accountId: s.accountId,
            seasonId: s.seasonId,
            gameMode: s.gameMode,
            kd: s.kd,
            adr: s.adr,
            wins: s.wins,
            games: s.games,
          },
        });
      }
    });
  }
}
```

**Step 4: Run test to verify it passes**

```bash
npx jest test/unit/repositories/season-cache.repository.test.ts --no-coverage
```

Expected: PASS

**Step 5: Commit**

```bash
git add src/data/repositories/season-cache.repository.ts test/unit/repositories/season-cache.repository.test.ts
git commit -m "feat: add SeasonCacheRepository for player season stats caching"
```

---

### Task 4: Create PlayerStatsService

**Files:**
- Create: `src/services/player-stats.service.ts`
- Create: `test/unit/services/player-stats.service.test.ts`

**Step 1: Write the failing test**

Create `test/unit/services/player-stats.service.test.ts`:

```typescript
import { PlayerStatsService } from '../../../src/services/player-stats.service';
import { SeasonCacheRepository } from '../../../src/data/repositories/season-cache.repository';
import type { PubgClient } from '@j03fr0st/pubg-ts';

jest.mock('../../../src/data/repositories/season-cache.repository');

describe('PlayerStatsService', () => {
  let service: PlayerStatsService;
  let mockRepo: jest.Mocked<SeasonCacheRepository>;
  let mockPubgClient: any;

  beforeEach(() => {
    mockRepo = new SeasonCacheRepository() as jest.Mocked<SeasonCacheRepository>;
    mockRepo.findByAccountIds = jest.fn().mockResolvedValue([]);
    mockRepo.upsertStats = jest.fn().mockResolvedValue(undefined);

    mockPubgClient = {
      seasons: {
        getCurrentSeason: jest.fn().mockResolvedValue({
          data: [{ id: 'division.bro.official.pc-2018-28', attributes: { isCurrentSeason: true } }],
        }),
      },
      players: {
        getPlayerSeasonStats: jest.fn(),
      },
    };

    service = new PlayerStatsService(mockPubgClient as PubgClient, 'steam', mockRepo);
  });

  describe('getSeasonStats', () => {
    it('returns cached stats when cache is fresh (< 24h)', async () => {
      const freshCache = {
        id: '1',
        platform: 'steam',
        accountId: 'acc-1',
        seasonId: 'division.bro.official.pc-2018-28',
        gameMode: 'squad-fpp',
        kd: 2.5,
        adr: 300,
        wins: 10,
        games: 50,
        cachedAt: new Date(), // fresh
      };
      mockRepo.findByAccountIds.mockResolvedValue([freshCache]);

      const results = await service.getSeasonStats(['acc-1'], 'squad-fpp');

      expect(results.get('acc-1')).toEqual({ kd: 2.5, adr: 300 });
      expect(mockPubgClient.players.getPlayerSeasonStats).not.toHaveBeenCalled();
    });

    it('fetches from API when cache is stale (> 24h)', async () => {
      const staleCache = {
        id: '1',
        platform: 'steam',
        accountId: 'acc-1',
        seasonId: 'division.bro.official.pc-2018-28',
        gameMode: 'squad-fpp',
        kd: 1.0,
        adr: 200,
        wins: 5,
        games: 25,
        cachedAt: new Date(Date.now() - 25 * 60 * 60 * 1000), // 25 hours ago
      };
      mockRepo.findByAccountIds.mockResolvedValue([staleCache]);

      mockPubgClient.players.getPlayerSeasonStats.mockResolvedValue({
        data: {
          attributes: {
            gameModeStats: {
              'squad-fpp': {
                kills: 100,
                losses: 40,
                roundsPlayed: 50,
                damageDealt: 15000,
                wins: 10,
              },
            },
          },
        },
      });

      const results = await service.getSeasonStats(['acc-1'], 'squad-fpp');

      expect(results.get('acc-1')).toEqual({ kd: 2.5, adr: 300 });
      expect(mockPubgClient.players.getPlayerSeasonStats).toHaveBeenCalled();
      expect(mockRepo.upsertStats).toHaveBeenCalled();
    });

    it('fetches from API when no cache exists', async () => {
      mockRepo.findByAccountIds.mockResolvedValue([]);

      mockPubgClient.players.getPlayerSeasonStats.mockResolvedValue({
        data: {
          attributes: {
            gameModeStats: {
              'squad-fpp': {
                kills: 50,
                losses: 20,
                roundsPlayed: 25,
                damageDealt: 5000,
                wins: 5,
              },
            },
          },
        },
      });

      const results = await service.getSeasonStats(['acc-1'], 'squad-fpp');

      expect(results.get('acc-1')).toEqual({ kd: 2.5, adr: 200 });
      expect(mockPubgClient.players.getPlayerSeasonStats).toHaveBeenCalledWith({
        playerId: 'acc-1',
        seasonId: 'division.bro.official.pc-2018-28',
      });
    });

    it('skips players whose API call fails', async () => {
      mockRepo.findByAccountIds.mockResolvedValue([]);

      mockPubgClient.players.getPlayerSeasonStats.mockRejectedValue(new Error('API error'));

      const results = await service.getSeasonStats(['acc-1'], 'squad-fpp');

      expect(results.size).toBe(0);
    });

    it('returns empty map for empty accountIds', async () => {
      const results = await service.getSeasonStats([], 'squad-fpp');
      expect(results.size).toBe(0);
    });
  });
});
```

**Step 2: Run test to verify it fails**

```bash
npx jest test/unit/services/player-stats.service.test.ts --no-coverage
```

Expected: FAIL — cannot find module `player-stats.service`

**Step 3: Write the implementation**

Create `src/services/player-stats.service.ts`:

```typescript
import type { PubgClient } from '@j03fr0st/pubg-ts';
import {
  SeasonCacheRepository,
  type UpsertSeasonCacheData,
} from '../data/repositories/season-cache.repository';
import { debug, warn } from '../utils/logger';

export interface SeasonStatsResult {
  kd: number;
  adr: number;
}

const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

export class PlayerStatsService {
  private readonly repository: SeasonCacheRepository;
  private readonly pubgClient: PubgClient;
  private readonly platform: string;
  private currentSeasonId: string | null = null;

  constructor(
    pubgClient: PubgClient,
    platform: string,
    repository?: SeasonCacheRepository
  ) {
    this.pubgClient = pubgClient;
    this.platform = platform;
    this.repository = repository ?? new SeasonCacheRepository();
  }

  private async ensureSeasonId(): Promise<string> {
    if (this.currentSeasonId) return this.currentSeasonId;

    const response = await this.pubgClient.seasons.getCurrentSeason();
    this.currentSeasonId = response.data[0].id;
    debug(`Current season ID: ${this.currentSeasonId}`);
    return this.currentSeasonId;
  }

  public async getSeasonStats(
    accountIds: string[],
    gameMode: string
  ): Promise<Map<string, SeasonStatsResult>> {
    const results = new Map<string, SeasonStatsResult>();
    if (accountIds.length === 0) return results;

    const seasonId = await this.ensureSeasonId();
    const now = Date.now();

    // Check cache
    const cached = await this.repository.findByAccountIds(
      accountIds,
      this.platform,
      seasonId,
      gameMode
    );

    const freshIds = new Set<string>();
    for (const entry of cached) {
      const age = now - new Date(entry.cachedAt).getTime();
      if (age < CACHE_TTL_MS) {
        results.set(entry.accountId, { kd: entry.kd, adr: entry.adr });
        freshIds.add(entry.accountId);
      }
    }

    // Fetch missing/stale from API
    const toFetch = accountIds.filter((id) => !freshIds.has(id));
    if (toFetch.length === 0) return results;

    debug(`Fetching season stats for ${toFetch.length} players from API`);
    const upserts: UpsertSeasonCacheData[] = [];

    for (const accountId of toFetch) {
      try {
        const response = await this.pubgClient.players.getPlayerSeasonStats({
          playerId: accountId,
          seasonId,
        });

        const modeStats = response.data.attributes?.gameModeStats?.[gameMode];
        if (!modeStats) continue;

        const deaths = modeStats.losses ?? 0;
        const kd = deaths > 0 ? modeStats.kills / deaths : modeStats.kills;
        const roundsPlayed = modeStats.roundsPlayed ?? 0;
        const adr = roundsPlayed > 0 ? modeStats.damageDealt / roundsPlayed : 0;

        const rounded = {
          kd: Math.round(kd * 100) / 100,
          adr: Math.round(adr),
        };

        results.set(accountId, rounded);
        upserts.push({
          platform: this.platform,
          accountId,
          seasonId,
          gameMode,
          kd: rounded.kd,
          adr: rounded.adr,
          wins: modeStats.wins ?? 0,
          games: roundsPlayed,
        });
      } catch (err) {
        warn(`Failed to fetch season stats for ${accountId}: ${err}`);
      }
    }

    // Cache results
    if (upserts.length > 0) {
      this.repository.upsertStats(upserts).catch((err) =>
        warn(`Failed to cache season stats: ${err}`)
      );
    }

    return results;
  }
}
```

**Step 4: Run test to verify it passes**

```bash
npx jest test/unit/services/player-stats.service.test.ts --no-coverage
```

Expected: PASS

**Step 5: Commit**

```bash
git add src/services/player-stats.service.ts test/unit/services/player-stats.service.test.ts
git commit -m "feat: add PlayerStatsService for season stats with DB caching"
```

---

### Task 5: Remove Elo from MatchMonitorService

**Files:**
- Modify: `src/services/match-monitor.service.ts`
- Modify: `src/index.ts`

**Step 1: Remove Elo imports and usage from match-monitor.service.ts**

In `src/services/match-monitor.service.ts`:

1. Remove the import: `import { EloService, type RosterData } from './elo.service';`
2. Remove `private readonly eloService: EloService;` from the class
3. Remove `this.eloService = new EloService();` from the constructor
4. Remove the entire `bootstrapEloRatings()` method (lines 55-67)
5. Remove the entire `processMatchElo()` method (lines 291-319)
6. In the match processing loop (around line 253), remove the Elo processing block:
   ```typescript
   // DELETE THIS BLOCK:
   try {
     const eloRatings = await this.processMatchElo(match.matchId, summary.gameMode);
     if (eloRatings) {
       summary.eloRatings = eloRatings;
     }
   } catch (eloErr) {
     warn(`Failed to process Elo ratings for match ${match.matchId}: ${eloErr}`);
   }
   ```

**Step 2: Remove Elo bootstrap from index.ts**

In `src/index.ts`, remove line 43:
```typescript
await matchMonitor.bootstrapEloRatings();
```

**Step 3: Verify TypeScript compiles (may still have errors in discord-bot.service.ts — that's expected)**

```bash
npx tsc --noEmit 2>&1 | head -20
```

**Step 4: Commit**

```bash
git add src/services/match-monitor.service.ts src/index.ts
git commit -m "refactor: remove Elo processing from match monitor and startup"
```

---

### Task 6: Remove Elo from PubgStorageService

**Files:**
- Modify: `src/services/pubg-storage.service.ts`

**Step 1: Remove Elo imports and methods**

In `src/services/pubg-storage.service.ts`:

1. Remove the import: `import { EloRepository } from '../data/repositories/elo.repository';`
2. Remove the property: `private eloRepository = new EloRepository();`
3. Remove the entire `#region Elo` section (lines 73-79):
   ```typescript
   //#region Elo
   public async getPlayerRatings(accountIds: string[], platform: string, modeKey: string) {
     return this.eloRepository.findRatingsByAccountIds(accountIds, platform, modeKey);
   }
   //#endregion
   ```

**Step 2: Commit**

```bash
git add src/services/pubg-storage.service.ts
git commit -m "refactor: remove Elo references from PubgStorageService"
```

---

### Task 7: Remove Elo from Discord Types

**Files:**
- Modify: `src/types/discord-match-summary.types.ts`

**Step 1: Remove eloRatings from DiscordMatchGroupSummary**

In `src/types/discord-match-summary.types.ts`, remove line 38:
```typescript
eloRatings?: Map<string, { rating: number; change: number }>;
```

**Step 2: Commit**

```bash
git add src/types/discord-match-summary.types.ts
git commit -m "refactor: remove eloRatings from DiscordMatchGroupSummary type"
```

---

### Task 8: Update Discord Bot — Remove Elo, Add Match Stats to Timeline

This is the largest task. It modifies `src/services/discord-bot.service.ts` to:
1. Remove all `eloRatings` parameters and `formatEloBadge`
2. Pass participant match stats into the timeline
3. Integrate season stats into the timeline

**Files:**
- Modify: `src/services/discord-bot.service.ts`

**Step 1: Remove eloRatings parameter from all embed methods**

Remove the `eloRatings` parameter from these methods and all calls to them:
- `formatPlayerTitle` — remove `eloRatings` param, simplify to just return `Player: ${player.name}`
- `createBasicPlayerEmbeds` — remove `eloRatings` param
- `createBasicPlayerEmbed` — remove `eloRatings` param
- `createEnhancedPlayerEmbed` — remove `eloRatings` param
- `formatEnhancedStats` — remove `eloRatings` param
- `formatEnhancedTimeline` — remove `eloRatings` param, remove `formatEloBadge` helper

Update all call sites to remove the `eloRatings` argument (in `createMatchSummaryEmbeds` and `createMatchSummaryFromMatchDetails`).

**Step 2: Add participant stats map to timeline**

The `formatEnhancedTimeline` method needs access to all participants' match stats. Modify:

1. Add a new type for participant match stats lookup:

```typescript
// Add near top of file or in types file
interface ParticipantMatchStats {
  kills: number;
  damageDealt: number;
  winPlace: number;
}
```

2. Modify `createMatchSummaryEmbeds` to build a participant stats map from the stored match data:

In the method, after fetching match analysis, build the map:
```typescript
// Build participant stats map from DB
const matchData = await this.pubgStorageService.getMatch(matchId);
const participantStatsMap = new Map<string, ParticipantMatchStats>();
if (matchData?.participants) {
  for (const p of matchData.participants) {
    participantStatsMap.set(p.pubgId, {
      kills: p.kills,
      damageDealt: p.damageDealt,
      winPlace: p.winPlace,
    });
  }
}
```

3. Pass `participantStatsMap` through to `formatEnhancedTimeline`.

4. Update `formatEnhancedTimeline` signature:
```typescript
private formatEnhancedTimeline(
  analysis: PlayerAnalysis,
  participantStats: Map<string, ParticipantMatchStats>,
  seasonStats?: Map<string, { kd: number; adr: number }>
): string
```

5. In each timeline event, append the stats inline. For kills:
```typescript
// After the weapon/distance part, add:
const victimAccountId = kill.victim?.accountId;
const matchStats = victimAccountId ? participantStats.get(victimAccountId) : undefined;
const seasonData = victimAccountId && seasonStats ? seasonStats.get(victimAccountId) : undefined;

let statsStr = '';
if (matchStats) {
  statsStr = ` — ${matchStats.kills}K / ${Math.round(matchStats.damageDealt)}dmg / #${matchStats.winPlace}`;
  if (seasonData) {
    statsStr += ` | ${seasonData.kd} K/D, ${seasonData.adr} ADR`;
  }
}
return `\`${matchTime}\` ⚔️ Killed [${safeVictimName}](https://pubg.op.gg/user/${encodeURIComponent(victimName)}) (${weapon}, ${distance}m)${statsStr}`;
```

Apply similar pattern for deaths (using killer's accountId), knockdowns, and knocked events.

**Step 3: Integrate PlayerStatsService**

1. Add `PlayerStatsService` as a dependency of `DiscordBotService`. Initialize it in the constructor:
```typescript
private readonly playerStatsService: PlayerStatsService;

// In constructor:
this.playerStatsService = new PlayerStatsService(this.pubgClient, shard);
```

2. Import it: `import { PlayerStatsService } from './player-stats.service';`

3. In `createMatchSummaryEmbeds`, after building `participantStatsMap`, collect all unique accountIds from kill/death/knock events and fetch season stats:

```typescript
// Collect unique accountIds from kill/death events
const relevantAccountIds = new Set<string>();
for (const player of players) {
  const analysis = matchAnalysis.playerAnalyses.get(player.name);
  if (!analysis) continue;
  for (const k of analysis.killEvents) {
    if (k.victim?.accountId) relevantAccountIds.add(k.victim.accountId);
  }
  for (const k of analysis.deathEvents) {
    if (k.killer?.accountId) relevantAccountIds.add(k.killer.accountId);
  }
  for (const k of analysis.knockdownEvents) {
    if (k.victim?.accountId) relevantAccountIds.add(k.victim.accountId);
  }
  for (const k of analysis.knockedDownEvents) {
    if (k.attacker?.accountId) relevantAccountIds.add(k.attacker.accountId);
  }
}

let seasonStats: Map<string, { kd: number; adr: number }> | undefined;
if (relevantAccountIds.size > 0) {
  try {
    seasonStats = await this.playerStatsService.getSeasonStats(
      Array.from(relevantAccountIds),
      summary.gameMode
    );
  } catch (err) {
    debug(`Failed to fetch season stats: ${err}`);
  }
}
```

4. Pass both `participantStatsMap` and `seasonStats` through to `formatEnhancedTimeline`.

**Step 4: Update method signatures through the call chain**

Update `createEnhancedPlayerEmbed` and `formatEnhancedStats` to accept and pass through `participantStats` and `seasonStats`:

```typescript
private createEnhancedPlayerEmbed(
  player: DiscordPlayerMatchStats,
  analysis: PlayerAnalysis,
  matchColor: number,
  matchId: string,
  participantStats: Map<string, ParticipantMatchStats>,
  seasonStats?: Map<string, { kd: number; adr: number }>
): EmbedBuilder

private formatEnhancedStats(
  player: DiscordPlayerMatchStats,
  analysis: PlayerAnalysis,
  matchId: string,
  participantStats: Map<string, ParticipantMatchStats>,
  seasonStats?: Map<string, { kd: number; adr: number }>
): string
```

**Step 5: Simplify formatPlayerTitle**

```typescript
private formatPlayerTitle(player: DiscordPlayerMatchStats): string {
  return `Player: ${player.name}`;
}
```

Update all calls to `formatPlayerTitle` to remove the second argument.

**Step 6: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: No errors.

**Step 7: Run all tests**

```bash
npx jest --no-coverage
```

Expected: All tests pass (Elo tests are already deleted).

**Step 8: Commit**

```bash
git add src/services/discord-bot.service.ts
git commit -m "feat: replace Elo badges with inline match + season stats in kill feed"
```

---

### Task 9: Update createMatchSummaryFromMatchDetails (slash command path)

The `/match` slash command also creates embeds via `createMatchSummaryFromMatchDetails`. This path also needs the participant stats and season stats passed through.

**Files:**
- Modify: `src/services/discord-bot.service.ts`

**Step 1: Update the slash command path**

In `createMatchSummaryFromMatchDetails`, the method returns a `DiscordMatchGroupSummary`. The embed creation in the slash command handler already calls `createMatchSummaryEmbeds`, which now handles the stats lookup. Verify this path works by checking that `createMatchSummaryEmbeds` handles the `matchId` lookup internally (it already fetches `matchData` from storage).

No code changes needed if `createMatchSummaryEmbeds` is self-contained for stats lookup. Verify by reading the flow.

**Step 2: Verify by running typecheck**

```bash
npx tsc --noEmit
```

**Step 3: Commit (if changes were needed)**

---

### Task 10: Final Verification and Cleanup

**Step 1: Run full test suite**

```bash
npx jest --no-coverage
```

Expected: All tests pass.

**Step 2: Run typecheck**

```bash
npx tsc --noEmit
```

Expected: No errors.

**Step 3: Run linter**

```bash
npm run format
```

**Step 4: Verify no remaining Elo references**

Search for any remaining references to Elo in the codebase:

```bash
grep -ri "elo" src/ --include="*.ts" | grep -v node_modules | grep -v ".d.ts"
```

Expected: No results (or only false positives like "below", "hello", etc.)

**Step 5: Final commit if any cleanup needed**

```bash
git add -A
git commit -m "chore: final cleanup after Elo removal and kill feed stats integration"
```
