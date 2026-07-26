export type CoachingCategory =
  | 'decisive-mistake'
  | 'player-fingerprint'
  | 'pattern'
  | 'fight-reset'
  | 'team-spacing'
  | 'damage-conversion'
  | 'weapon-range'
  | 'rotation'
  | 'survival'
  | 'armor'
  | 'utility'
  | 'vehicle';

export type CoachingRating = 'low' | 'medium' | 'high';

export type CoachingInsightKind = 'decisive-mistake' | 'pattern' | 'player-fingerprint';

export interface CoachingInsightClaim {
  text: string;
  confidence: CoachingRating;
  evidence: string[];
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
  claims?: CoachingInsightClaim[];
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
