import type { InterpretedMatch } from './match.types';

export interface MatchMonitorPlayer {
  pubgId: string;
  name: string;
}

export interface MatchMonitorMatchGroup {
  match: InterpretedMatch;
  monitoredPlayers: MatchMonitorPlayer[];
}
