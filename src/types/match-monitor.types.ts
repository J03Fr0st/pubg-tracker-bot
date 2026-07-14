import type { InterpretedMatch } from './match.types';

export interface MatchMonitorPlayer {
  id: string;
  name: string;
}

export interface MatchMonitorMatchGroup {
  match: InterpretedMatch;
  monitoredPlayers: MatchMonitorPlayer[];
}
