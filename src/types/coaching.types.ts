export type CoachingCategory =
  | 'fight-reset'
  | 'team-spacing'
  | 'damage-conversion'
  | 'weapon-range'
  | 'rotation'
  | 'survival';

export type CoachingRating = 'low' | 'medium' | 'high';

export interface CoachingInsight {
  playerName: string;
  category: CoachingCategory;
  timestamp: Date;
  matchTimeSeconds: number;
  severity: CoachingRating;
  confidence: CoachingRating;
  evidence: string[];
  recommendation: string;
}

export interface CoachingNarrationSection {
  playerName: string;
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
