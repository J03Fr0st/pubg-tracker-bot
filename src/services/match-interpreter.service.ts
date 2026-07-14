import type { MatchResponse, ParticipantStats } from '@j03fr0st/pubg-ts';
import type {
  InterpretedMatch,
  InterpretedRoster,
  MatchParticipant,
  MatchParticipantStats,
  MatchSummary,
  MatchSummaryPlayer,
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
    const participants: MatchParticipant[] = [];
    const rosters: InterpretedRoster[] = [];
    let telemetryUrl: string | undefined;

    for (const item of response.included) {
      switch (item.type) {
        case 'participant': {
          const stats = item.attributes.stats;
          participants.push({
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
    monitoredPlayerNames: readonly string[]
  ): MatchSummary | null {
    const monitoredNames = new Set(monitoredPlayerNames);
    const monitored = match.participants.filter((participant) =>
      monitoredNames.has(participant.name)
    );
    if (monitored.length === 0) {
      return null;
    }

    const monitoredIds = new Set(monitored.map((participant) => participant.participantId));
    const selectedRosterIds = new Set(
      match.rosters
        .filter((roster) => roster.participantIds.some((id) => monitoredIds.has(id)))
        .map((roster) => roster.rosterId)
    );
    const selectedParticipantIds = new Set(
      match.rosters
        .filter((roster) => selectedRosterIds.has(roster.rosterId))
        .flatMap((roster) => roster.participantIds)
    );
    const summaryParticipants = match.participants.filter(
      (participant) =>
        selectedParticipantIds.has(participant.participantId) ||
        monitoredIds.has(participant.participantId)
    );
    const placements = new Set(monitored.map((participant) => participant.stats.winPlace));

    const toSummaryPlayer = (participant: MatchParticipant): MatchSummaryPlayer => ({
      name: participant.name,
      pubgId: participant.pubgId,
      stats: participant.stats,
    });

    return {
      matchId: match.matchId,
      mapName: match.mapName,
      gameMode: match.gameMode,
      playedAt: match.playedAt,
      players: summaryParticipants.map(toSummaryPlayer),
      lobbyPlayers: match.participants.map(toSummaryPlayer),
      ...(placements.size === 1 ? { teamRank: monitored[0].stats.winPlace } : {}),
      ...(match.telemetryUrl === undefined ? {} : { telemetryUrl: match.telemetryUrl }),
    };
  }
}
