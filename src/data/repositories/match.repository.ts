import type { InterpretedMatch } from '../../types/match.types';
import prisma from '../prisma.client';

export class MatchRepository {
  public async saveMatch(match: InterpretedMatch): Promise<void> {
    await prisma.$transaction(async (tx) => {
      await tx.match.upsert({
        where: { matchId: match.matchId },
        update: {},
        create: {
          matchId: match.matchId,
          gameMode: match.gameMode,
          mapName: match.mapName,
          duration: match.duration,
          isCustomMatch: match.isCustomMatch,
          seasonState: match.seasonState,
          shardId: match.shardId,
          telemetryUrl: match.telemetryUrl ?? '',
          playedAt: match.playedAt,
        },
      });

      await tx.participant.deleteMany({ where: { matchId: match.matchId } });
      await tx.roster.deleteMany({ where: { matchId: match.matchId } });

      const participantsById = new Map(
        match.participants.map((participant) => [participant.participantId, participant])
      );

      for (const roster of match.rosters) {
        const createdRoster = await tx.roster.create({
          data: {
            matchId: match.matchId,
            rank: roster.rank,
            won: roster.won,
          },
        });

        for (const participantId of roster.participantIds) {
          const participant = participantsById.get(participantId);
          if (!participant) continue;

          await tx.participant.create({
            data: {
              matchId: match.matchId,
              rosterId: createdRoster.id,
              pubgId: participant.pubgId,
              name: participant.name,
              kills: participant.stats.kills,
              DBNOs: participant.stats.DBNOs,
              damageDealt: participant.stats.damageDealt,
              headshotKills: participant.stats.headshotKills,
              assists: participant.stats.assists,
              revives: participant.stats.revives,
              timeSurvived: participant.stats.timeSurvived,
              walkDistance: participant.stats.walkDistance,
              longestKill: participant.stats.longestKill,
              winPlace: participant.stats.winPlace,
              killPlace: participant.stats.killPlace,
              killStreaks: participant.stats.killStreaks,
              boosts: participant.stats.boosts,
              heals: participant.stats.heals,
              rideDistance: participant.stats.rideDistance,
              swimDistance: participant.stats.swimDistance,
              roadKills: participant.stats.roadKills,
              teamKills: participant.stats.teamKills,
              vehicleDestroys: participant.stats.vehicleDestroys,
              weaponsAcquired: participant.stats.weaponsAcquired,
              deathType: participant.stats.deathType,
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
