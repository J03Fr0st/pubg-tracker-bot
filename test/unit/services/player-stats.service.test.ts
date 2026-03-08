import { PlayerStatsService } from '../../../src/services/player-stats.service';
import { SeasonCacheRepository } from '../../../src/data/repositories/season-cache.repository';
import type { PubgClient } from '@j03fr0st/pubg-ts';

jest.mock('../../../src/data/repositories/season-cache.repository');

describe('PlayerStatsService', () => {
  let service: PlayerStatsService;
  let mockRepo: jest.Mocked<SeasonCacheRepository>;
  let mockPubgClient: any;

  beforeEach(() => {
    mockRepo = new SeasonCacheRepository() as jest.Mocked<SeasonCacheRepository>;
    mockRepo.findByAccountIds = jest.fn().mockResolvedValue([]);
    mockRepo.upsertStats = jest.fn().mockResolvedValue(undefined);

    mockPubgClient = {
      seasons: {
        getCurrentSeason: jest.fn().mockResolvedValue({
          data: [{ id: 'division.bro.official.pc-2018-28', attributes: { isCurrentSeason: true } }],
        }),
      },
      players: {
        getPlayerSeasonStats: jest.fn(),
      },
    };

    service = new PlayerStatsService(mockPubgClient as PubgClient, 'steam', mockRepo);
  });

  describe('getSeasonStats', () => {
    it('returns cached stats when cache is fresh (< 24h)', async () => {
      const freshCache = {
        id: '1',
        platform: 'steam',
        accountId: 'acc-1',
        seasonId: 'division.bro.official.pc-2018-28',
        gameMode: 'squad-fpp',
        kd: 2.5,
        adr: 300,
        wins: 10,
        games: 50,
        cachedAt: new Date(), // fresh
      };
      mockRepo.findByAccountIds.mockResolvedValue([freshCache]);

      const results = await service.getSeasonStats(['acc-1'], 'squad-fpp');

      expect(results.get('acc-1')).toEqual({ kd: 2.5, adr: 300 });
      expect(mockPubgClient.players.getPlayerSeasonStats).not.toHaveBeenCalled();
    });

    it('fetches from API when cache is stale (> 24h)', async () => {
      const staleCache = {
        id: '1',
        platform: 'steam',
        accountId: 'acc-1',
        seasonId: 'division.bro.official.pc-2018-28',
        gameMode: 'squad-fpp',
        kd: 1.0,
        adr: 200,
        wins: 5,
        games: 25,
        cachedAt: new Date(Date.now() - 25 * 60 * 60 * 1000), // 25 hours ago
      };
      mockRepo.findByAccountIds.mockResolvedValue([staleCache]);

      mockPubgClient.players.getPlayerSeasonStats.mockResolvedValue({
        data: [
          {
            attributes: {
              gameModeStats: {
                'squad-fpp': {
                  kills: 100,
                  losses: 40,
                  roundsPlayed: 50,
                  damageDealt: 15000,
                  wins: 10,
                },
              },
            },
          },
        ],
      });

      const results = await service.getSeasonStats(['acc-1'], 'squad-fpp');

      expect(results.get('acc-1')).toEqual({ kd: 2.5, adr: 300 });
      expect(mockPubgClient.players.getPlayerSeasonStats).toHaveBeenCalled();
      expect(mockRepo.upsertStats).toHaveBeenCalled();
    });

    it('fetches from API when no cache exists', async () => {
      mockRepo.findByAccountIds.mockResolvedValue([]);

      mockPubgClient.players.getPlayerSeasonStats.mockResolvedValue({
        data: [
          {
            attributes: {
              gameModeStats: {
                'squad-fpp': {
                  kills: 50,
                  losses: 20,
                  roundsPlayed: 25,
                  damageDealt: 5000,
                  wins: 5,
                },
              },
            },
          },
        ],
      });

      const results = await service.getSeasonStats(['acc-1'], 'squad-fpp');

      expect(results.get('acc-1')).toEqual({ kd: 2.5, adr: 200 });
      expect(mockPubgClient.players.getPlayerSeasonStats).toHaveBeenCalledWith({
        playerId: 'acc-1',
        seasonId: 'division.bro.official.pc-2018-28',
      });
    });

    it('skips players whose API call fails', async () => {
      mockRepo.findByAccountIds.mockResolvedValue([]);

      mockPubgClient.players.getPlayerSeasonStats.mockRejectedValue(new Error('API error'));

      const results = await service.getSeasonStats(['acc-1'], 'squad-fpp');

      expect(results.size).toBe(0);
    });

    it('returns empty map for empty accountIds', async () => {
      const results = await service.getSeasonStats([], 'squad-fpp');
      expect(results.size).toBe(0);
    });
  });
});
