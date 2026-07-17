import type { PubgClient } from '@j03fr0st/pubg-ts';
import {
  type SeasonCacheKey,
  type SeasonCacheLookupResult,
  SeasonCacheRepository,
} from '../../../src/data/repositories/season-cache.repository';
import { PlayerStatsService } from '../../../src/services/player-stats.service';

jest.mock('../../../src/data/repositories/season-cache.repository');

function cacheMiss(...accountIds: string[]): SeasonCacheLookupResult {
  return { freshStats: new Map(), missingAccountIds: accountIds };
}

describe('PlayerStatsService', () => {
  let service: PlayerStatsService;
  let mockRepo: jest.Mocked<SeasonCacheRepository>;
  let mockPubgClient: {
    seasons: { getCurrentSeason: jest.Mock };
    players: {
      getPlayerSeasonStats: jest.Mock;
      getPlayerSeasonStatsBatch: jest.Mock;
    };
  };

  beforeEach(() => {
    mockRepo = new SeasonCacheRepository({} as never) as jest.Mocked<SeasonCacheRepository>;
    mockRepo.findFreshStats = jest.fn().mockImplementation(
      async (_key: SeasonCacheKey, accountIds: string[]) => cacheMiss(...accountIds)
    );
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

    service = new PlayerStatsService(mockPubgClient as unknown as PubgClient, 'steam', mockRepo);
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

    it('returns fresh repository stats without calling the PUBG stats API', async () => {
      mockRepo.findFreshStats.mockResolvedValue({
        freshStats: new Map([['acc-1', { kd: 2.5, adr: 300 }]]),
        missingAccountIds: [],
      });

      const results = await service.getSeasonStats(['acc-1'], 'squad-fpp');

      expect(mockRepo.findFreshStats).toHaveBeenCalledWith(
        {
          platform: 'steam',
          seasonId: 'division.bro.official.pc-2018-28',
          gameMode: 'squad-fpp',
        },
        ['acc-1']
      );
      expect(results).toEqual(new Map([['acc-1', { kd: 2.5, adr: 300 }]]));
      expect(mockPubgClient.players.getPlayerSeasonStats).not.toHaveBeenCalled();
      expect(mockPubgClient.players.getPlayerSeasonStatsBatch).not.toHaveBeenCalled();
    });

    it('fetches only account IDs the repository reports as missing', async () => {
      mockRepo.findFreshStats.mockResolvedValue({
        freshStats: new Map([['acc-1', { kd: 1.5, adr: 250 }]]),
        missingAccountIds: ['acc-2'],
      });
      mockPubgClient.players.getPlayerSeasonStatsBatch.mockResolvedValue({
        data: [
          seasonStatsResponse('acc-2', {
            kills: 100,
            losses: 40,
            roundsPlayed: 50,
            damageDealt: 15000,
            wins: 10,
          }),
        ],
      });

      const results = await service.getSeasonStats(['acc-1', 'acc-2'], 'squad-fpp');

      expect(results).toEqual(
        new Map([
          ['acc-1', { kd: 1.5, adr: 250 }],
          ['acc-2', { kd: 2.5, adr: 300 }],
        ])
      );
      expect(mockPubgClient.players.getPlayerSeasonStatsBatch).toHaveBeenCalledWith({
        playerIds: ['acc-2'],
        seasonId: 'division.bro.official.pc-2018-28',
        gameMode: 'squad-fpp',
      });
    });

    it('fetches from API when the repository reports an account as missing', async () => {
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
      mockPubgClient.players.getPlayerSeasonStatsBatch.mockRejectedValue(new Error('API error'));

      const results = await service.getSeasonStats(['acc-1'], 'squad-fpp');

      expect(results.size).toBe(0);
    });

    it('chunks missing season stats into batches of 10', async () => {
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
