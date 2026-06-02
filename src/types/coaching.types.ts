export type CoachingCategory =
  | 'decisive-mistake'
  | 'player-fingerprint'
  | 'pattern'
  | 'fight-reset'
  | 'team-spacing'
  | 'damage-conversion'
  | 'weapon-range'
  | 'rotation'
  | 'survival';

export type CoachingRating = 'low' | 'medium' | 'high';

export type CoachingInsightKind = 'decisive-mistake' | 'pattern' | 'player-fingerprint';

export type FightOutcome = 'knock' | 'death';

export interface TelemetryPosition {
  x: number;
  y: number;
  z?: number;
}

export interface FightContextClaim {
  text: string;
  confidence: CoachingRating;
  evidence: string[];
}

export interface FightDamageEvent {
  timestamp: Date;
  matchTimeSeconds: number;
  attackerName?: string;
  victimName?: string;
  damage: number;
  position?: TelemetryPosition;
}

export interface FightResetEvent {
  timestamp: Date;
  matchTimeSeconds: number;
  itemId?: string;
  healAmount?: number;
}

export interface ZonePressureEvidence {
  damage: number;
  events: FightDamageEvent[];
  windowSeconds: number;
}

export interface FightContext {
  playerName: string;
  enemyName?: string;
  outcome: FightOutcome;
  timestamp: Date;
  matchTimeSeconds: number;
  decisiveWeapon?: string;
  decisiveDamageTypeCategory?: string;
  decisiveDamageReason?: string;
  killerName?: string;
  finisherName?: string;
  damageTaken: FightDamageEvent[];
  damageDealt: FightDamageEvent[];
  resetEvents: FightResetEvent[];
  blueZoneDamage: ZonePressureEvidence;
  playerPosition?: TelemetryPosition;
  enemyPosition?: TelemetryPosition;
  closestTeammateName?: string;
  closestTeammatePosition?: TelemetryPosition;
  closestTeammateDistanceMeters?: number;
  closestTeammateToEnemyDistanceMeters?: number;
  teammateAngleFromPlayerToEnemyDegrees?: number;
  closestTeammateDamageToEnemy: FightDamageEvent[];
  enemyDistanceMeters?: number;
  tradeRangeConfidence: CoachingRating;
  repositionDistanceMeters?: number;
  repositionConfidence: CoachingRating;
  heightDeltaMeters?: number;
  heightConfidence: CoachingRating;
  repeatedSameEnemy: boolean;
  claims: FightContextClaim[];
}

export interface CoachingInsight {
  playerName: string;
  category: CoachingCategory;
  kind?: CoachingInsightKind;
  title?: 'Decisive mistake' | 'Pattern to fix' | 'Player fingerprint';
  timestamp: Date;
  matchTimeSeconds: number;
  severity: CoachingRating;
  confidence: CoachingRating;
  evidence: string[];
  recommendation: string;
  betterPlay?: string[];
  claims?: FightContextClaim[];
}

export interface CoachingNarrationSection {
  playerName: string;
  title?: 'Decisive mistake' | 'Pattern to fix' | 'Player fingerprint';
  lines: string[];
}

export interface CoachingNarration {
  sections: CoachingNarrationSection[];
}

export interface CoachingLlmClient {
  narrate(insights: CoachingInsight[]): Promise<CoachingNarration>;
}

export interface CoachingNarratorOptions {
  enabled: boolean;
  maxLineLength: number;
}

export interface OpenRouterChatResponse {
  choices?: Array<{
    message?: {
      content?: string;
    };
  }>;
}
