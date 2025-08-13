import { LogPlayerKillV2, LogPlayerMakeGroggy, LogPlayerTakeDamage, LogPlayerRevive } from '@j03fr0st/pubg-ts';

// ONLY create types for our calculated results - not raw events
export interface WeaponStats {
  weaponName: string;
  kills: number;
  knockdowns: number;
  damageDealt: number;
  shotsFired: number;
  hits: number;
  longestKill: number;
  averageDistance: number;
  accuracy: number;        // hits / shotsFired
  lethality: number;       // kills / hits
  efficiency: number;      // kills / shotsFired
}

export interface KillChain {
  startTime: Date;
  kills: LogPlayerKillV2[]; // Use existing type!
  duration: number;
  weaponsUsed: string[];
  averageTimeBetweenKills: number;
}

export interface AssistInfo {
  assistingPlayer: string;
  killedPlayer: string;
  damageDealt: number;
  damagePercentage: number;
  assistType: 'damage' | 'knockdown' | 'both';
  weapon: string;
}

export interface PlayerAnalysis {
  playerName: string;
  // Raw events (use existing types)
  killEvents: LogPlayerKillV2[];
  knockdownEvents: LogPlayerMakeGroggy[];
  damageEvents: LogPlayerTakeDamage[];
  reviveEvents: LogPlayerRevive[];
  // Events where player is the victim
  deathEvents: LogPlayerKillV2[];
  knockedDownEvents: LogPlayerMakeGroggy[];
  // Calculated analytics
  weaponStats: WeaponStats[];
  killChains: KillChain[];
  calculatedAssists: AssistInfo[];
  totalDamageDealt: number;
  totalDamageTaken: number;
  kdRatio: number;
  avgKillDistance: number;
  headshotPercentage: number;
  killsPerMinute: number;
}

export interface MatchAnalysis {
  matchId: string;
  playerAnalyses: Map<string, PlayerAnalysis>;
  processingTimeMs: number;
  totalEventsProcessed: number;
}