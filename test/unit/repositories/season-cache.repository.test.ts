import type { Prisma, PrismaClient } from '../../../generated/prisma/client';
import { SeasonCacheRepository } from '../../../src/data/repositories/season-cache.repository';

const NOW = Date.parse('2026-07-17T12:00:00.000Z');
const CACHED_AT = new Date('2026-07-17T12:00:00.000Z');
const CUTOFF = new Date('2026-07-16T12:00:00.000Z');
const KEY = {
  platform: 'steam',
  seasonId: 'season-1',
  gameMode: 'squad-fpp',
};
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
    it('queries cachedAt strictly after the 24-hour cutoff and returns domain stats', async () => {
      mockFindMany.mockResolvedValue([
        { accountId: 'acc-1', kd: 2.5, adr: 300 },
      ]);

      const result = await repo.findFreshStats(KEY, ['acc-1', 'acc-2']);

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

    it('preserves requested order when every account is missing or stale', async () => {
      mockFindMany.mockResolvedValue([]);

      await expect(repo.findFreshStats(KEY, ['acc-2', 'acc-1'])).resolves.toEqual({
        freshStats: new Map(),
        missingAccountIds: ['acc-2', 'acc-1'],
      });
    });
  });

  describe('upsertStats', () => {
    it('expands one key and one transaction timestamp across every upsert', async () => {
      await repo.upsertStats(KEY, [
        { accountId: 'acc-1', kd: 2.5, adr: 300, wins: 10, games: 50 },
        { accountId: 'acc-2', kd: 1.25, adr: 175, wins: 2, games: 20 },
      ]);

      expect(mockTransaction).toHaveBeenCalledTimes(1);
      expect(now).toHaveBeenCalledTimes(1);
      expect(mockUpsert).toHaveBeenNthCalledWith(1, {
        where: {
          platform_accountId_seasonId_gameMode: {
            platform: 'steam',
            accountId: 'acc-1',
            seasonId: 'season-1',
            gameMode: 'squad-fpp',
          },
        },
        update: {
          kd: 2.5,
          adr: 300,
          wins: 10,
          games: 50,
          cachedAt: CACHED_AT,
        },
        create: {
          platform: 'steam',
          accountId: 'acc-1',
          seasonId: 'season-1',
          gameMode: 'squad-fpp',
          kd: 2.5,
          adr: 300,
          wins: 10,
          games: 50,
          cachedAt: CACHED_AT,
        },
      });
      expect(mockUpsert).toHaveBeenNthCalledWith(2, {
        where: {
          platform_accountId_seasonId_gameMode: {
            platform: 'steam',
            accountId: 'acc-2',
            seasonId: 'season-1',
            gameMode: 'squad-fpp',
          },
        },
        update: {
          kd: 1.25,
          adr: 175,
          wins: 2,
          games: 20,
          cachedAt: CACHED_AT,
        },
        create: {
          platform: 'steam',
          accountId: 'acc-2',
          seasonId: 'season-1',
          gameMode: 'squad-fpp',
          kd: 1.25,
          adr: 175,
          wins: 2,
          games: 20,
          cachedAt: CACHED_AT,
        },
      });
    });
  });
});
