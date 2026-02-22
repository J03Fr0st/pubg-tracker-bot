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
