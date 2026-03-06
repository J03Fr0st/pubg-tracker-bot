export interface DiscordPlayerMatchStats {
  name: string;
  pubgId?: string;
  stats?: {
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
    name: string;
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
  };
}

export interface DiscordMatchGroupSummary {
  matchId: string;
  mapName: string;
  gameMode: string;
  playedAt: string;
  players: DiscordPlayerMatchStats[];
  teamRank?: number;
  telemetryUrl?: string;
  eloRatings?: Map<string, { rating: number; change: number }>;
}
