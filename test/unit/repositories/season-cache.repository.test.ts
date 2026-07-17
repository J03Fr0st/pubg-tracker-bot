import type { Prisma, PrismaClient } from '../../../generated/prisma/client';
import { SeasonCacheRepository } from '../../../src/data/repositories/season-cache.repository';

const NOW = Date.parse('2026-07-17T12:00:00.000Z');
const CUTOFF = new Date('2026-07-16T12:00:00.000Z');
const mockFindMany = jest.fn();
const mockUpsert = jest.fn();
const transactionClient = {
  playerSeasonCache: { upsert: mockUpsert },
} as unknown as Prisma.TransactionClient;
const mockTransaction = jest.fn(
  (operation: (tx: Prisma.TransactionClient) => Promise<unknown>) =>
    operation(transactionClient)
);
const mockPrisma = {
  playerSeasonCache: { findMany: mockFindMany },
  $transaction: mockTransaction,
} as unknown as PrismaClient;

describe('SeasonCacheRepository', () => {
  const now = jest.fn(() => NOW);
  let repo: SeasonCacheRepository;

  beforeEach(() => {
    jest.clearAllMocks();
    repo = new SeasonCacheRepository(mockPrisma, now);
  });

  describe('findFreshStats', () => {
    it('queries only rows newer than 24 hours and converts them to stats plus missing IDs', async () => {
      mockFindMany.mockResolvedValue([
        { accountId: 'acc-1', kd: 2.5, adr: 300 },
      ]);

      const result = await repo.findFreshStats(
        { platform: 'steam', seasonId: 'season-1', gameMode: 'squad-fpp' },
        ['acc-1', 'acc-2']
      );

      expect(mockFindMany).toHaveBeenCalledWith({
        where: {
          accountId: { in: ['acc-1', 'acc-2'] },
          platform: 'steam',
          seasonId: 'season-1',
          gameMode: 'squad-fpp',
          cachedAt: { gt: CUTOFF },
        },
        select: { accountId: true, kd: true, adr: true },
      });
      expect(result).toEqual({
        freshStats: new Map([['acc-1', { kd: 2.5, adr: 300 }]]),
        missingAccountIds: ['acc-2'],
      });
      expect(now).toHaveBeenCalledTimes(1);
    });

    it('reports every requested account as missing when no fresh row is returned', async () => {
      mockFindMany.mockResolvedValue([]);

      await expect(
        repo.findFreshStats(
          { platform: 'steam', seasonId: 'season-1', gameMode: 'solo-fpp' },
          ['acc-2', 'acc-1']
        )
      ).resolves.toEqual({
        freshStats: new Map(),
        missingAccountIds: ['acc-2', 'acc-1'],
      });
    });
  });

  describe('upsertStats', () => {
    it('retains the existing write behavior until the centralized write task', async () => {
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

      expect(mockTransaction).toHaveBeenCalledTimes(1);
      expect(mockUpsert).toHaveBeenCalledTimes(1);
    });
  });
});
