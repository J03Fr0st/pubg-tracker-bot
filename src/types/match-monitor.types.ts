export interface MatchMonitorPlayer {
  id: string;
  name: string;
}

export interface MatchMonitorMatchGroup {
  matchId: string;
  players: MatchMonitorPlayer[];
  createdAt: Date;
}
