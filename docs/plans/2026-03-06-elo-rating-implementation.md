# Elo Rating System Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a persistent placement-based Elo rating for all match participants, tracked per game mode, and display rating + change in Discord embeds for tracked players.

**Architecture:** New `PlayerRating` Prisma model stores ratings for every participant encountered. An `EloService` computes placement-based Elo deltas per match. The service integrates into the existing `MatchMonitorService` pipeline after match saving. Ratings are passed through to `DiscordBotService` embed creation via the existing `DiscordMatchGroupSummary` type.

**Tech Stack:** TypeScript, Prisma (PostgreSQL), Discord.js, Jest

---

### Task 1: Add PlayerRating model to Prisma schema

**Files:**
- Modify: `prisma/schema.prisma` (append after `MatchTelemetry` model, line ~113)

**Step 1: Add the PlayerRating model to the schema**

Add this model at the end of `prisma/schema.prisma`:

```prisma
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

**Step 2: Generate Prisma client**

Run: `npx prisma generate`
Expected: "Generated Prisma Client" success message

**Step 3: Create migration**

Run: `npx prisma migrate dev --name add-player-rating`
Expected: Migration created and applied successfully

**Step 4: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/
git commit -m "feat: add PlayerRating model to Prisma schema"
```

---

### Task 2: Create EloRepository

**Files:**
- Create: `src/data/repositories/elo.repository.ts`
- Create: `test/unit/repositories/elo.repository.test.ts`

**Step 1: Write the failing tests**

Create `test/unit/repositories/elo.repository.test.ts`:

```typescript
import { EloRepository } from '../../../src/data/repositories/elo.repository';
import prisma from '../../../src/data/prisma.client';

jest.mock('../../../src/data/prisma.client', () => ({
  __esModule: true,
  default: {
    playerRating: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      upsert: jest.fn(),
    },
    $transaction: jest.fn((fn: any) => fn({
      playerRating: {
        upsert: jest.fn(),
      },
    })),
  },
}));

const mockPrisma = prisma as jest.Mocked<typeof prisma>;

describe('EloRepository', () => {
  const repo = new EloRepository();

  beforeEach(() => jest.clearAllMocks());

  describe('findRatingsByAccountIds', () => {
    it('returns ratings for given account IDs, platform, and modeKey', async () => {
      const mockRatings = [
        { id: '1', platform: 'steam', accountId: 'acc-1', modeKey: 'squad-fpp', rating: 1500, gamesPlayed: 5, lastSeenAt: new Date() },
        { id: '2', platform: 'steam', accountId: 'acc-2', modeKey: 'squad-fpp', rating: 1600, gamesPlayed: 10, lastSeenAt: new Date() },
      ];
      (mockPrisma.playerRating.findMany as jest.Mock).mockResolvedValue(mockRatings);

      const result = await repo.findRatingsByAccountIds(['acc-1', 'acc-2'], 'steam', 'squad-fpp');

      expect(mockPrisma.playerRating.findMany).toHaveBeenCalledWith({
        where: {
          accountId: { in: ['acc-1', 'acc-2'] },
          platform: 'steam',
          modeKey: 'squad-fpp',
        },
      });
      expect(result).toHaveLength(2);
    });

    it('returns empty array when no ratings found', async () => {
      (mockPrisma.playerRating.findMany as jest.Mock).mockResolvedValue([]);

      const result = await repo.findRatingsByAccountIds(['unknown'], 'steam', 'squad-fpp');

      expect(result).toHaveLength(0);
    });
  });

  describe('upsertRatings', () => {
    it('upserts multiple ratings in a transaction', async () => {
      const mockUpsert = jest.fn();
      (mockPrisma.$transaction as jest.Mock).mockImplementation(async (fn: any) => {
        await fn({ playerRating: { upsert: mockUpsert } });
      });

      const ratings = [
        { platform: 'steam', accountId: 'acc-1', modeKey: 'squad-fpp', rating: 1520, gamesPlayed: 6 },
        { platform: 'steam', accountId: 'acc-2', modeKey: 'squad-fpp', rating: 1480, gamesPlayed: 11 },
      ];

      await repo.upsertRatings(ratings);

      expect(mockPrisma.$transaction).toHaveBeenCalled();
      expect(mockUpsert).toHaveBeenCalledTimes(2);
    });
  });

  describe('getPlayerRating', () => {
    it('returns a single player rating', async () => {
      const mockRating = { id: '1', platform: 'steam', accountId: 'acc-1', modeKey: 'squad-fpp', rating: 1500, gamesPlayed: 5, lastSeenAt: new Date() };
      (mockPrisma.playerRating.findFirst as jest.Mock).mockResolvedValue(mockRating);

      const result = await repo.getPlayerRating('acc-1', 'steam', 'squad-fpp');

      expect(mockPrisma.playerRating.findFirst).toHaveBeenCalledWith({
        where: { accountId: 'acc-1', platform: 'steam', modeKey: 'squad-fpp' },
      });
      expect(result?.rating).toBe(1500);
    });

    it('returns null when no rating found', async () => {
      (mockPrisma.playerRating.findFirst as jest.Mock).mockResolvedValue(null);

      const result = await repo.getPlayerRating('unknown', 'steam', 'squad-fpp');

      expect(result).toBeNull();
    });
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `npx jest test/unit/repositories/elo.repository.test.ts --verbose`
Expected: FAIL — cannot find module `elo.repository`

**Step 3: Write the EloRepository implementation**

Create `src/data/repositories/elo.repository.ts`:

```typescript
import prisma from '../prisma.client';

export interface UpsertRatingData {
  platform: string;
  accountId: string;
  modeKey: string;
  rating: number;
  gamesPlayed: number;
}

export class EloRepository {
  public async findRatingsByAccountIds(
    accountIds: string[],
    platform: string,
    modeKey: string
  ) {
    return prisma.playerRating.findMany({
      where: {
        accountId: { in: accountIds },
        platform,
        modeKey,
      },
    });
  }

  public async upsertRatings(ratings: UpsertRatingData[]): Promise<void> {
    await prisma.$transaction(async (tx) => {
      for (const r of ratings) {
        await tx.playerRating.upsert({
          where: {
            platform_accountId_modeKey: {
              platform: r.platform,
              accountId: r.accountId,
              modeKey: r.modeKey,
            },
          },
          update: {
            rating: r.rating,
            gamesPlayed: r.gamesPlayed,
            lastSeenAt: new Date(),
          },
          create: {
            platform: r.platform,
            accountId: r.accountId,
            modeKey: r.modeKey,
            rating: r.rating,
            gamesPlayed: r.gamesPlayed,
          },
        });
      }
    });
  }

  public async getPlayerRating(accountId: string, platform: string, modeKey: string) {
    return prisma.playerRating.findFirst({
      where: { accountId, platform, modeKey },
    });
  }
}
```

**Step 4: Run tests to verify they pass**

Run: `npx jest test/unit/repositories/elo.repository.test.ts --verbose`
Expected: All 5 tests PASS

**Step 5: Commit**

```bash
git add src/data/repositories/elo.repository.ts test/unit/repositories/elo.repository.test.ts
git commit -m "feat: add EloRepository for player rating persistence"
```

---

### Task 3: Create EloService with pure calculation logic

**Files:**
- Create: `src/services/elo.service.ts`
- Create: `test/unit/services/elo.service.test.ts`

**Step 1: Write failing tests for the pure Elo calculation functions**

Create `test/unit/services/elo.service.test.ts`:

```typescript
import { EloService } from '../../../src/services/elo.service';
import { EloRepository } from '../../../src/data/repositories/elo.repository';

// Mock the repository — we only test pure calculation in this task
jest.mock('../../../src/data/repositories/elo.repository');

describe('EloService', () => {
  let service: EloService;

  beforeEach(() => {
    service = new EloService();
  });

  describe('calculateActualScore', () => {
    it('returns 1.0 for 1st place', () => {
      expect(service.calculateActualScore(1, 20)).toBe(1.0);
    });

    it('returns 0.0 for last place', () => {
      expect(service.calculateActualScore(20, 20)).toBeCloseTo(0.0, 5);
    });

    it('returns 0.5 for middle placement in even field', () => {
      // placement 11 out of 21 => (21-11)/(21-1) = 10/20 = 0.5
      expect(service.calculateActualScore(11, 21)).toBeCloseTo(0.5, 5);
    });

    it('returns 1.0 when totalTeams is 1 (solo match edge case)', () => {
      expect(service.calculateActualScore(1, 1)).toBe(1.0);
    });
  });

  describe('calculateExpectedScore', () => {
    it('returns 0.5 when ratings are equal', () => {
      expect(service.calculateExpectedScore(1500, 1500)).toBeCloseTo(0.5, 5);
    });

    it('returns higher expected score when player is rated above average', () => {
      const expected = service.calculateExpectedScore(1700, 1500);
      expect(expected).toBeGreaterThan(0.5);
      expect(expected).toBeLessThan(1.0);
    });

    it('returns lower expected score when player is rated below average', () => {
      const expected = service.calculateExpectedScore(1300, 1500);
      expect(expected).toBeLessThan(0.5);
      expect(expected).toBeGreaterThan(0.0);
    });

    it('200 point difference gives ~0.76 expected score', () => {
      const expected = service.calculateExpectedScore(1700, 1500);
      expect(expected).toBeCloseTo(0.76, 1);
    });
  });

  describe('calculateRatingChange', () => {
    it('increases rating for 1st place finish', () => {
      const result = service.calculateRatingChange(1500, 10, 1, 20, 1500);
      expect(result.newRating).toBeGreaterThan(1500);
      expect(result.change).toBeGreaterThan(0);
    });

    it('decreases rating for last place finish', () => {
      const result = service.calculateRatingChange(1500, 10, 20, 20, 1500);
      expect(result.newRating).toBeLessThan(1500);
      expect(result.change).toBeLessThan(0);
    });

    it('uses K=40 for players with fewer than 20 games', () => {
      const newPlayer = service.calculateRatingChange(1500, 5, 1, 20, 1500);
      const vetPlayer = service.calculateRatingChange(1500, 25, 1, 20, 1500);
      // New player should gain more from same result
      expect(newPlayer.change).toBeGreaterThan(vetPlayer.change);
    });

    it('uses K=20 for players with 20+ games', () => {
      const result = service.calculateRatingChange(1500, 25, 1, 20, 1500);
      // K=20, actualScore=1.0, expectedScore=0.5 => change = 20 * 0.5 = 10
      expect(result.change).toBeCloseTo(10, 0);
    });

    it('higher-rated player gains less from a win vs avg lobby', () => {
      const highRated = service.calculateRatingChange(1800, 25, 1, 20, 1500);
      const avgRated = service.calculateRatingChange(1500, 25, 1, 20, 1500);
      expect(highRated.change).toBeLessThan(avgRated.change);
    });

    it('rounds rating to 1 decimal place', () => {
      const result = service.calculateRatingChange(1500, 10, 5, 20, 1500);
      const decimalPlaces = result.newRating.toString().split('.')[1]?.length ?? 0;
      expect(decimalPlaces).toBeLessThanOrEqual(1);
    });
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `npx jest test/unit/services/elo.service.test.ts --verbose`
Expected: FAIL — cannot find module `elo.service`

**Step 3: Write the EloService implementation**

Create `src/services/elo.service.ts`:

```typescript
import { EloRepository, type UpsertRatingData } from '../data/repositories/elo.repository';

const DEFAULT_RATING = 1500;
const K_FACTOR_NEW = 40;
const K_FACTOR_ESTABLISHED = 20;
const CALIBRATION_GAMES = 20;

export interface RatingChange {
  newRating: number;
  change: number;
}

export interface PlayerRatingResult {
  rating: number;
  change: number;
}

export interface RosterData {
  rank: number;
  participantAccountIds: string[];
}

export class EloService {
  private readonly repository: EloRepository;

  constructor(repository?: EloRepository) {
    this.repository = repository ?? new EloRepository();
  }

  public calculateActualScore(placement: number, totalTeams: number): number {
    if (totalTeams <= 1) return 1.0;
    return (totalTeams - placement) / (totalTeams - 1);
  }

  public calculateExpectedScore(playerRating: number, avgRating: number): number {
    return 1 / (1 + Math.pow(10, (avgRating - playerRating) / 400));
  }

  public calculateRatingChange(
    currentRating: number,
    gamesPlayed: number,
    placement: number,
    totalTeams: number,
    avgRating: number
  ): RatingChange {
    const k = gamesPlayed < CALIBRATION_GAMES ? K_FACTOR_NEW : K_FACTOR_ESTABLISHED;
    const actualScore = this.calculateActualScore(placement, totalTeams);
    const expectedScore = this.calculateExpectedScore(currentRating, avgRating);
    const change = k * (actualScore - expectedScore);
    const newRating = Math.round((currentRating + change) * 10) / 10;

    return {
      newRating,
      change: Math.round(change * 10) / 10,
    };
  }

  public async processMatchRatings(
    rosters: RosterData[],
    platform: string,
    modeKey: string
  ): Promise<Map<string, PlayerRatingResult>> {
    const allAccountIds = rosters.flatMap((r) => r.participantAccountIds);
    const totalTeams = rosters.length;

    // Batch-fetch existing ratings
    const existingRatings = await this.repository.findRatingsByAccountIds(
      allAccountIds,
      platform,
      modeKey
    );

    // Build lookup map: accountId -> { rating, gamesPlayed }
    const ratingMap = new Map<string, { rating: number; gamesPlayed: number }>();
    for (const r of existingRatings) {
      ratingMap.set(r.accountId, { rating: r.rating, gamesPlayed: r.gamesPlayed });
    }

    // Default rating for unknown players
    for (const id of allAccountIds) {
      if (!ratingMap.has(id)) {
        ratingMap.set(id, { rating: DEFAULT_RATING, gamesPlayed: 0 });
      }
    }

    // Calculate average rating across all participants
    let totalRating = 0;
    for (const { rating } of ratingMap.values()) {
      totalRating += rating;
    }
    const avgRating = totalRating / ratingMap.size;

    // Compute deltas per roster
    const results = new Map<string, PlayerRatingResult>();
    const upserts: UpsertRatingData[] = [];

    for (const roster of rosters) {
      for (const accountId of roster.participantAccountIds) {
        const current = ratingMap.get(accountId)!;
        const { newRating, change } = this.calculateRatingChange(
          current.rating,
          current.gamesPlayed,
          roster.rank,
          totalTeams,
          avgRating
        );

        results.set(accountId, { rating: newRating, change });
        upserts.push({
          platform,
          accountId,
          modeKey,
          rating: newRating,
          gamesPlayed: current.gamesPlayed + 1,
        });
      }
    }

    // Upsert all ratings in one transaction
    await this.repository.upsertRatings(upserts);

    return results;
  }

  public async getPlayerRating(
    accountId: string,
    platform: string,
    modeKey: string
  ): Promise<{ rating: number; gamesPlayed: number } | null> {
    const result = await this.repository.getPlayerRating(accountId, platform, modeKey);
    if (!result) return null;
    return { rating: result.rating, gamesPlayed: result.gamesPlayed };
  }
}
```

**Step 4: Run tests to verify they pass**

Run: `npx jest test/unit/services/elo.service.test.ts --verbose`
Expected: All 10 tests PASS

**Step 5: Commit**

```bash
git add src/services/elo.service.ts test/unit/services/elo.service.test.ts
git commit -m "feat: add EloService with placement-based Elo calculation"
```

---

### Task 4: Test EloService.processMatchRatings (integration with repository)

**Files:**
- Modify: `test/unit/services/elo.service.test.ts`

**Step 1: Add tests for processMatchRatings**

Append to the existing test file's `describe('EloService')` block:

```typescript
  describe('processMatchRatings', () => {
    let mockRepo: jest.Mocked<EloRepository>;

    beforeEach(() => {
      mockRepo = new EloRepository() as jest.Mocked<EloRepository>;
      mockRepo.findRatingsByAccountIds = jest.fn().mockResolvedValue([]);
      mockRepo.upsertRatings = jest.fn().mockResolvedValue(undefined);
      service = new EloService(mockRepo);
    });

    it('computes ratings for all participants and upserts', async () => {
      mockRepo.findRatingsByAccountIds.mockResolvedValue([
        { id: '1', platform: 'steam', accountId: 'acc-1', modeKey: 'squad-fpp', rating: 1500, gamesPlayed: 10, lastSeenAt: new Date() },
      ]);

      const rosters: RosterData[] = [
        { rank: 1, participantAccountIds: ['acc-1'] },
        { rank: 2, participantAccountIds: ['acc-2'] },
      ];

      const results = await service.processMatchRatings(rosters, 'steam', 'squad-fpp');

      expect(results.size).toBe(2);
      // 1st place should gain rating
      expect(results.get('acc-1')!.change).toBeGreaterThan(0);
      // 2nd of 2 (last) should lose rating
      expect(results.get('acc-2')!.change).toBeLessThan(0);
      expect(mockRepo.upsertRatings).toHaveBeenCalledTimes(1);
      expect(mockRepo.upsertRatings).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({ accountId: 'acc-1', gamesPlayed: 11 }),
          expect.objectContaining({ accountId: 'acc-2', gamesPlayed: 1 }),
        ])
      );
    });

    it('defaults unknown players to 1500 rating', async () => {
      mockRepo.findRatingsByAccountIds.mockResolvedValue([]);

      const rosters: RosterData[] = [
        { rank: 1, participantAccountIds: ['new-player'] },
        { rank: 2, participantAccountIds: ['other-new'] },
      ];

      const results = await service.processMatchRatings(rosters, 'steam', 'squad-fpp');

      // Both start at 1500, K=40 for new players
      // Winner: 1500 + 40*(1.0-0.5) = 1520
      expect(results.get('new-player')!.rating).toBeCloseTo(1520, 0);
      // Loser: 1500 + 40*(0.0-0.5) = 1480
      expect(results.get('other-new')!.rating).toBeCloseTo(1480, 0);
    });

    it('handles squad rosters (multiple players per roster)', async () => {
      mockRepo.findRatingsByAccountIds.mockResolvedValue([]);

      const rosters: RosterData[] = [
        { rank: 1, participantAccountIds: ['p1', 'p2'] },
        { rank: 2, participantAccountIds: ['p3', 'p4'] },
      ];

      const results = await service.processMatchRatings(rosters, 'steam', 'squad-fpp');

      expect(results.size).toBe(4);
      // Both p1 and p2 should get same change (same roster rank)
      expect(results.get('p1')!.change).toBe(results.get('p2')!.change);
      expect(results.get('p3')!.change).toBe(results.get('p4')!.change);
    });
  });
```

You will also need to add the import for `RosterData` at the top of the test file:

```typescript
import { EloService, type RosterData } from '../../../src/services/elo.service';
```

**Step 2: Run tests to verify they pass**

Run: `npx jest test/unit/services/elo.service.test.ts --verbose`
Expected: All 13 tests PASS

**Step 3: Commit**

```bash
git add test/unit/services/elo.service.test.ts
git commit -m "test: add processMatchRatings integration tests for EloService"
```

---

### Task 5: Integrate EloService into MatchMonitorService

**Files:**
- Modify: `src/services/match-monitor.service.ts`
- Modify: `src/types/discord-match-summary.types.ts`

**Step 1: Add `eloRatings` field to `DiscordMatchGroupSummary` type**

In `src/types/discord-match-summary.types.ts`, add a new optional field to `DiscordMatchGroupSummary`:

```typescript
export interface DiscordMatchGroupSummary {
  matchId: string;
  mapName: string;
  gameMode: string;
  playedAt: string;
  players: DiscordPlayerMatchStats[];
  teamRank?: number;
  telemetryUrl?: string;
  eloRatings?: Map<string, { rating: number; change: number }>;
}
```

The `eloRatings` map is keyed by PUBG account ID. Only tracked players' ratings will be looked up when building embeds.

**Step 2: Import and inject EloService into MatchMonitorService**

In `src/services/match-monitor.service.ts`:

Add import at the top:
```typescript
import { EloService, type RosterData } from './elo.service';
```

Add to constructor — add a new private field and instantiate it:
```typescript
private readonly eloService: EloService;
```

In the constructor body (after `this.pubgClient = new PubgClient(...)`:
```typescript
this.eloService = new EloService();
```

**Step 3: Call EloService after match is saved, before creating summary**

In the `checkNewMatches` method, inside the loop that processes new matches (around line 228-250), after `this.storage.saveMatch(matchDetails)` succeeds and before creating the match summary, add Elo processing.

Find this block in `checkNewMatches` (around lines 228-241):

```typescript
      try {
        debug(`Processing match ${match.matchId} with ${match.players.length} monitored players`);

        const summary = await this.createMatchSummary(match);
        if (summary) {
          await this.discordBot.sendMatchSummary(this.channelId, summary);
```

Replace with:

```typescript
      try {
        debug(`Processing match ${match.matchId} with ${match.players.length} monitored players`);

        const summary = await this.createMatchSummary(match);
        if (summary) {
          // Process Elo ratings for all participants in this match
          try {
            const eloRatings = await this.processMatchElo(match.matchId, summary.gameMode);
            if (eloRatings) {
              summary.eloRatings = eloRatings;
            }
          } catch (eloErr) {
            warn(`Failed to process Elo ratings for match ${match.matchId}: ${eloErr}`);
          }

          await this.discordBot.sendMatchSummary(this.channelId, summary);
```

**Step 4: Add the `processMatchElo` method to MatchMonitorService**

Add this method to the `MatchMonitorService` class:

```typescript
  private async processMatchElo(
    matchId: string,
    gameMode: string
  ): Promise<Map<string, { rating: number; change: number }> | null> {
    const matchData = await this.storage.getMatch(matchId);
    if (!matchData || !matchData.rosters || !matchData.participants) {
      warn(`No stored match data found for Elo processing: ${matchId}`);
      return null;
    }

    const modeKey = gameMode;
    const platform = matchData.shardId;

    const rosters: RosterData[] = matchData.rosters.map((roster) => ({
      rank: roster.rank,
      participantAccountIds: matchData.participants
        .filter((p) => p.rosterId === roster.id)
        .map((p) => p.pubgId)
        .filter((id) => id !== ''),
    }));

    // Filter out rosters with no valid participants
    const validRosters = rosters.filter((r) => r.participantAccountIds.length > 0);
    if (validRosters.length === 0) {
      warn(`No valid rosters found for Elo processing: ${matchId}`);
      return null;
    }

    return this.eloService.processMatchRatings(validRosters, platform, modeKey);
  }
```

**Step 5: Run lint and build to verify no compilation errors**

Run: `npm run build`
Expected: Compiles with no errors

**Step 6: Commit**

```bash
git add src/services/match-monitor.service.ts src/types/discord-match-summary.types.ts src/services/elo.service.ts
git commit -m "feat: integrate EloService into match processing pipeline"
```

---

### Task 6: Display Elo rating in Discord embeds

**Files:**
- Modify: `src/services/discord-bot.service.ts`

The `eloRatings` map on the summary is keyed by PUBG account ID, but the embed methods receive `DiscordPlayerMatchStats` which has `name` (PUBG display name), not account ID. We need to look up by name. The Participant table in DB has both `pubgId` and `name`. The `eloRatings` map keys are `pubgId` values.

To bridge this, we'll add a `pubgId` field to `DiscordPlayerMatchStats` (optional, for backwards compat).

**Step 1: Add optional `pubgId` to `DiscordPlayerMatchStats`**

In `src/types/discord-match-summary.types.ts`:

```typescript
export interface DiscordPlayerMatchStats {
  name: string;
  pubgId?: string;
  stats?: {
    // ... existing fields unchanged
  };
}
```

**Step 2: Populate `pubgId` in `createMatchSummary` in match-monitor.service.ts**

In `src/services/match-monitor.service.ts`, in the `createMatchSummary` method, where `playerStats` are populated, ensure `pubgId` is included. Find the section that pushes roster participants (around line 312-319):

```typescript
              playerStats.push({
                name: rosterParticipant.attributes.stats.name,
                stats: rosterParticipant.attributes.stats,
              });
```

Change to:

```typescript
              playerStats.push({
                name: rosterParticipant.attributes.stats.name,
                pubgId: rosterParticipant.attributes.stats.playerId,
                stats: rosterParticipant.attributes.stats,
              });
```

Do the same for the fallback path (around line 322) where a single player is pushed:

```typescript
          playerStats.push({
            name: participant.attributes.stats.name,
            pubgId: participant.attributes.stats.playerId,
            stats: participant.attributes.stats,
          });
```

**Step 3: Pass eloRatings through to embed creation methods**

In `src/services/discord-bot.service.ts`, modify `createMatchSummaryEmbeds` (the private method, around line 553) to accept and forward `eloRatings`.

The method signature is approximately:
```typescript
private async createMatchSummaryEmbeds(summary: DiscordMatchGroupSummary): Promise<EmbedBuilder[]>
```

It already receives the full `summary` object which now includes `eloRatings`. So we just need to pass it down to the player embed methods.

**Step 4: Modify player embed title to include Elo rating**

Create a helper method in `DiscordBotService`:

```typescript
  private formatPlayerTitle(player: DiscordPlayerMatchStats, eloRatings?: Map<string, { rating: number; change: number }>): string {
    const baseName = `Player: ${player.name}`;
    if (!eloRatings || !player.pubgId) return baseName;

    const elo = eloRatings.get(player.pubgId);
    if (!elo) return baseName;

    const arrow = elo.change >= 0 ? '▲' : '▼';
    const sign = elo.change >= 0 ? '+' : '';
    return `${baseName} [${Math.round(elo.rating)} ${arrow}${sign}${Math.round(elo.change)}]`;
  }
```

**Step 5: Update all 3 embed creation methods to use the new title**

In `createBasicPlayerEmbed` (line ~758), change:
```typescript
// Before:
.setTitle(`Player: ${player.name}`)

// After:
.setTitle(this.formatPlayerTitle(player, eloRatings))
```

Update method signatures to accept the optional `eloRatings` parameter:

```typescript
  private createBasicPlayerEmbeds(
    players: DiscordPlayerMatchStats[],
    matchColor: number,
    matchId: string,
    eloRatings?: Map<string, { rating: number; change: number }>
  ): EmbedBuilder[] {
    return players.map((player) => this.createBasicPlayerEmbed(player, matchColor, matchId, eloRatings));
  }

  private createBasicPlayerEmbed(
    player: DiscordPlayerMatchStats,
    matchColor: number,
    matchId: string,
    eloRatings?: Map<string, { rating: number; change: number }>
  ): EmbedBuilder {
```

Both `.setTitle(...)` calls in `createBasicPlayerEmbed` (lines ~766 and ~793) should be updated:
```typescript
.setTitle(this.formatPlayerTitle(player, eloRatings))
```

For `createEnhancedPlayerEmbed` (line ~810):
```typescript
  private createEnhancedPlayerEmbed(
    player: DiscordPlayerMatchStats,
    analysis: PlayerAnalysis,
    matchColor: number,
    matchId: string,
    eloRatings?: Map<string, { rating: number; change: number }>
  ): EmbedBuilder {
    const statsDescription = this.formatEnhancedStats(player, analysis, matchId);

    return new EmbedBuilder()
      .setTitle(this.formatPlayerTitle(player, eloRatings))
      .setDescription(statsDescription)
      .setColor(matchColor);
  }
```

**Step 6: Pass `eloRatings` from `createMatchSummaryEmbeds` to embed methods**

In `createMatchSummaryEmbeds`, find every call to `createBasicPlayerEmbed`, `createBasicPlayerEmbeds`, and `createEnhancedPlayerEmbed` and add `summary.eloRatings` as the last argument.

There are approximately 6 call sites:
- Line ~601: `this.createBasicPlayerEmbeds(players, matchColor, matchId)` → add `, summary.eloRatings`
- Line ~621: `this.createEnhancedPlayerEmbed(player, analysis, matchColor, matchId)` → add `, summary.eloRatings`
- Line ~622: `this.createBasicPlayerEmbed(player, matchColor, matchId)` → add `, summary.eloRatings`
- Line ~656: `this.createEnhancedPlayerEmbed(player, analysis, matchColor, matchId)` → add `, summary.eloRatings`
- Line ~657: `this.createBasicPlayerEmbed(player, matchColor, matchId)` → add `, summary.eloRatings`
- Line ~665: `this.createBasicPlayerEmbeds(players, matchColor, matchId)` → add `, summary.eloRatings`

**Step 7: Run build to verify compilation**

Run: `npm run build`
Expected: Compiles with no errors

**Step 8: Commit**

```bash
git add src/services/discord-bot.service.ts src/services/match-monitor.service.ts src/types/discord-match-summary.types.ts
git commit -m "feat: display Elo rating and change in Discord player embeds"
```

---

### Task 7: Add EloService to PubgStorageService and index.ts wiring

**Files:**
- Modify: `src/services/pubg-storage.service.ts`
- Modify: `src/index.ts`

**Step 1: Add Elo methods to PubgStorageService**

In `src/services/pubg-storage.service.ts`, add a new region for Elo:

```typescript
import { EloRepository } from '../data/repositories/elo.repository';
```

Add to the class:

```typescript
  private eloRepository = new EloRepository();

  //#region Elo

  public async getPlayerRatings(accountIds: string[], platform: string, modeKey: string) {
    return this.eloRepository.findRatingsByAccountIds(accountIds, platform, modeKey);
  }

  //#endregion
```

This is optional plumbing for future use (e.g., a `/rating` slash command). The `EloService` already directly uses the repository.

**Step 2: Run build to verify**

Run: `npm run build`
Expected: Compiles with no errors

**Step 3: Commit**

```bash
git add src/services/pubg-storage.service.ts
git commit -m "feat: add Elo rating lookup to PubgStorageService"
```

---

### Task 8: Run full test suite and lint

**Files:** None (verification only)

**Step 1: Run lint**

Run: `npm run lint`
Expected: No errors

**Step 2: Run all unit tests**

Run: `npm test`
Expected: All tests pass

**Step 3: Run build**

Run: `npm run build`
Expected: Compiles successfully

**Step 4: Commit any lint fixes if needed**

```bash
git add -A
git commit -m "chore: lint fixes for Elo rating feature"
```

(Skip if no changes needed.)

---

### Task 9: Bootstrap existing matches (retroactive Elo calculation)

**Files:**
- Modify: `src/services/elo.service.ts`
- Modify: `src/services/match-monitor.service.ts`

**Step 1: Add `bootstrapRatingsFromDB` method to EloService**

This processes all matches already stored in the database chronologically. Add to `EloService`:

```typescript
  public async bootstrapRatingsFromDB(
    matches: Array<{
      matchId: string;
      gameMode: string;
      shardId: string;
      rosters: Array<{
        id: string;
        rank: number;
      }>;
      participants: Array<{
        pubgId: string;
        rosterId: string;
      }>;
    }>
  ): Promise<number> {
    let processed = 0;

    for (const match of matches) {
      const rosters: RosterData[] = match.rosters.map((roster) => ({
        rank: roster.rank,
        participantAccountIds: match.participants
          .filter((p) => p.rosterId === roster.id)
          .map((p) => p.pubgId)
          .filter((id) => id !== ''),
      }));

      const validRosters = rosters.filter((r) => r.participantAccountIds.length > 0);
      if (validRosters.length === 0) continue;

      await this.processMatchRatings(validRosters, match.shardId, match.gameMode);
      processed++;
    }

    return processed;
  }
```

**Step 2: Add a bootstrap method to MatchMonitorService**

This is called once on startup or via command. Add to `MatchMonitorService`:

```typescript
  public async bootstrapEloRatings(): Promise<void> {
    monitor('Bootstrapping Elo ratings from existing matches...');

    // Get all matches from DB, ordered chronologically
    const matches = await this.storage.getAllMatchesWithRosters();
    if (!matches || matches.length === 0) {
      monitor('No existing matches found for Elo bootstrap');
      return;
    }

    monitor(`Found ${matches.length} matches for Elo bootstrap`);
    const processed = await this.eloService.bootstrapRatingsFromDB(matches);
    success(`Elo bootstrap complete: processed ${processed} matches`);
  }
```

**Step 3: Add `getAllMatchesWithRosters` to storage layer**

In `src/data/repositories/match.repository.ts`, add:

```typescript
  public async getAllMatchesWithRosters() {
    return prisma.match.findMany({
      include: { participants: true, rosters: true },
      orderBy: { playedAt: 'asc' },
    });
  }
```

In `src/services/pubg-storage.service.ts`, add:

```typescript
  public async getAllMatchesWithRosters() {
    return this.matchRepository.getAllMatchesWithRosters();
  }
```

**Step 4: Call bootstrap from index.ts on startup**

In `src/index.ts`, after creating `matchMonitor` and before starting monitoring (around line 43):

```typescript
    // Bootstrap Elo ratings from existing matches
    await matchMonitor.bootstrapEloRatings();
```

**Step 5: Run build**

Run: `npm run build`
Expected: Compiles with no errors

**Step 6: Commit**

```bash
git add src/services/elo.service.ts src/services/match-monitor.service.ts src/data/repositories/match.repository.ts src/services/pubg-storage.service.ts src/index.ts
git commit -m "feat: add Elo rating bootstrap from existing matches on startup"
```

---

## Summary of All Tasks

| Task | Description | New Files | Modified Files |
|------|-------------|-----------|----------------|
| 1 | Prisma schema + migration | - | `prisma/schema.prisma` |
| 2 | EloRepository + tests | `elo.repository.ts`, `elo.repository.test.ts` | - |
| 3 | EloService pure logic + tests | `elo.service.ts`, `elo.service.test.ts` | - |
| 4 | EloService.processMatchRatings tests | - | `elo.service.test.ts` |
| 5 | Integrate into MatchMonitorService | - | `match-monitor.service.ts`, `discord-match-summary.types.ts` |
| 6 | Display Elo in Discord embeds | - | `discord-bot.service.ts`, `match-monitor.service.ts`, `discord-match-summary.types.ts` |
| 7 | Wire into PubgStorageService | - | `pubg-storage.service.ts` |
| 8 | Full lint + test + build verification | - | - |
| 9 | Bootstrap from existing DB matches | - | `elo.service.ts`, `match-monitor.service.ts`, `match.repository.ts`, `pubg-storage.service.ts`, `index.ts` |
