export type CoachingCategory =
  | 'decisive-mistake'
  | 'pattern'
  | 'fight-reset'
  | 'team-spacing'
  | 'damage-conversion'
  | 'weapon-range'
  | 'rotation'
  | 'survival';

export type CoachingRating = 'low' | 'medium' | 'high';

export type CoachingInsightKind = 'decisive-mistake' | 'pattern';

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

export interface FightContext {
  playerName: string;
  enemyName?: string;
  outcome: FightOutcome;
  timestamp: Date;
  matchTimeSeconds: number;
  damageTaken: FightDamageEvent[];
  damageDealt: FightDamageEvent[];
  playerPosition?: TelemetryPosition;
  enemyPosition?: TelemetryPosition;
  closestTeammateName?: string;
  closestTeammateDistanceMeters?: number;
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
  title?: 'Decisive mistake' | 'Pattern to fix';
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
  title?: 'Decisive mistake' | 'Pattern to fix';
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
