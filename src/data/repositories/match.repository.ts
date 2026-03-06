import prisma from '../prisma.client';

export class MatchRepository {
  public async saveMatch(matchDetails: any): Promise<void> {
    const { data, included } = matchDetails;

    const rosters = included.filter(
      (item: any) =>
        item.type === 'roster' &&
        'relationships' in item &&
        !!item.relationships?.participants?.data
    );

    const participants = included.filter(
      (item: any) =>
        item.type === 'participant' && 'attributes' in item && 'stats' in item.attributes
    );

    const telemetryAsset = included.find((item: any) => item.type === 'asset');
    const telemetryUrl = telemetryAsset?.attributes.URL || '';

    await prisma.$transaction(async (tx) => {
      await tx.match.upsert({
        where: { matchId: data.id },
        update: {},
        create: {
          matchId: data.id,
          gameMode: data.attributes.gameMode,
          mapName: data.attributes.mapName,
          duration: data.attributes.duration,
          isCustomMatch: data.attributes.isCustomMatch ?? false,
          seasonState: data.attributes.seasonState ?? '',
          shardId: data.attributes.shardId,
          telemetryUrl,
          playedAt: new Date(data.attributes.createdAt),
        },
      });

      for (const roster of rosters) {
        const createdRoster = await tx.roster.create({
          data: {
            matchId: data.id,
            rank: roster.attributes?.stats?.rank ?? 0,
            won: roster.attributes?.won === 'true',
          },
        });

        const rosterParticipantIds: string[] =
          roster.relationships?.participants?.data?.map((p: { id: string }) => p.id) ?? [];

        for (const pid of rosterParticipantIds) {
          const p = participants.find((x: any) => x.id === pid);
          if (!p?.attributes?.stats) continue;
          const s = p.attributes.stats;

          await tx.participant.create({
            data: {
              matchId: data.id,
              rosterId: createdRoster.id,
              pubgId: s.playerId ?? '',
              name: s.name,
              kills: s.kills ?? 0,
              DBNOs: s.DBNOs ?? 0,
              damageDealt: s.damageDealt ?? 0,
              headshotKills: s.headshotKills ?? 0,
              assists: s.assists ?? 0,
              revives: s.revives ?? 0,
              timeSurvived: s.timeSurvived ?? 0,
              walkDistance: s.walkDistance ?? 0,
              longestKill: s.longestKill ?? 0,
              winPlace: s.winPlace ?? 0,
              killPlace: s.killPlace ?? 0,
              killStreaks: s.killStreaks ?? 0,
              boosts: s.boosts ?? 0,
              heals: s.heals ?? 0,
              rideDistance: s.rideDistance ?? 0,
              swimDistance: s.swimDistance ?? 0,
              roadKills: s.roadKills ?? 0,
              teamKills: s.teamKills ?? 0,
              vehicleDestroys: s.vehicleDestroys ?? 0,
              weaponsAcquired: s.weaponsAcquired ?? 0,
              deathType: s.deathType ?? '',
            },
          });
        }
      }
    });
  }

  public async findMatch(matchId: string) {
    return prisma.match.findUnique({
      where: { matchId },
      include: { participants: true, rosters: true },
    });
  }

  public async getAllMatchesWithRosters() {
    return prisma.match.findMany({
      include: { participants: true, rosters: true },
      orderBy: { playedAt: 'asc' },
    });
  }
}
