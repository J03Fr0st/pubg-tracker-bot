import type { MatchResponse, ParticipantStats } from '@j03fr0st/pubg-ts';
import type {
  InterpretedMatch,
  InterpretedRoster,
  MatchParticipant,
  MatchParticipantStats,
  MatchSummary,
  MatchSummaryParticipant,
} from '../types/match.types';

function interpretStats(stats: ParticipantStats): MatchParticipantStats {
  return {
    DBNOs: stats.DBNOs ?? 0,
    assists: stats.assists ?? 0,
    boosts: stats.boosts ?? 0,
    damageDealt: stats.damageDealt ?? 0,
    deathType: stats.deathType ?? '',
    headshotKills: stats.headshotKills ?? 0,
    heals: stats.heals ?? 0,
    killPlace: stats.killPlace ?? 0,
    killStreaks: stats.killStreaks ?? 0,
    kills: stats.kills ?? 0,
    longestKill: stats.longestKill ?? 0,
    revives: stats.revives ?? 0,
    rideDistance: stats.rideDistance ?? 0,
    roadKills: stats.roadKills ?? 0,
    swimDistance: stats.swimDistance ?? 0,
    teamKills: stats.teamKills ?? 0,
    timeSurvived: stats.timeSurvived ?? 0,
    vehicleDestroys: stats.vehicleDestroys ?? 0,
    walkDistance: stats.walkDistance ?? 0,
    weaponsAcquired: stats.weaponsAcquired ?? 0,
    winPlace: stats.winPlace ?? 0,
  };
}

export class MatchInterpreter {
  public interpret(response: MatchResponse): InterpretedMatch {
    const participantRecords: Array<Omit<MatchParticipant, 'rosterId'>> = [];
    const rosters: InterpretedRoster[] = [];
    let telemetryUrl: string | undefined;

    for (const item of response.included) {
      switch (item.type) {
        case 'participant': {
          const stats = item.attributes.stats;
          participantRecords.push({
            participantId: item.id,
            pubgId: stats.playerId,
            name: stats.name,
            stats: interpretStats(stats),
          });
          break;
        }
        case 'roster':
          rosters.push({
            rosterId: item.id,
            rank: item.attributes.stats.rank,
            won: item.attributes.won === 'true',
            participantIds: item.relationships.participants.data.map(
              (participant) => participant.id
            ),
          });
          break;
        case 'asset':
          telemetryUrl ??= item.attributes.URL;
          break;
      }
    }

    const rosterIdByParticipantId = new Map<string, string>();
    for (const roster of rosters) {
      for (const participantId of roster.participantIds) {
        rosterIdByParticipantId.set(participantId, roster.rosterId);
      }
    }
    const participants: MatchParticipant[] = participantRecords.map((participant) => ({
      ...participant,
      rosterId: rosterIdByParticipantId.get(participant.participantId) ?? null,
    }));

    return {
      matchId: response.data.id,
      gameMode: response.data.attributes.gameMode,
      mapName: response.data.attributes.mapName,
      duration: response.data.attributes.duration,
      isCustomMatch: response.data.attributes.isCustomMatch,
      seasonState: response.data.attributes.seasonState,
      shardId: response.data.attributes.shardId,
      ...(telemetryUrl === undefined ? {} : { telemetryUrl }),
      playedAt: new Date(response.data.attributes.createdAt),
      participants,
      rosters,
    };
  }

  public createSummary(
    match: InterpretedMatch,
    monitoredPlayerPubgIds: readonly string[]
  ): MatchSummary | null {
    const monitoredPubgIds = new Set(monitoredPlayerPubgIds);
    const monitored = match.participants.filter((participant) =>
      monitoredPubgIds.has(participant.pubgId)
    );
    if (monitored.length === 0) {
      return null;
    }

    const selectedRosterIds = new Set(
      monitored
        .map((participant) => participant.rosterId)
        .filter((rosterId): rosterId is string => rosterId !== null)
    );
    const monitoredIds = new Set(monitored.map((participant) => participant.pubgId));
    const rosterParticipants = match.participants.filter(
      (participant) =>
        monitoredIds.has(participant.pubgId) ||
        (participant.rosterId !== null && selectedRosterIds.has(participant.rosterId))
    );
    const placements = new Set(monitored.map((participant) => participant.stats.winPlace));
    const toSummaryParticipant = (participant: MatchParticipant): MatchSummaryParticipant => ({
      pubgId: participant.pubgId,
      name: participant.name,
      rosterId: participant.rosterId,
      stats: participant.stats,
    });

    return {
      matchId: match.matchId,
      mapName: match.mapName,
      gameMode: match.gameMode,
      playedAt: match.playedAt,
      rosterParticipants: rosterParticipants.map(toSummaryParticipant),
      monitoredPlayers: monitored.map(toSummaryParticipant),
      lobbyParticipants: match.participants.map(toSummaryParticipant),
      ...(placements.size === 1 ? { teamRank: monitored[0].stats.winPlace } : {}),
      ...(match.telemetryUrl === undefined ? {} : { telemetryUrl: match.telemetryUrl }),
    };
  }
}
