import type { PrismaClient } from '../../../generated/prisma/client';
import { TelemetryRepository } from '../../../src/data/repositories/telemetry.repository';
import type { MatchAnalysis } from '../../../src/types/analytics-results.types';

const mockPrisma = {
  matchTelemetry: {
    upsert: jest.fn(),
    findUnique: jest.fn(),
  },
} as unknown as PrismaClient;

const PLAYER_ID = 'account.player-1';

const makeAnalysis = (): MatchAnalysis => ({
  matchId: 'match-1',
  processingTimeMs: 42,
  totalEventsProcessed: 3,
  playerAnalyses: new Map([
    [
      PLAYER_ID,
      {
        pubgId: PLAYER_ID,
        playerName: 'Player1',
        matchStartTime: new Date('2026-07-14T08:00:00.000Z'),
        killEvents: [],
        knockdownEvents: [],
        damageEvents: [],
        reviveEvents: [],
        deathEvents: [],
        knockedDownEvents: [],
        weaponStats: [],
        killChains: [
          {
            startTime: new Date('2026-07-14T08:05:00.000Z'),
            kills: [],
            duration: 0,
            weaponsUsed: [],
            averageTimeBetweenKills: 0,
          },
        ],
        calculatedAssists: [],
        totalDamageDealt: 100,
        totalDamageTaken: 50,
        kdRatio: 2,
        avgKillDistance: 0,
        headshotPercentage: 0,
        killsPerMinute: 0,
      },
    ],
  ]),
});

const serializedPlayers = () => ({
  [PLAYER_ID]: {
    ...makeAnalysis().playerAnalyses.get(PLAYER_ID),
    matchStartTime: '2026-07-14T08:00:00.000Z',
    killChains: [
      {
        ...makeAnalysis().playerAnalyses.get(PLAYER_ID)?.killChains[0],
        startTime: '2026-07-14T08:05:00.000Z',
      },
    ],
  },
});

describe('TelemetryRepository', () => {
  const repo = new TelemetryRepository(mockPrisma);

  beforeEach(() => jest.clearAllMocks());

  it('writes a version 2 envelope keyed by PUBG account ID', async () => {
    (mockPrisma.matchTelemetry.upsert as jest.Mock).mockResolvedValue({});

    await repo.saveTelemetry([{ _T: 'LogMatchStart' } as never], makeAnalysis());

    const upsert = (mockPrisma.matchTelemetry.upsert as jest.Mock).mock.calls[0][0];
    expect(upsert.create.playerAnalyses).toMatchObject({
      version: 2,
      matchId: 'match-1',
      players: {
        [PLAYER_ID]: {
          pubgId: PLAYER_ID,
          playerName: 'Player1',
          matchStartTime: '2026-07-14T08:00:00.000Z',
          killChains: [expect.objectContaining({ startTime: '2026-07-14T08:05:00.000Z' })],
        },
      },
    });
    expect(upsert.update.playerAnalyses).toEqual(upsert.create.playerAnalyses);
  });

  it('returns a cache miss when no persisted telemetry exists', async () => {
    (mockPrisma.matchTelemetry.findUnique as jest.Mock).mockResolvedValue(null);

    const result = await repo.getTelemetry('match-xyz');

    expect(result).toEqual({ kind: 'miss' });
    expect(mockPrisma.matchTelemetry.findUnique).toHaveBeenCalledWith({
      where: { matchId: 'match-xyz' },
      select: { rawEvents: true, playerAnalyses: true },
    });
  });

  it('hydrates a version 2 row into an account-keyed analysis map', async () => {
    (mockPrisma.matchTelemetry.findUnique as jest.Mock).mockResolvedValue({
      rawEvents: [{ _T: 'LogMatchStart' }],
      playerAnalyses: {
        version: 2,
        matchId: 'match-1',
        processingTimeMs: 42,
        totalEventsProcessed: 3,
        players: serializedPlayers(),
      },
    });

    const result = await repo.getTelemetry('match-1');

    expect(result.kind).toBe('hit');
    if (result.kind !== 'hit') throw new Error('expected cache hit');
    expect([...result.matchAnalysis.playerAnalyses.keys()]).toEqual([PLAYER_ID]);
    expect(result.matchAnalysis.playerAnalyses.get(PLAYER_ID)).toMatchObject({
      pubgId: PLAYER_ID,
      playerName: 'Player1',
    });
    expect(result.matchAnalysis.playerAnalyses.get(PLAYER_ID)?.matchStartTime).toBeInstanceOf(Date);
    expect(
      result.matchAnalysis.playerAnalyses.get(PLAYER_ID)?.killChains[0].startTime
    ).toBeInstanceOf(Date);
  });

  it.each([
    ['unversioned', serializedPlayers()],
    [
      'unversioned player named version',
      {
        version: {
          ...serializedPlayers()[PLAYER_ID],
          pubgId: 'account.version-player',
          playerName: 'version',
        },
      },
    ],
    [
      'version 1',
      {
        version: 1,
        matchId: 'match-1',
        processingTimeMs: 42,
        totalEventsProcessed: 3,
        players: { Player1: serializedPlayers()[PLAYER_ID] },
      },
    ],
  ])('returns a cache miss for %s identity data', async (_label, playerAnalyses) => {
    (mockPrisma.matchTelemetry.findUnique as jest.Mock).mockResolvedValue({
      rawEvents: [],
      playerAnalyses,
    });

    await expect(repo.getTelemetry('match-1')).resolves.toEqual({ kind: 'miss' });
  });

  it.each([0, 3, 99, 'future'])(
    'classifies unsupported cache version %s as corrupt',
    async (version) => {
      (mockPrisma.matchTelemetry.findUnique as jest.Mock).mockResolvedValue({
        rawEvents: [],
        playerAnalyses: { version },
      });

      await expect(repo.getTelemetry('match-1')).resolves.toEqual({
        kind: 'corrupt',
        reason: `unsupported telemetry cache version ${String(version)}`,
      });
    }
  );

  it.each([
    [
      {
        version: 2,
        matchId: 'match-1',
        processingTimeMs: 0,
        totalEventsProcessed: 0,
        players: [],
      },
      'players must be an object',
    ],
    [
      {
        version: 2,
        matchId: 'match-1',
        processingTimeMs: 0,
        totalEventsProcessed: 0,
        players: {
          [PLAYER_ID]: {
            ...serializedPlayers()[PLAYER_ID],
            matchStartTime: 'not-a-date',
          },
        },
      },
      'invalid matchStartTime',
    ],
  ])('classifies invalid cache data as corrupt', async (playerAnalyses, reason) => {
    (mockPrisma.matchTelemetry.findUnique as jest.Mock).mockResolvedValue({
      rawEvents: [],
      playerAnalyses,
    });

    await expect(repo.getTelemetry('match-1')).resolves.toEqual({ kind: 'corrupt', reason });
  });

  it('classifies raw events without a string _T as corrupt', async () => {
    (mockPrisma.matchTelemetry.findUnique as jest.Mock).mockResolvedValue({
      rawEvents: [{}],
      playerAnalyses: {
        version: 2,
        matchId: 'match-1',
        processingTimeMs: 42,
        totalEventsProcessed: 3,
        players: serializedPlayers(),
      },
    });

    await expect(repo.getTelemetry('match-1')).resolves.toEqual({
      kind: 'corrupt',
      reason: 'rawEvents entries must contain a string _T',
    });
  });

  it.each([
    ['pubgId', 'account.wrong', `player key ${PLAYER_ID} does not match pubgId account.wrong`],
    ['killEvents', {}, 'killEvents must be an array'],
    ['knockdownEvents', {}, 'knockdownEvents must be an array'],
    ['damageEvents', {}, 'damageEvents must be an array'],
    ['reviveEvents', {}, 'reviveEvents must be an array'],
    ['deathEvents', {}, 'deathEvents must be an array'],
    ['knockedDownEvents', {}, 'knockedDownEvents must be an array'],
    ['weaponStats', {}, 'weaponStats must be an array'],
    ['killChains', {}, 'killChains must be an array'],
    ['calculatedAssists', {}, 'calculatedAssists must be an array'],
    ['totalDamageDealt', Number.POSITIVE_INFINITY, 'totalDamageDealt must be a finite number'],
    ['totalDamageTaken', Number.POSITIVE_INFINITY, 'totalDamageTaken must be a finite number'],
    ['kdRatio', Number.POSITIVE_INFINITY, 'kdRatio must be a finite number'],
    ['avgKillDistance', Number.POSITIVE_INFINITY, 'avgKillDistance must be a finite number'],
    ['headshotPercentage', Number.POSITIVE_INFINITY, 'headshotPercentage must be a finite number'],
    ['killsPerMinute', Number.POSITIVE_INFINITY, 'killsPerMinute must be a finite number'],
  ])('classifies an invalid %s player field as corrupt', async (field, invalidValue, reason) => {
    (mockPrisma.matchTelemetry.findUnique as jest.Mock).mockResolvedValue({
      rawEvents: [],
      playerAnalyses: {
        version: 2,
        matchId: 'match-1',
        processingTimeMs: 42,
        totalEventsProcessed: 3,
        players: {
          [PLAYER_ID]: { ...serializedPlayers()[PLAYER_ID], [field]: invalidValue },
        },
      },
    });

    await expect(repo.getTelemetry('match-1')).resolves.toEqual({ kind: 'corrupt', reason });
  });

  it.each([
    ['kills', {}, 'kill chain kills must be an array'],
    ['weaponsUsed', {}, 'kill chain weaponsUsed must be an array'],
    ['weaponsUsed', [42], 'kill chain weaponsUsed must contain strings'],
    ['duration', Number.POSITIVE_INFINITY, 'kill chain duration must be a finite number'],
    [
      'averageTimeBetweenKills',
      Number.POSITIVE_INFINITY,
      'kill chain averageTimeBetweenKills must be a finite number',
    ],
  ])(
    'classifies an invalid %s kill-chain field as corrupt',
    async (field, invalidValue, reason) => {
      const player = serializedPlayers()[PLAYER_ID];
      (mockPrisma.matchTelemetry.findUnique as jest.Mock).mockResolvedValue({
        rawEvents: [],
        playerAnalyses: {
          version: 2,
          matchId: 'match-1',
          processingTimeMs: 42,
          totalEventsProcessed: 3,
          players: {
            [PLAYER_ID]: {
              ...player,
              killChains: [{ ...player.killChains[0], [field]: invalidValue }],
            },
          },
        },
      });

      await expect(repo.getTelemetry('match-1')).resolves.toEqual({ kind: 'corrupt', reason });
    }
  );
});
