import type { GameMode, PubgClient, Shard } from '@j03fr0st/pubg-ts';
import type {
  SeasonCacheKey,
  SeasonCacheRepository,
  SeasonCacheWrite,
  SeasonStats,
} from '../data/repositories/season-cache.repository';
import { debug, warn } from '../utils/logger';

export type SeasonStatsResult = SeasonStats;

const SEASON_STATS_BATCH_SIZE = 10;

interface PubgModeStats {
  kills?: number;
  losses?: number;
  roundsPlayed?: number;
  damageDealt?: number;
  wins?: number;
}

interface ModeStatsLookupResult {
  accountId: string;
  modeStats?: PubgModeStats;
  availableGameModes: string[];
}

export class PlayerStatsService {
  private currentSeasonId: string | null = null;

  public constructor(
    private readonly pubgClient: PubgClient,
    private readonly platform: Shard,
    private readonly repository: SeasonCacheRepository
  ) {}

  private async ensureSeasonId(): Promise<string> {
    if (this.currentSeasonId) return this.currentSeasonId;

    const response = await this.pubgClient.seasons.getCurrentSeason();
    this.currentSeasonId = response.data[0].id;
    debug(`Current season ID: ${this.currentSeasonId}`);
    return this.currentSeasonId;
  }

  public async getSeasonStats(
    accountIds: string[],
    gameMode: string
  ): Promise<Map<string, SeasonStatsResult>> {
    if (accountIds.length === 0) return new Map();

    const seasonId = await this.ensureSeasonId();
    const key: SeasonCacheKey = {
      platform: this.platform,
      seasonId,
      gameMode,
    };

    debug('Season stats lookup started', {
      platform: this.platform,
      gameMode,
      seasonId,
      accountCount: accountIds.length,
      accountIds,
    });

    const { freshStats: results, missingAccountIds: toFetch } =
      await this.repository.findFreshStats(key, accountIds);

    debug('Season stats cache check complete', {
      requestedCount: accountIds.length,
      freshCount: results.size,
      apiFetchCount: toFetch.length,
    });

    if (toFetch.length === 0) {
      debug('Season stats lookup complete from cache', {
        resultCount: results.size,
      });
      return results;
    }

    debug(`Fetching season stats for ${toFetch.length} players from API`);
    const upserts: SeasonCacheWrite[] = [];

    const batches = this.chunk(toFetch, SEASON_STATS_BATCH_SIZE);
    await Promise.all(
      batches.map((batch) =>
        this.fetchAndStoreBatchStats(batch, seasonId, gameMode, results, upserts)
      )
    );

    debug('Season stats lookup complete', {
      requestedCount: accountIds.length,
      resultCount: results.size,
      apiFetchCount: toFetch.length,
      apiBatchCount: batches.length,
      apiResultCount: upserts.length,
      missingAccountIds: accountIds.filter((id) => !results.has(id)),
    });

    // Cache results
    if (upserts.length > 0) {
      this.repository
        .upsertStats(key, upserts)
        .catch((err) => warn(`Failed to cache season stats: ${err}`));
    }

    return results;
  }

  private async fetchAndStoreBatchStats(
    accountIds: string[],
    seasonId: string,
    gameMode: string,
    results: Map<string, SeasonStatsResult>,
    upserts: SeasonCacheWrite[]
  ): Promise<void> {
    try {
      const statsResults = await this.fetchBatchModeStats(accountIds, seasonId, gameMode);
      for (const { accountId, modeStats, availableGameModes } of statsResults) {
        try {
          if (!modeStats) {
            debug('Season stats missing game mode stats for account', {
              accountId,
              gameMode,
              availableGameModes,
            });
            continue;
          }

          const roundsPlayed = modeStats.roundsPlayed ?? 0;
          if (roundsPlayed === 0) {
            // No games played in this exact mode this season - kd/adr would
            // read as 0, which looks like a weak opponent rather than "no data".
            debug('Season stats has no rounds played for account/gameMode', {
              accountId,
              gameMode,
            });
            continue;
          }

          const kills = modeStats.kills ?? 0;
          const damageDealt = modeStats.damageDealt ?? 0;
          const deaths = modeStats.losses ?? 0;
          const kd = deaths > 0 ? kills / deaths : kills;
          const adr = damageDealt / roundsPlayed;

          const rounded = {
            kd: Math.round(kd * 100) / 100,
            adr: Math.round(adr),
          };

          results.set(accountId, rounded);
          upserts.push({
            accountId,
            kd: rounded.kd,
            adr: rounded.adr,
            wins: modeStats.wins ?? 0,
            games: roundsPlayed,
          });
        } catch (err) {
          warn(`Failed to process season stats for ${accountId}: ${err}`);
        }
      }
    } catch (err) {
      warn(`Failed to fetch season stats batch for ${accountIds.join(', ')}: ${err}`);
    }
  }

  private async fetchBatchModeStats(
    accountIds: string[],
    seasonId: string,
    gameMode: string
  ): Promise<ModeStatsLookupResult[]> {
    const response = await this.pubgClient.players.getPlayerSeasonStatsBatch({
      playerIds: accountIds,
      seasonId,
      gameMode: gameMode as GameMode,
    });

    const playerSeasons = Array.isArray(response.data) ? response.data : [response.data];

    return playerSeasons.map((playerSeason) => {
      const gameModeStats = playerSeason?.attributes?.gameModeStats as
        | Record<string, PubgModeStats>
        | undefined;
      return {
        accountId: playerSeason?.relationships?.player?.data?.id ?? playerSeason?.id ?? '',
        modeStats: gameModeStats?.[gameMode],
        availableGameModes: gameModeStats ? Object.keys(gameModeStats) : [],
      };
    });
  }

  private chunk<T>(items: T[], size: number): T[][] {
    const chunks: T[][] = [];
    for (let index = 0; index < items.length; index += size) {
      chunks.push(items.slice(index, index + size));
    }
    return chunks;
  }
}
