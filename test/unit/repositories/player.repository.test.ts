import prisma from '../../../src/data/prisma.client';
import { PlayerRepository } from '../../../src/data/repositories/player.repository';

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

    (mockPrisma.player.upsert as jest.Mock).mockResolvedValue({
      pubgId: 'pubg-123',
      name: 'TestPlayer',
    });

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
