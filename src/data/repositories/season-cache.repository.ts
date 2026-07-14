import type { PrismaClient } from '../../../generated/prisma/client';

export interface UpsertSeasonCacheData {
  platform: string;
  accountId: string;
  seasonId: string;
  gameMode: string;
  kd: number;
  adr: number;
  wins: number;
  games: number;
}

export class SeasonCacheRepository {
  public constructor(private readonly prisma: PrismaClient) {}

  public async findByAccountIds(
    accountIds: string[],
    platform: string,
    seasonId: string,
    gameMode: string
  ) {
    return this.prisma.playerSeasonCache.findMany({
      where: {
        accountId: { in: accountIds },
        platform,
        seasonId,
        gameMode,
      },
    });
  }

  public async upsertStats(stats: UpsertSeasonCacheData[]): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      for (const s of stats) {
        await tx.playerSeasonCache.upsert({
          where: {
            platform_accountId_seasonId_gameMode: {
              platform: s.platform,
              accountId: s.accountId,
              seasonId: s.seasonId,
              gameMode: s.gameMode,
            },
          },
          update: {
            kd: s.kd,
            adr: s.adr,
            wins: s.wins,
            games: s.games,
            cachedAt: new Date(),
          },
          create: {
            platform: s.platform,
            accountId: s.accountId,
            seasonId: s.seasonId,
            gameMode: s.gameMode,
            kd: s.kd,
            adr: s.adr,
            wins: s.wins,
            games: s.games,
          },
        });
      }
    });
  }
}
