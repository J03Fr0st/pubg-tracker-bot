import type { PubgClient } from '@j03fr0st/pubg-ts';
import { SeasonCacheRepository } from '../../../src/data/repositories/season-cache.repository';
import { PlayerStatsService } from '../../../src/services/player-stats.service';

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
        getPlayerSeasonStatsBatch: jest.fn(),
      },
    };

    service = new PlayerStatsService(mockPubgClient as PubgClient, 'steam', mockRepo);
  });

  describe('getSeasonStats', () => {
    const seasonStatsResponse = (
      accountId: string,
      overrides: Partial<{
        kills: number;
        losses: number;
        roundsPlayed: number;
        damageDealt: number;
        wins: number;
      }> = {}
    ) => ({
      type: 'playerSeason',
      id: accountId,
      attributes: {
        bestRankPoint: 0,
        gameModeStats: {
          'squad-fpp': {
            kills: overrides.kills ?? 50,
            losses: overrides.losses ?? 20,
            roundsPlayed: overrides.roundsPlayed ?? 25,
            damageDealt: overrides.damageDealt ?? 5000,
            wins: overrides.wins ?? 5,
          },
        },
      },
      relationships: {
        player: { data: { type: 'player', id: accountId } },
        season: { data: { type: 'season', id: 'division.bro.official.pc-2018-28' } },
      },
    });

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
      expect(mockPubgClient.players.getPlayerSeasonStatsBatch).not.toHaveBeenCalled();
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

      mockPubgClient.players.getPlayerSeasonStatsBatch.mockResolvedValue({
        data: [
          seasonStatsResponse('acc-1', {
            kills: 100,
            losses: 40,
            roundsPlayed: 50,
            damageDealt: 15000,
            wins: 10,
          }),
        ],
      });

      const results = await service.getSeasonStats(['acc-1'], 'squad-fpp');

      expect(results.get('acc-1')).toEqual({ kd: 2.5, adr: 300 });
      expect(mockPubgClient.players.getPlayerSeasonStatsBatch).toHaveBeenCalled();
      expect(mockRepo.upsertStats).toHaveBeenCalled();
    });

    it('fetches from API when no cache exists', async () => {
      mockRepo.findByAccountIds.mockResolvedValue([]);

      mockPubgClient.players.getPlayerSeasonStatsBatch.mockResolvedValue({
        data: [seasonStatsResponse('acc-1')],
      });

      const results = await service.getSeasonStats(['acc-1'], 'squad-fpp');

      expect(results.get('acc-1')).toEqual({ kd: 2.5, adr: 200 });
      expect(mockPubgClient.players.getPlayerSeasonStatsBatch).toHaveBeenCalledWith({
        playerIds: ['acc-1'],
        seasonId: 'division.bro.official.pc-2018-28',
        gameMode: 'squad-fpp',
      });
    });

    it('skips players with no rounds played in the requested game mode', async () => {
      mockRepo.findByAccountIds.mockResolvedValue([]);

      mockPubgClient.players.getPlayerSeasonStatsBatch.mockResolvedValue({
        data: [
          seasonStatsResponse('acc-1', {
            kills: 0,
            losses: 0,
            roundsPlayed: 0,
            damageDealt: 0,
            wins: 0,
          }),
        ],
      });

      const results = await service.getSeasonStats(['acc-1'], 'squad-fpp');

      expect(results.has('acc-1')).toBe(false);
      expect(mockRepo.upsertStats).not.toHaveBeenCalled();
    });

    it('skips players whose API call fails', async () => {
      mockRepo.findByAccountIds.mockResolvedValue([]);

      mockPubgClient.players.getPlayerSeasonStatsBatch.mockRejectedValue(new Error('API error'));

      const results = await service.getSeasonStats(['acc-1'], 'squad-fpp');

      expect(results.size).toBe(0);
    });

    it('chunks missing season stats into batches of 10', async () => {
      mockRepo.findByAccountIds.mockResolvedValue([]);
      mockPubgClient.players.getPlayerSeasonStatsBatch.mockImplementation(
        async ({ playerIds }: { playerIds: string[] }) => {
          return {
            data: playerIds.map((accountId) => seasonStatsResponse(accountId)),
          };
        }
      );

      const accountIds = Array.from({ length: 11 }, (_, index) => `acc-${index + 1}`);
      const results = await service.getSeasonStats(accountIds, 'squad-fpp');

      expect(results.size).toBe(11);
      expect(mockPubgClient.players.getPlayerSeasonStatsBatch).toHaveBeenCalledTimes(2);
      expect(mockPubgClient.players.getPlayerSeasonStatsBatch).toHaveBeenNthCalledWith(1, {
        playerIds: accountIds.slice(0, 10),
        seasonId: 'division.bro.official.pc-2018-28',
        gameMode: 'squad-fpp',
      });
      expect(mockPubgClient.players.getPlayerSeasonStatsBatch).toHaveBeenNthCalledWith(2, {
        playerIds: accountIds.slice(10),
        seasonId: 'division.bro.official.pc-2018-28',
        gameMode: 'squad-fpp',
      });
    });

    it('returns empty map for empty accountIds', async () => {
      const results = await service.getSeasonStats([], 'squad-fpp');
      expect(results.size).toBe(0);
    });
  });
});
