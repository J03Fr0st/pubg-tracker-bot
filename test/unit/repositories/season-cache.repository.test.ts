import { SeasonCacheRepository } from '../../../src/data/repositories/season-cache.repository';

jest.mock('../../../src/data/prisma.client', () => ({
  __esModule: true,
  default: {
    playerSeasonCache: {
      findMany: jest.fn(),
      upsert: jest.fn(),
    },
    $transaction: jest.fn((fn: any) =>
      fn({
        playerSeasonCache: {
          upsert: jest.fn(),
        },
      })
    ),
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
