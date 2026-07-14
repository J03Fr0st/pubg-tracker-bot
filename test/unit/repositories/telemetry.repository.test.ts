import prisma from '../../../src/data/prisma.client';
import { TelemetryRepository } from '../../../src/data/repositories/telemetry.repository';
import type { MatchAnalysis } from '../../../src/types/analytics-results.types';

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

const makeAnalysis = (): MatchAnalysis => ({
  matchId: 'match-1',
  processingTimeMs: 42,
  totalEventsProcessed: 3,
  playerAnalyses: new Map([
    [
      'Player1',
      {
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

describe('TelemetryRepository', () => {
  const repo = new TelemetryRepository();

  beforeEach(() => jest.clearAllMocks());

  it('writes a versioned cache envelope', async () => {
    (mockPrisma.matchTelemetry.upsert as jest.Mock).mockResolvedValue({});

    await repo.saveTelemetry([{ _T: 'LogMatchStart' } as never], makeAnalysis());

    expect(mockPrisma.matchTelemetry.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { matchId: 'match-1' },
        create: expect.objectContaining({
          matchId: 'match-1',
          playerAnalyses: expect.objectContaining({ version: 1, matchId: 'match-1' }),
        }),
      })
    );
  });

  it('serializes analysis dates in the cache envelope', async () => {
    (mockPrisma.matchTelemetry.upsert as jest.Mock).mockResolvedValue({});

    await repo.saveTelemetry([{ _T: 'LogMatchStart' } as never], makeAnalysis());

    const upsert = (mockPrisma.matchTelemetry.upsert as jest.Mock).mock.calls[0][0];
    expect(upsert.update.playerAnalyses).toEqual(upsert.create.playerAnalyses);
    expect(mockPrisma.matchTelemetry.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({
          playerAnalyses: expect.objectContaining({
            players: {
              Player1: expect.objectContaining({
                matchStartTime: '2026-07-14T08:00:00.000Z',
                killChains: [
                  expect.objectContaining({ startTime: '2026-07-14T08:05:00.000Z' }),
                ],
              }),
            },
          }),
        }),
      })
    );
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

  it('unwraps a versioned cache envelope for the legacy reader', async () => {
    (mockPrisma.matchTelemetry.upsert as jest.Mock).mockResolvedValue({});
    await repo.saveTelemetry([{ _T: 'LogMatchStart' } as never], makeAnalysis());
    const storedEnvelope = (mockPrisma.matchTelemetry.upsert as jest.Mock).mock.calls[0][0].create
      .playerAnalyses;
    (mockPrisma.matchTelemetry.findUnique as jest.Mock).mockResolvedValue({
      playerAnalyses: storedEnvelope,
    });

    const result = await repo.getCachedAnalyses('match-1');

    expect(result).toEqual(
      expect.objectContaining({
        Player1: expect.objectContaining({ playerName: 'Player1' }),
      })
    );
  });
});
