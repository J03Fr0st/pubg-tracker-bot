import type { PrismaClient } from '../../../generated/prisma/client';

const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

export interface SeasonCacheKey {
  platform: string;
  seasonId: string;
  gameMode: string;
}

export interface SeasonStats {
  kd: number;
  adr: number;
}

export interface SeasonCacheLookupResult {
  freshStats: Map<string, SeasonStats>;
  missingAccountIds: string[];
}

export interface SeasonCacheWrite extends SeasonStats {
  accountId: string;
  wins: number;
  games: number;
}

export class SeasonCacheRepository {
  public constructor(
    private readonly prisma: PrismaClient,
    private readonly now: () => number = Date.now
  ) {}

  public async findFreshStats(
    key: SeasonCacheKey,
    accountIds: string[]
  ): Promise<SeasonCacheLookupResult> {
    const cutoff = new Date(this.now() - CACHE_TTL_MS);
    const rows = await this.prisma.playerSeasonCache.findMany({
      where: {
        accountId: { in: accountIds },
        platform: key.platform,
        seasonId: key.seasonId,
        gameMode: key.gameMode,
        cachedAt: { gt: cutoff },
      },
      select: { accountId: true, kd: true, adr: true },
    });
    const freshStats = new Map(
      rows.map((row) => [row.accountId, { kd: row.kd, adr: row.adr }])
    );

    return {
      freshStats,
      missingAccountIds: accountIds.filter((accountId) => !freshStats.has(accountId)),
    };
  }

  public async upsertStats(key: SeasonCacheKey, stats: SeasonCacheWrite[]): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const cachedAt = new Date(this.now());
      for (const stat of stats) {
        await tx.playerSeasonCache.upsert({
          where: {
            platform_accountId_seasonId_gameMode: {
              platform: key.platform,
              accountId: stat.accountId,
              seasonId: key.seasonId,
              gameMode: key.gameMode,
            },
          },
          update: {
            kd: stat.kd,
            adr: stat.adr,
            wins: stat.wins,
            games: stat.games,
            cachedAt,
          },
          create: {
            platform: key.platform,
            accountId: stat.accountId,
            seasonId: key.seasonId,
            gameMode: key.gameMode,
            kd: stat.kd,
            adr: stat.adr,
            wins: stat.wins,
            games: stat.games,
            cachedAt,
          },
        });
      }
    });
  }
}
