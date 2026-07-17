export interface MatchParticipantStats {
  DBNOs: number;
  assists: number;
  boosts: number;
  damageDealt: number;
  deathType: string;
  headshotKills: number;
  heals: number;
  killPlace: number;
  killStreaks: number;
  kills: number;
  longestKill: number;
  revives: number;
  rideDistance: number;
  roadKills: number;
  swimDistance: number;
  teamKills: number;
  timeSurvived: number;
  vehicleDestroys: number;
  walkDistance: number;
  weaponsAcquired: number;
  winPlace: number;
}

export interface MatchPlayerIdentity {
  pubgId: string;
  name: string;
  rosterId: string | null;
}

export interface MatchParticipant extends MatchPlayerIdentity {
  participantId: string;
  stats: MatchParticipantStats;
}

export interface InterpretedRoster {
  rosterId: string;
  rank: number;
  won: boolean;
  participantIds: string[];
}

export interface InterpretedMatch {
  matchId: string;
  gameMode: string;
  mapName: string;
  duration: number;
  isCustomMatch: boolean;
  seasonState: string;
  shardId: string;
  telemetryUrl?: string;
  playedAt: Date;
  participants: MatchParticipant[];
  rosters: InterpretedRoster[];
}

export interface MatchSummaryParticipant extends MatchPlayerIdentity {
  stats: MatchParticipantStats;
}

export interface MatchSummary {
  matchId: string;
  mapName: string;
  gameMode: string;
  playedAt: Date;
  rosterParticipants: MatchSummaryParticipant[];
  monitoredPlayers: MatchSummaryParticipant[];
  lobbyParticipants: MatchSummaryParticipant[];
  teamRank?: number;
  telemetryUrl?: string;
}
