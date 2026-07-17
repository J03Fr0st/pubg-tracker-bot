import type {
  MatchParticipantStats,
  MatchSummary,
  MatchSummaryParticipant,
} from '../../src/types/match.types';

export const MATCH_PLAYED_AT = new Date('2026-07-14T08:00:00.000Z');

export function makeMatchParticipantStats(
  overrides: Partial<MatchParticipantStats> = {}
): MatchParticipantStats {
  return {
    DBNOs: 0,
    assists: 0,
    boosts: 0,
    damageDealt: 0,
    deathType: 'byplayer',
    headshotKills: 0,
    heals: 0,
    killPlace: 50,
    killStreaks: 0,
    kills: 0,
    longestKill: 0,
    revives: 0,
    rideDistance: 0,
    roadKills: 0,
    swimDistance: 0,
    teamKills: 0,
    timeSurvived: 0,
    vehicleDestroys: 0,
    walkDistance: 0,
    weaponsAcquired: 0,
    winPlace: 50,
    ...overrides,
  };
}

type ParticipantInput = Omit<MatchSummaryParticipant, 'rosterId'> & {
  rosterId?: string | null;
};

type MatchSummaryFixtureInput = Omit<
  MatchSummary,
  'playedAt' | 'rosterParticipants' | 'monitoredPlayers' | 'lobbyParticipants'
> & {
  playedAt?: Date;
  rosterParticipants: ParticipantInput[];
  monitoredPlayers?: ParticipantInput[];
  lobbyParticipants?: ParticipantInput[];
};

function withRosterId(participant: ParticipantInput): MatchSummaryParticipant {
  return {
    ...participant,
    rosterId: participant.rosterId === undefined ? 'roster-1' : participant.rosterId,
  };
}

export function makeMatchSummary(input: MatchSummaryFixtureInput): MatchSummary {
  const rosterParticipants = input.rosterParticipants.map(withRosterId);
  return {
    ...input,
    playedAt: input.playedAt ?? new Date(MATCH_PLAYED_AT.getTime()),
    rosterParticipants,
    monitoredPlayers: (input.monitoredPlayers ?? input.rosterParticipants).map(withRosterId),
    lobbyParticipants: (input.lobbyParticipants ?? input.rosterParticipants).map(withRosterId),
  };
}

export function matchEventAt(offsetSeconds: number): string {
  return new Date(MATCH_PLAYED_AT.getTime() + offsetSeconds * 1000).toISOString();
}
