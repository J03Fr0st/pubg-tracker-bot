import prisma from '../prisma.client';

export interface UpsertRatingData {
  platform: string;
  accountId: string;
  modeKey: string;
  rating: number;
  gamesPlayed: number;
}

export class EloRepository {
  public async findRatingsByAccountIds(
    accountIds: string[],
    platform: string,
    modeKey: string
  ) {
    return prisma.playerRating.findMany({
      where: {
        accountId: { in: accountIds },
        platform,
        modeKey,
      },
    });
  }

  public async upsertRatings(ratings: UpsertRatingData[]): Promise<void> {
    await prisma.$transaction(async (tx) => {
      for (const r of ratings) {
        await tx.playerRating.upsert({
          where: {
            platform_accountId_modeKey: {
              platform: r.platform,
              accountId: r.accountId,
              modeKey: r.modeKey,
            },
          },
          update: {
            rating: r.rating,
            gamesPlayed: r.gamesPlayed,
            lastSeenAt: new Date(),
          },
          create: {
            platform: r.platform,
            accountId: r.accountId,
            modeKey: r.modeKey,
            rating: r.rating,
            gamesPlayed: r.gamesPlayed,
          },
        });
      }
    });
  }

  public async getPlayerRating(accountId: string, platform: string, modeKey: string) {
    return prisma.playerRating.findFirst({
      where: { accountId, platform, modeKey },
    });
  }
}
