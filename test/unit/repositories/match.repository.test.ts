import prisma from '../../../src/data/prisma.client';
import { MatchRepository } from '../../../src/data/repositories/match.repository';

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
          kills: 3,
          DBNOs: 2,
          damageDealt: 450.5,
          headshotKills: 1,
          assists: 1,
          revives: 0,
          timeSurvived: 1500,
          walkDistance: 2000,
          longestKill: 150,
          winPlace: 3,
          killPlace: 5,
          killStreaks: 2,
          boosts: 3,
          heals: 2,
          rideDistance: 0,
          swimDistance: 0,
          roadKills: 0,
          teamKills: 0,
          vehicleDestroys: 0,
          weaponsAcquired: 4,
          deathType: 'byplayer',
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
