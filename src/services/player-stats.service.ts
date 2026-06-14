import type { PubgClient } from '@j03fr0st/pubg-ts';
import {
  SeasonCacheRepository,
  type UpsertSeasonCacheData,
} from '../data/repositories/season-cache.repository';
import { debug, info, warn } from '../utils/logger';

export interface SeasonStatsResult {
  kd: number;
  adr: number;
}

const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

interface PubgModeStats {
  kills?: number;
  losses?: number;
  roundsPlayed?: number;
  damageDealt?: number;
  wins?: number;
}

interface ModeStatsLookupResult {
  modeStats?: PubgModeStats;
  availableGameModes: string[];
}

export class PlayerStatsService {
  private readonly repository: SeasonCacheRepository;
  private readonly pubgClient: PubgClient;
  private readonly platform: string;
  private currentSeasonId: string | null = null;

  constructor(pubgClient: PubgClient, platform: string, repository?: SeasonCacheRepository) {
    this.pubgClient = pubgClient;
    this.platform = platform;
    this.repository = repository ?? new SeasonCacheRepository();
  }

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
    const results = new Map<string, SeasonStatsResult>();
    if (accountIds.length === 0) return results;

    const seasonId = await this.ensureSeasonId();
    const now = Date.now();

    info('Season stats lookup started', {
      platform: this.platform,
      gameMode,
      seasonId,
      accountCount: accountIds.length,
      accountIds,
    });

    // Check cache
    const cached = await this.repository.findByAccountIds(
      accountIds,
      this.platform,
      seasonId,
      gameMode
    );

    const freshIds = new Set<string>();
    for (const entry of cached) {
      const age = now - new Date(entry.cachedAt).getTime();
      if (age < CACHE_TTL_MS) {
        results.set(entry.accountId, { kd: entry.kd, adr: entry.adr });
        freshIds.add(entry.accountId);
      }
    }

    // Fetch missing/stale from API
    const toFetch = accountIds.filter((id) => !freshIds.has(id));
    info('Season stats cache check complete', {
      requestedCount: accountIds.length,
      cachedCount: cached.length,
      freshCount: freshIds.size,
      apiFetchCount: toFetch.length,
    });

    if (toFetch.length === 0) {
      info('Season stats lookup complete from cache', {
        resultCount: results.size,
      });
      return results;
    }

    debug(`Fetching season stats for ${toFetch.length} players from API`);
    const upserts: UpsertSeasonCacheData[] = [];

    for (const accountId of toFetch) {
      try {
        const { modeStats, availableGameModes } = await this.fetchModeStats(
          accountId,
          seasonId,
          gameMode
        );
        if (!modeStats) {
          warn('Season stats missing game mode stats for account', {
            accountId,
            gameMode,
            availableGameModes,
          });
          continue;
        }

        const kills = modeStats.kills ?? 0;
        const damageDealt = modeStats.damageDealt ?? 0;
        const deaths = modeStats.losses ?? 0;
        const kd = deaths > 0 ? kills / deaths : kills;
        const roundsPlayed = modeStats.roundsPlayed ?? 0;
        const adr = roundsPlayed > 0 ? damageDealt / roundsPlayed : 0;

        const rounded = {
          kd: Math.round(kd * 100) / 100,
          adr: Math.round(adr),
        };

        results.set(accountId, rounded);
        info('Season stats fetched for account', {
          accountId,
          gameMode,
          kd: rounded.kd,
          adr: rounded.adr,
          roundsPlayed,
        });
        upserts.push({
          platform: this.platform,
          accountId,
          seasonId,
          gameMode,
          kd: rounded.kd,
          adr: rounded.adr,
          wins: modeStats.wins ?? 0,
          games: roundsPlayed,
        });
      } catch (err) {
        warn(`Failed to fetch season stats for ${accountId}: ${err}`);
      }
    }

    info('Season stats lookup complete', {
      requestedCount: accountIds.length,
      resultCount: results.size,
      apiFetchCount: toFetch.length,
      apiResultCount: upserts.length,
      missingAccountIds: accountIds.filter((id) => !results.has(id)),
    });

    // Cache results
    if (upserts.length > 0) {
      this.repository
        .upsertStats(upserts)
        .catch((err) => warn(`Failed to cache season stats: ${err}`));
    }

    return results;
  }

  private async fetchModeStats(
    accountId: string,
    seasonId: string,
    gameMode: string
  ): Promise<ModeStatsLookupResult> {
    const response = await this.pubgClient.players.getPlayerSeasonStats({
      playerId: accountId,
      seasonId,
    });

    const data = Array.isArray(response.data) ? response.data[0] : response.data;
    const gameModeStats = data?.attributes?.gameModeStats as
      | Record<string, PubgModeStats>
      | undefined;

    return {
      modeStats: gameModeStats?.[gameMode],
      availableGameModes: gameModeStats ? Object.keys(gameModeStats) : [],
    };
  }
}
