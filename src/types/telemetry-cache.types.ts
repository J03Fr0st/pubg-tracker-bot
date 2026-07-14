import type { TelemetryEvent } from '@j03fr0st/pubg-ts';
import type { MatchAnalysis } from './analytics-results.types';

export interface TelemetryCacheHit {
  kind: 'hit';
  matchAnalysis: MatchAnalysis;
  rawEvents: TelemetryEvent[];
}

export type TelemetryCacheReadResult =
  | TelemetryCacheHit
  | { kind: 'miss' }
  | { kind: 'corrupt'; reason: string };
