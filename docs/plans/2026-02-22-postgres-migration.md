# PostgreSQL Migration + Telemetry Storage Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace MongoDB/Mongoose with PostgreSQL/Prisma and persist match API data + telemetry (raw events and derived PlayerAnalysis) to the database.

**Architecture:** Full rip-and-replace — Mongoose removed entirely, Prisma schema is the single source of truth. Five tables: `players`, `processed_matches`, `matches`, `participants`, `rosters`, `match_telemetry`. Telemetry is cached on first fetch; Discord embeds use the cache on subsequent posts.

**Tech Stack:** PostgreSQL 15+, Prisma 5, `@prisma/client`, `pg` (Prisma peer dep). Node 20, TypeScript 5, Jest.

**Design doc:** `docs/plans/2026-02-22-postgres-migration-design.md`

---

## Task 1: Install Prisma, Remove Mongoose

**Files:**
- Modify: `package.json`

**Step 1: Install Prisma**

```bash
npm install prisma @prisma/client
npm install --save-dev prisma
```

**Step 2: Remove Mongoose**

```bash
npm uninstall mongoose @types/mongoose
```

**Step 3: Verify package.json has no mongoose references**

```bash
grep -r "mongoose" package.json
```
Expected: no output.

**Step 4: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: replace mongoose with prisma"
```

---

## Task 2: Create Prisma Schema

**Files:**
- Create: `prisma/schema.prisma`

**Step 1: Initialise Prisma**

```bash
npx prisma init --datasource-provider postgresql
```

This creates `prisma/schema.prisma` and adds `DATABASE_URL` to `.env`.

**Step 2: Replace the generated schema with the full schema**

Replace the contents of `prisma/schema.prisma` with:

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

model Player {
  id           String    @id @default(uuid())
  pubgId       String    @unique
  name         String    @unique
  shardId      String
  patchVersion String
  titleId      String
  lastMatchAt  DateTime?
  createdAt    DateTime  @default(now())
  updatedAt    DateTime  @updatedAt

  @@map("players")
}

model ProcessedMatch {
  id          String   @id @default(uuid())
  matchId     String   @unique
  processedAt DateTime @default(now())

  @@map("processed_matches")
}

model Match {
  id            String   @id @default(uuid())
  matchId       String   @unique
  gameMode      String
  mapName       String
  duration      Int
  isCustomMatch Boolean
  seasonState   String
  shardId       String
  telemetryUrl  String
  playedAt      DateTime
  createdAt     DateTime @default(now())

  participants Participant[]
  rosters      Roster[]
  telemetry    MatchTelemetry?

  @@map("matches")
}

model Roster {
  id      String @id @default(uuid())
  matchId String
  rank    Int
  won     Boolean

  match        Match         @relation(fields: [matchId], references: [matchId], onDelete: Cascade)
  participants Participant[]

  @@map("rosters")
}

model Participant {
  id               String  @id @default(uuid())
  matchId          String
  rosterId         String
  pubgId           String
  name             String
  kills            Int
  DBNOs            Int
  damageDealt      Float
  headshotKills    Int
  assists          Int
  revives          Int
  timeSurvived     Float
  walkDistance     Float
  longestKill      Float
  winPlace         Int
  killPlace        Int
  killStreaks       Int
  boosts           Int
  heals            Int
  rideDistance     Float
  swimDistance     Float
  roadKills        Int
  teamKills        Int
  vehicleDestroys  Int
  weaponsAcquired  Int
  deathType        String

  match  Match  @relation(fields: [matchId], references: [matchId], onDelete: Cascade)
  roster Roster @relation(fields: [rosterId], references: [id], onDelete: Cascade)

  @@map("participants")
}

model MatchTelemetry {
  id             String   @id @default(uuid())
  matchId        String   @unique
  rawEvents      Json
  playerAnalyses Json
  processedAt    DateTime @default(now())

  match Match @relation(fields: [matchId], references: [matchId], onDelete: Cascade)

  @@map("match_telemetry")
}
```

**Step 3: Verify schema parses**

```bash
npx prisma validate
```
Expected: `The schema at prisma/schema.prisma is valid`

**Step 4: Commit**

```bash
git add prisma/schema.prisma .env
git commit -m "feat: add prisma schema for postgres migration"
```

---

## Task 3: Run Initial Migration

> Requires a running PostgreSQL instance. For local dev, run: `docker run -d -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=pubg_tracker -p 5432:5432 postgres:15`
> Then set `DATABASE_URL=postgresql://postgres:postgres@localhost:5432/pubg_tracker` in `.env`

**Step 1: Run migration**

```bash
npx prisma migrate dev --name init
```

Expected output ends with: `Your database is now in sync with your schema.`

This creates `prisma/migrations/TIMESTAMP_init/migration.sql`.

**Step 2: Generate Prisma client**

```bash
npx prisma generate
```

Expected: `✔ Generated Prisma Client`

**Step 3: Commit**

```bash
git add prisma/migrations
git commit -m "feat: add initial prisma migration"
```

---

## Task 4: Create Prisma Client Singleton

**Files:**
- Create: `src/data/prisma.client.ts`

**Step 1: Write the singleton**

Create `src/data/prisma.client.ts`:

```typescript
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export default prisma;
```

**Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors (Prisma client types are generated).

**Step 3: Commit**

```bash
git add src/data/prisma.client.ts
git commit -m "feat: add prisma client singleton"
```

---

## Task 5: Rewrite Player Repository

**Files:**
- Modify: `src/data/repositories/player.repository.ts`
- Delete: `src/data/models/player.model.ts`

**Step 1: Write a failing test first**

Create `test/unit/repositories/player.repository.test.ts`:

```typescript
import { PlayerRepository } from '../../../src/data/repositories/player.repository';
import prisma from '../../../src/data/prisma.client';

jest.mock('../../../src/data/prisma.client', () => ({
  __esModule: true,
  default: {
    player: {
      upsert: jest.fn(),
      delete: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
    },
  },
}));

const mockPrisma = prisma as jest.Mocked<typeof prisma>;

describe('PlayerRepository', () => {
  const repo = new PlayerRepository();

  beforeEach(() => jest.clearAllMocks());

  it('saves a player via upsert', async () => {
    const playerData = {
      id: 'pubg-123',
      type: 'player',
      attributes: {
        name: 'TestPlayer',
        shardId: 'steam',
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
        patchVersion: '1.0',
        titleId: 'bluehole-pubg',
      },
      relationships: { matches: { data: [{ id: 'm1' }, { id: 'm2' }] } },
    } as any;

    (mockPrisma.player.upsert as jest.Mock).mockResolvedValue({ pubgId: 'pubg-123', name: 'TestPlayer' });

    const result = await repo.savePlayer(playerData);

    expect(mockPrisma.player.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ where: { pubgId: 'pubg-123' } })
    );
    expect(result.name).toBe('TestPlayer');
  });

  it('removes a player by name', async () => {
    (mockPrisma.player.delete as jest.Mock).mockResolvedValue({});
    await repo.removePlayer('TestPlayer');
    expect(mockPrisma.player.delete).toHaveBeenCalledWith({ where: { name: 'TestPlayer' } });
  });

  it('returns all players', async () => {
    (mockPrisma.player.findMany as jest.Mock).mockResolvedValue([{ name: 'P1' }, { name: 'P2' }]);
    const result = await repo.getAllPlayers();
    expect(result).toHaveLength(2);
  });
});
```

**Step 2: Run test to verify it fails**

```bash
npx jest test/unit/repositories/player.repository.test.ts --no-coverage
```

Expected: FAIL — `PlayerRepository` not yet updated.

**Step 3: Rewrite `src/data/repositories/player.repository.ts`**

```typescript
import type { Player as PlayerData } from '@j03fr0st/pubg-ts';
import prisma from '../prisma.client';

export class PlayerRepository {
  public async savePlayer(playerData: PlayerData) {
    return prisma.player.upsert({
      where: { pubgId: playerData.id },
      update: {
        name: playerData.attributes.name,
        shardId: playerData.attributes.shardId,
        updatedAt: new Date(playerData.attributes.updatedAt),
        patchVersion: playerData.attributes.patchVersion,
        titleId: playerData.attributes.titleId,
      },
      create: {
        pubgId: playerData.id,
        name: playerData.attributes.name,
        shardId: playerData.attributes.shardId,
        createdAt: new Date(playerData.attributes.createdAt),
        updatedAt: new Date(playerData.attributes.updatedAt),
        patchVersion: playerData.attributes.patchVersion,
        titleId: playerData.attributes.titleId,
      },
    });
  }

  public async removePlayer(playerName: string): Promise<void> {
    await prisma.player.delete({ where: { name: playerName } });
  }

  public async updatePlayerLastMatch(playerName: string, matchId: string): Promise<void> {
    await prisma.player.update({
      where: { name: playerName },
      data: { lastMatchAt: new Date() },
    });
  }

  public async getAllPlayers() {
    return prisma.player.findMany();
  }
}
```

**Step 4: Delete the Mongoose model**

Delete `src/data/models/player.model.ts`.

**Step 5: Run tests**

```bash
npx jest test/unit/repositories/player.repository.test.ts --no-coverage
```

Expected: PASS

**Step 6: Commit**

```bash
git add src/data/repositories/player.repository.ts test/unit/repositories/player.repository.test.ts
git rm src/data/models/player.model.ts
git commit -m "feat: rewrite player repository with prisma"
```

---

## Task 6: Rewrite ProcessedMatch Repository

**Files:**
- Modify: `src/data/repositories/processed-match.repository.ts`
- Delete: `src/data/models/processed-match.model.ts`

**Step 1: Write failing test**

Create `test/unit/repositories/processed-match.repository.test.ts`:

```typescript
import { ProcessedMatchRepository } from '../../../src/data/repositories/processed-match.repository';
import prisma from '../../../src/data/prisma.client';

jest.mock('../../../src/data/prisma.client', () => ({
  __esModule: true,
  default: {
    processedMatch: {
      findMany: jest.fn(),
      create: jest.fn(),
      delete: jest.fn(),
      findFirst: jest.fn(),
    },
  },
}));

const mockPrisma = prisma as jest.Mocked<typeof prisma>;

describe('ProcessedMatchRepository', () => {
  const repo = new ProcessedMatchRepository();

  beforeEach(() => jest.clearAllMocks());

  it('returns all processed match IDs', async () => {
    (mockPrisma.processedMatch.findMany as jest.Mock).mockResolvedValue([
      { matchId: 'match-1' },
      { matchId: 'match-2' },
    ]);
    const result = await repo.getProcessedMatches();
    expect(result).toEqual(['match-1', 'match-2']);
  });

  it('adds a processed match', async () => {
    (mockPrisma.processedMatch.create as jest.Mock).mockResolvedValue({});
    await repo.addProcessedMatch('match-abc');
    expect(mockPrisma.processedMatch.create).toHaveBeenCalledWith({
      data: { matchId: 'match-abc' },
    });
  });

  it('removes a match by ID, returns true if deleted', async () => {
    (mockPrisma.processedMatch.delete as jest.Mock).mockResolvedValue({ matchId: 'match-abc' });
    const result = await repo.removeProcessedMatch('match-abc');
    expect(result).toBe(true);
  });

  it('returns false when removing a non-existent match', async () => {
    (mockPrisma.processedMatch.delete as jest.Mock).mockRejectedValue({ code: 'P2025' });
    const result = await repo.removeProcessedMatch('missing');
    expect(result).toBe(false);
  });

  it('returns the last processed match', async () => {
    const now = new Date();
    (mockPrisma.processedMatch.findFirst as jest.Mock).mockResolvedValue({
      matchId: 'last-match',
      processedAt: now,
    });
    const result = await repo.getLastProcessedMatch();
    expect(result).toEqual({ matchId: 'last-match', processedAt: now });
  });
});
```

**Step 2: Run test to verify it fails**

```bash
npx jest test/unit/repositories/processed-match.repository.test.ts --no-coverage
```

Expected: FAIL

**Step 3: Rewrite `src/data/repositories/processed-match.repository.ts`**

```typescript
import prisma from '../prisma.client';

export class ProcessedMatchRepository {
  public async getProcessedMatches(): Promise<string[]> {
    const matches = await prisma.processedMatch.findMany({ select: { matchId: true } });
    return matches.map((m) => m.matchId);
  }

  public async addProcessedMatch(matchId: string): Promise<void> {
    await prisma.processedMatch.create({ data: { matchId } });
  }

  public async removeProcessedMatch(matchId: string): Promise<boolean> {
    try {
      await prisma.processedMatch.delete({ where: { matchId } });
      return true;
    } catch (err: any) {
      if (err?.code === 'P2025') return false;
      throw err;
    }
  }

  public async removeLastProcessedMatch(): Promise<string | null> {
    const last = await prisma.processedMatch.findFirst({
      orderBy: { processedAt: 'desc' },
      select: { matchId: true },
    });
    if (!last) return null;
    await prisma.processedMatch.delete({ where: { matchId: last.matchId } });
    return last.matchId;
  }

  public async getLastProcessedMatch(): Promise<{ matchId: string; processedAt: Date } | null> {
    const last = await prisma.processedMatch.findFirst({
      orderBy: { processedAt: 'desc' },
      select: { matchId: true, processedAt: true },
    });
    return last ?? null;
  }
}
```

**Step 4: Delete Mongoose model**

Delete `src/data/models/processed-match.model.ts`.

**Step 5: Run tests**

```bash
npx jest test/unit/repositories/processed-match.repository.test.ts --no-coverage
```

Expected: PASS

**Step 6: Commit**

```bash
git add src/data/repositories/processed-match.repository.ts test/unit/repositories/processed-match.repository.test.ts
git rm src/data/models/processed-match.model.ts
git commit -m "feat: rewrite processed-match repository with prisma"
```

---

## Task 7: Create Match Repository

**Files:**
- Create: `src/data/repositories/match.repository.ts`
- Create: `test/unit/repositories/match.repository.test.ts`

The match repository receives raw match API data (the full `matchDetails` object from `pubgClient.matches.getMatch()`) and persists it.

**Step 1: Write failing test**

Create `test/unit/repositories/match.repository.test.ts`:

```typescript
import { MatchRepository } from '../../../src/data/repositories/match.repository';
import prisma from '../../../src/data/prisma.client';

jest.mock('../../../src/data/prisma.client', () => ({
  __esModule: true,
  default: {
    match: {
      upsert: jest.fn(),
      findUnique: jest.fn(),
    },
    roster: { create: jest.fn() },
    participant: { create: jest.fn() },
    $transaction: jest.fn(),
  },
}));

const mockPrisma = prisma as jest.Mocked<typeof prisma>;

const makeMatchDetails = () => ({
  data: {
    id: 'match-xyz',
    attributes: {
      mapName: 'Baltic_Main',
      gameMode: 'squad-fpp',
      duration: 1800,
      isCustomMatch: false,
      seasonState: 'progress',
      shardId: 'steam',
      createdAt: '2024-01-01T10:00:00Z',
    },
  },
  included: [
    {
      type: 'asset',
      attributes: { URL: 'https://telemetry.example.com/match.json' },
    },
    {
      type: 'roster',
      id: 'roster-1',
      attributes: { stats: { rank: 3, teamId: 1 }, won: 'false' },
      relationships: { participants: { data: [{ id: 'p-1' }] } },
    },
    {
      type: 'participant',
      id: 'p-1',
      attributes: {
        stats: {
          name: 'Player1',
          playerId: 'pubg-player-1',
          kills: 3, DBNOs: 2, damageDealt: 450.5, headshotKills: 1,
          assists: 1, revives: 0, timeSurvived: 1500, walkDistance: 2000,
          longestKill: 150, winPlace: 3, killPlace: 5, killStreaks: 2,
          boosts: 3, heals: 2, rideDistance: 0, swimDistance: 0,
          roadKills: 0, teamKills: 0, vehicleDestroys: 0,
          weaponsAcquired: 4, deathType: 'byplayer',
        },
      },
    },
  ],
});

describe('MatchRepository', () => {
  const repo = new MatchRepository();

  beforeEach(() => jest.clearAllMocks());

  it('saves a match with participants and rosters', async () => {
    (mockPrisma.$transaction as jest.Mock).mockImplementation((fn) => fn(mockPrisma));
    (mockPrisma.match.upsert as jest.Mock).mockResolvedValue({ matchId: 'match-xyz' });
    (mockPrisma.roster.create as jest.Mock).mockResolvedValue({ id: 'roster-1' });
    (mockPrisma.participant.create as jest.Mock).mockResolvedValue({});

    await repo.saveMatch(makeMatchDetails());

    expect(mockPrisma.match.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ where: { matchId: 'match-xyz' } })
    );
  });

  it('finds a match by matchId', async () => {
    (mockPrisma.match.findUnique as jest.Mock).mockResolvedValue({ matchId: 'match-xyz' });
    const result = await repo.findMatch('match-xyz');
    expect(result?.matchId).toBe('match-xyz');
  });
});
```

**Step 2: Run test to verify it fails**

```bash
npx jest test/unit/repositories/match.repository.test.ts --no-coverage
```

Expected: FAIL — `MatchRepository` does not exist yet.

**Step 3: Create `src/data/repositories/match.repository.ts`**

```typescript
import prisma from '../prisma.client';

export class MatchRepository {
  public async saveMatch(matchDetails: any): Promise<void> {
    const { data, included } = matchDetails;

    const rosters = included.filter(
      (item: any) =>
        item.type === 'roster' &&
        'relationships' in item &&
        !!item.relationships?.participants?.data
    );

    const participants = included.filter(
      (item: any) =>
        item.type === 'participant' && 'attributes' in item && 'stats' in item.attributes
    );

    const telemetryAsset = included.find((item: any) => item.type === 'asset');
    const telemetryUrl = telemetryAsset?.attributes.URL || '';

    await prisma.$transaction(async (tx) => {
      await tx.match.upsert({
        where: { matchId: data.id },
        update: {},
        create: {
          matchId: data.id,
          gameMode: data.attributes.gameMode,
          mapName: data.attributes.mapName,
          duration: data.attributes.duration,
          isCustomMatch: data.attributes.isCustomMatch ?? false,
          seasonState: data.attributes.seasonState ?? '',
          shardId: data.attributes.shardId,
          telemetryUrl,
          playedAt: new Date(data.attributes.createdAt),
        },
      });

      for (const roster of rosters) {
        const createdRoster = await tx.roster.create({
          data: {
            matchId: data.id,
            rank: roster.attributes?.stats?.rank ?? 0,
            won: roster.attributes?.won === 'true',
          },
        });

        const rosterParticipantIds: string[] =
          roster.relationships?.participants?.data?.map((p: { id: string }) => p.id) ?? [];

        for (const pid of rosterParticipantIds) {
          const p = participants.find((x: any) => x.id === pid);
          if (!p?.attributes?.stats) continue;
          const s = p.attributes.stats;

          await tx.participant.create({
            data: {
              matchId: data.id,
              rosterId: createdRoster.id,
              pubgId: s.playerId ?? '',
              name: s.name,
              kills: s.kills ?? 0,
              DBNOs: s.DBNOs ?? 0,
              damageDealt: s.damageDealt ?? 0,
              headshotKills: s.headshotKills ?? 0,
              assists: s.assists ?? 0,
              revives: s.revives ?? 0,
              timeSurvived: s.timeSurvived ?? 0,
              walkDistance: s.walkDistance ?? 0,
              longestKill: s.longestKill ?? 0,
              winPlace: s.winPlace ?? 0,
              killPlace: s.killPlace ?? 0,
              killStreaks: s.killStreaks ?? 0,
              boosts: s.boosts ?? 0,
              heals: s.heals ?? 0,
              rideDistance: s.rideDistance ?? 0,
              swimDistance: s.swimDistance ?? 0,
              roadKills: s.roadKills ?? 0,
              teamKills: s.teamKills ?? 0,
              vehicleDestroys: s.vehicleDestroys ?? 0,
              weaponsAcquired: s.weaponsAcquired ?? 0,
              deathType: s.deathType ?? '',
            },
          });
        }
      }
    });
  }

  public async findMatch(matchId: string) {
    return prisma.match.findUnique({
      where: { matchId },
      include: { participants: true, rosters: true },
    });
  }
}
```

**Step 4: Run tests**

```bash
npx jest test/unit/repositories/match.repository.test.ts --no-coverage
```

Expected: PASS

**Step 5: Commit**

```bash
git add src/data/repositories/match.repository.ts test/unit/repositories/match.repository.test.ts
git commit -m "feat: add match repository with prisma"
```

---

## Task 8: Create Telemetry Repository

**Files:**
- Create: `src/data/repositories/telemetry.repository.ts`
- Create: `test/unit/repositories/telemetry.repository.test.ts`

**Step 1: Write failing test**

Create `test/unit/repositories/telemetry.repository.test.ts`:

```typescript
import { TelemetryRepository } from '../../../src/data/repositories/telemetry.repository';
import prisma from '../../../src/data/prisma.client';

jest.mock('../../../src/data/prisma.client', () => ({
  __esModule: true,
  default: {
    matchTelemetry: {
      upsert: jest.fn(),
      findUnique: jest.fn(),
    },
  },
}));

const mockPrisma = prisma as jest.Mocked<typeof prisma>;

describe('TelemetryRepository', () => {
  const repo = new TelemetryRepository();

  beforeEach(() => jest.clearAllMocks());

  it('saves raw events and player analyses', async () => {
    (mockPrisma.matchTelemetry.upsert as jest.Mock).mockResolvedValue({});
    await repo.saveTelemetry('match-1', [{ _T: 'LogPlayerKillV2' }], { Player1: { kdRatio: 2 } });
    expect(mockPrisma.matchTelemetry.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ where: { matchId: 'match-1' } })
    );
  });

  it('returns null when no cached telemetry exists', async () => {
    (mockPrisma.matchTelemetry.findUnique as jest.Mock).mockResolvedValue(null);
    const result = await repo.getCachedAnalyses('match-xyz');
    expect(result).toBeNull();
  });

  it('returns cached player analyses', async () => {
    (mockPrisma.matchTelemetry.findUnique as jest.Mock).mockResolvedValue({
      playerAnalyses: { Player1: { kdRatio: 3.5 } },
    });
    const result = await repo.getCachedAnalyses('match-1');
    expect(result).toEqual({ Player1: { kdRatio: 3.5 } });
  });
});
```

**Step 2: Run test to verify it fails**

```bash
npx jest test/unit/repositories/telemetry.repository.test.ts --no-coverage
```

Expected: FAIL

**Step 3: Create `src/data/repositories/telemetry.repository.ts`**

```typescript
import prisma from '../prisma.client';

export class TelemetryRepository {
  public async saveTelemetry(
    matchId: string,
    rawEvents: unknown[],
    playerAnalyses: Record<string, unknown>
  ): Promise<void> {
    await prisma.matchTelemetry.upsert({
      where: { matchId },
      update: { rawEvents, playerAnalyses },
      create: { matchId, rawEvents, playerAnalyses },
    });
  }

  public async getCachedAnalyses(
    matchId: string
  ): Promise<Record<string, unknown> | null> {
    const row = await prisma.matchTelemetry.findUnique({
      where: { matchId },
      select: { playerAnalyses: true },
    });
    if (!row) return null;
    return row.playerAnalyses as Record<string, unknown>;
  }
}
```

**Step 4: Run tests**

```bash
npx jest test/unit/repositories/telemetry.repository.test.ts --no-coverage
```

Expected: PASS

**Step 5: Commit**

```bash
git add src/data/repositories/telemetry.repository.ts test/unit/repositories/telemetry.repository.test.ts
git commit -m "feat: add telemetry repository with prisma"
```

---

## Task 9: Delete Match Mongoose Model

**Files:**
- Delete: `src/data/models/match.model.ts`

This model is now replaced by the Prisma schema. Nothing imports it except old code.

**Step 1: Verify nothing still imports it**

```bash
grep -r "match.model" src/
```

Expected: no output.

**Step 2: Delete**

```bash
git rm src/data/models/match.model.ts
```

**Step 3: Run all tests**

```bash
npx jest --no-coverage
```

Expected: all pass.

**Step 4: Commit**

```bash
git commit -m "chore: remove mongoose match model"
```

---

## Task 10: Extend PubgStorageService

**Files:**
- Modify: `src/services/pubg-storage.service.ts`

Add `saveMatch()`, `saveTelemetry()`, `getMatch()`, and `getCachedTelemetryAnalyses()` methods. The existing methods stay exactly the same.

**Step 1: Update `src/services/pubg-storage.service.ts`**

Add imports at the top:

```typescript
import { MatchRepository } from '../data/repositories/match.repository';
import { TelemetryRepository } from '../data/repositories/telemetry.repository';
```

Add properties:

```typescript
private matchRepository = new MatchRepository();
private telemetryRepository = new TelemetryRepository();
```

Add new methods (inside the class, after existing methods):

```typescript
//#region Match

public async saveMatch(matchDetails: any): Promise<void> {
  await this.matchRepository.saveMatch(matchDetails);
}

public async getMatch(matchId: string) {
  return this.matchRepository.findMatch(matchId);
}

//#endregion

//#region Telemetry

public async saveTelemetry(
  matchId: string,
  rawEvents: unknown[],
  playerAnalyses: Record<string, unknown>
): Promise<void> {
  await this.telemetryRepository.saveTelemetry(matchId, rawEvents, playerAnalyses);
}

public async getCachedTelemetryAnalyses(
  matchId: string
): Promise<Record<string, unknown> | null> {
  return this.telemetryRepository.getCachedAnalyses(matchId);
}

//#endregion
```

**Step 2: Run all tests**

```bash
npx jest --no-coverage
```

Expected: all pass.

**Step 3: Commit**

```bash
git add src/services/pubg-storage.service.ts
git commit -m "feat: extend pubg storage service with match and telemetry methods"
```

---

## Task 11: Update Config (MongoDB → PostgreSQL)

**Files:**
- Modify: `src/config/config.ts`

**Step 1: Update `src/config/config.ts`**

Change the `database` config block from:

```typescript
database: {
  uri: requireEnv('MONGODB_URI'),
},
```

To:

```typescript
database: {
  url: requireEnv('DATABASE_URL'),
},
```

Update the `AppConfig` interface accordingly:

```typescript
database: {
  url: string;
};
```

Update `validateConfig()` — replace the MongoDB URI check with:

```typescript
if (!appConfig.database.url) {
  throw new Error('DATABASE_URL is required');
}
```

**Step 2: Run all tests**

```bash
npx jest --no-coverage
```

Expected: all pass.

**Step 3: Commit**

```bash
git add src/config/config.ts
git commit -m "feat: replace mongodb uri config with database url for postgres"
```

---

## Task 12: Update Entry Point (src/index.ts)

**Files:**
- Modify: `src/index.ts`

**Step 1: Replace Mongoose connection with Prisma**

Remove:

```typescript
import { connect } from 'mongoose';
```

Add:

```typescript
import prisma from './data/prisma.client';
```

Replace the MongoDB connection block:

```typescript
// OLD
database('Connecting to MongoDB...');
await connect(appConfig.database.uri);
database('Connected to MongoDB successfully');
```

With:

```typescript
database('Connecting to PostgreSQL...');
await prisma.$connect();
database('Connected to PostgreSQL successfully');
```

In `handleShutdown`, before `process.exit(0)`, add:

```typescript
await prisma.$disconnect();
```

**Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

**Step 3: Run all tests**

```bash
npx jest --no-coverage
```

Expected: all pass.

**Step 4: Commit**

```bash
git add src/index.ts
git commit -m "feat: connect to postgres via prisma on startup"
```

---

## Task 13: Wire saveMatch into MatchMonitorService

**Files:**
- Modify: `src/services/match-monitor.service.ts`

In `checkNewMatches()`, after fetching match details and before processing, save the match to DB. This is inside the `for (const matchId of newMatchIds)` loop where `matchDetails` is fetched.

**Step 1: Locate the save point**

In `match-monitor.service.ts`, find this block (around line 193):

```typescript
const matchDetails = await this.pubgClient.matches.getMatch(matchId);
const createdAt = new Date(matchDetails.data.attributes.createdAt);

newMatches.push({
  matchId,
  players: uniqueMatchIds.get(matchId)!,
  createdAt,
});
```

**Step 2: Add save call after fetching**

```typescript
const matchDetails = await this.pubgClient.matches.getMatch(matchId);
const createdAt = new Date(matchDetails.data.attributes.createdAt);

// Persist match data to DB
try {
  await this.storage.saveMatch(matchDetails);
} catch (saveErr) {
  warn(`Failed to save match ${matchId} to DB: ${saveErr}`);
}

newMatches.push({
  matchId,
  players: uniqueMatchIds.get(matchId)!,
  createdAt,
});
```

**Step 3: Run all tests**

```bash
npx jest --no-coverage
```

Expected: all pass.

**Step 4: Commit**

```bash
git add src/services/match-monitor.service.ts
git commit -m "feat: save match data to postgres in match monitor"
```

---

## Task 14: Wire Telemetry Cache into DiscordBotService

**Files:**
- Modify: `src/services/discord-bot.service.ts`

The `createMatchSummaryEmbeds()` method currently always fetches telemetry from the URL. Add a cache check first.

`DiscordBotService` does not currently hold a reference to `PubgStorageService`. We need to inject it.

**Step 1: Add storage to DiscordBotService constructor**

In `discord-bot.service.ts`, find the constructor signature:

```typescript
constructor(apiKey: string, shard: Shard = 'steam')
```

Change to:

```typescript
constructor(
  apiKey: string,
  shard: Shard = 'steam',
  private readonly storage?: PubgStorageService
)
```

Add import at top of file:

```typescript
import { PubgStorageService } from './pubg-storage.service';
```

**Step 2: Update `src/index.ts` to pass storage**

```typescript
// OLD
const discordBot = new DiscordBotService(appConfig.pubg.apiKey, appConfig.pubg.shard as Shard);

// NEW
const discordBot = new DiscordBotService(appConfig.pubg.apiKey, appConfig.pubg.shard as Shard, pubgStorage);
```

**Step 3: Add telemetry cache check in `createMatchSummaryEmbeds()`**

In `createMatchSummaryEmbeds()`, find the block that starts with `if (!summary.telemetryUrl)`. Before the existing `try { const telemetryData = await this.pubgClient.telemetry...` block, add:

```typescript
// Check DB cache first
if (this.storage) {
  try {
    const cached = await this.storage.getCachedTelemetryAnalyses(matchId);
    if (cached) {
      debug(`Using cached telemetry analysis for match ${matchId}`);
      const matchAnalysis: MatchAnalysis = {
        matchId,
        playerAnalyses: new Map(
          Object.entries(cached).map(([name, analysis]) => [name, analysis as PlayerAnalysis])
        ),
        processingTimeMs: 0,
        totalEventsProcessed: 0,
      };
      const enhancedPlayerEmbeds = players.map((player) => {
        const analysis = matchAnalysis.playerAnalyses.get(player.name);
        return analysis
          ? this.createEnhancedPlayerEmbed(player, analysis, matchColor, matchId)
          : this.createBasicPlayerEmbed(player, matchColor, matchId);
      });
      return [mainEmbed, ...enhancedPlayerEmbeds];
    }
  } catch (cacheErr) {
    debug(`Cache lookup failed, falling back to live fetch: ${cacheErr}`);
  }
}
```

After the `processMatchTelemetry()` call, add a save call:

```typescript
// Save to DB cache (non-blocking — don't let save failure break the embed)
if (this.storage) {
  const analysesObj: Record<string, unknown> = {};
  for (const [name, analysis] of matchAnalysis.playerAnalyses) {
    analysesObj[name] = analysis;
  }
  this.storage
    .saveTelemetry(matchId, telemetryData, analysesObj)
    .catch((err) => debug(`Failed to cache telemetry for ${matchId}: ${err}`));
}
```

**Step 4: Run all tests**

```bash
npx jest --no-coverage
```

Expected: all pass.

**Step 5: Commit**

```bash
git add src/services/discord-bot.service.ts src/index.ts
git commit -m "feat: cache telemetry analysis in postgres, use cache in discord bot"
```

---

## Task 15: Update docker-compose.yml

**Files:**
- Modify: `docker-compose.yml`

**Step 1: Replace MongoDB with PostgreSQL**

Replace the file contents with:

```yaml
version: '3.8'

services:
  bot:
    build: .
    environment:
      - NODE_ENV=production
      - DISCORD_TOKEN=${DISCORD_TOKEN}
      - DISCORD_CLIENT_ID=${DISCORD_CLIENT_ID}
      - DISCORD_CHANNEL_ID=${DISCORD_CHANNEL_ID}
      - PUBG_API_KEY=${PUBG_API_KEY}
      - PUBG_API_URL=${PUBG_API_URL:-https://api.pubg.com/shards/}
      - DEFAULT_SHARD=${DEFAULT_SHARD:-steam}
      - DATABASE_URL=postgresql://pubg:pubg@postgres:5432/pubg_tracker
    depends_on:
      postgres:
        condition: service_healthy
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "sh", "-c", "ps aux | grep node | grep -v grep || exit 1"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 30s
    init: true
    logging:
      driver: "json-file"
      options:
        max-size: "10m"
        max-file: "3"

  postgres:
    image: postgres:15
    environment:
      POSTGRES_USER: pubg
      POSTGRES_PASSWORD: pubg
      POSTGRES_DB: pubg_tracker
    volumes:
      - postgres_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U pubg -d pubg_tracker"]
      interval: 10s
      timeout: 5s
      retries: 5
    restart: unless-stopped

volumes:
  postgres_data:
```

**Step 2: Commit**

```bash
git add docker-compose.yml
git commit -m "feat: update docker-compose to use postgres instead of mongodb"
```

---

## Task 16: Add prisma migrate deploy to Dockerfile

**Files:**
- Modify: `Dockerfile`

**Step 1: Read the current Dockerfile**

```bash
cat Dockerfile
```

**Step 2: Add migration step before starting the app**

In the `CMD` or entrypoint, prepend the migration command. If the Dockerfile uses `CMD ["node", "dist/index.js"]`, change it to run migrations first via a shell entrypoint:

```dockerfile
CMD npx prisma migrate deploy && node dist/index.js
```

Or if using a shell script entrypoint, add `npx prisma migrate deploy` as the first command.

Also copy the prisma directory into the image in the build stage:

```dockerfile
COPY prisma ./prisma
```

(Add this before the `npm run build` step.)

**Step 3: Build the Docker image to verify**

```bash
npm run docker:build
```

Expected: build succeeds with no errors.

**Step 4: Commit**

```bash
git add Dockerfile
git commit -m "feat: run prisma migrations on container startup"
```

---

## Task 17: Update .env.example

**Files:**
- Modify: `.env.example` (or `.env` if no example file exists)

**Step 1: Check for example env file**

```bash
ls .env*
```

**Step 2: Update or create `.env.example`**

```bash
# Discord
DISCORD_TOKEN=your_discord_bot_token
DISCORD_CLIENT_ID=your_discord_client_id
DISCORD_CHANNEL_ID=your_discord_channel_id

# PUBG API
PUBG_API_KEY=your_pubg_api_key
PUBG_SHARD=steam

# PostgreSQL (replaces MONGODB_URI)
DATABASE_URL=postgresql://user:password@localhost:5432/pubg_tracker

# Optional
PUBG_MAX_REQUESTS_PER_MINUTE=10
CHECK_INTERVAL_MS=60000
MAX_MATCHES_TO_PROCESS=5
```

**Step 3: Commit**

```bash
git add .env.example
git commit -m "docs: update env example for postgres"
```

---

## Task 18: Final Test Run and Cleanup

**Step 1: Run the full test suite**

```bash
npx jest --no-coverage
```

Expected: all tests pass.

**Step 2: TypeScript typecheck**

```bash
npx tsc --noEmit
```

Expected: no errors.

**Step 3: Lint**

```bash
npm run lint
```

Expected: 0 errors (warnings about unused vars are pre-existing and acceptable).

**Step 4: Verify no remaining mongoose imports**

```bash
grep -r "mongoose" src/ test/
```

Expected: no output.

**Step 5: Final commit**

```bash
git add -A
git commit -m "chore: final cleanup after postgres migration"
```

---

## Summary of Files Changed

| File | Action |
|---|---|
| `prisma/schema.prisma` | Created |
| `prisma/migrations/` | Created (auto-generated) |
| `src/data/prisma.client.ts` | Created |
| `src/data/repositories/player.repository.ts` | Rewritten |
| `src/data/repositories/processed-match.repository.ts` | Rewritten |
| `src/data/repositories/match.repository.ts` | Created |
| `src/data/repositories/telemetry.repository.ts` | Created |
| `src/data/models/player.model.ts` | Deleted |
| `src/data/models/processed-match.model.ts` | Deleted |
| `src/data/models/match.model.ts` | Deleted |
| `src/services/pubg-storage.service.ts` | Extended |
| `src/services/discord-bot.service.ts` | Updated (cache check) |
| `src/services/match-monitor.service.ts` | Updated (saveMatch call) |
| `src/config/config.ts` | Updated (MONGODB_URI → DATABASE_URL) |
| `src/index.ts` | Updated (mongoose → prisma connect) |
| `docker-compose.yml` | Updated |
| `Dockerfile` | Updated |
| `.env.example` | Updated |
| `test/unit/repositories/*.test.ts` | Created |
