export interface MatchStats {
  readonly kills: number;
  readonly damageDealt: number;
  readonly winPlace: number;
  readonly timeSurvived: number;
}

export interface PlayerMatch {
  readonly matchId: string;
  readonly gameMode: string;
  readonly mapName: string;
  readonly createdAt: string;
  readonly stats: MatchStats;
}

export interface Match {
  readonly id: string;
  readonly gameMode: string;
  readonly mapName: string;
  readonly createdAt: string;
  readonly players: Record<string, MatchStats>;
} 