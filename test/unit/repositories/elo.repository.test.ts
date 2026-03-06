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
