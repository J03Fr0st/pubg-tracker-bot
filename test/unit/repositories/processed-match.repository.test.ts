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
