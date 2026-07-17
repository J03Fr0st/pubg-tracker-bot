import type { TelemetryEvent } from '@j03fr0st/pubg-ts';
import type { MatchAnalysis } from './analytics-results.types';
import type { MatchPlayerIdentity } from './match.types';

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

export interface CoachingAnalysisInput {
  matchAnalysis: MatchAnalysis;
  monitoredPlayers: readonly MatchPlayerIdentity[];
  telemetryEvents: readonly TelemetryEvent[];
}

export interface CoachingClaim {
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
  claims?: CoachingClaim[];
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
  narrate(insights: CoachingInsight[]): Promise<unknown>;
}

export interface CoachingNarratorOptions {
  enabled: boolean;
  maxLineLength: number;
}
