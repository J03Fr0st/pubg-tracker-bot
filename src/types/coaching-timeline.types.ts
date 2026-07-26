import type { TelemetryEvent } from '@j03fr0st/pubg-ts';
import type { CoachingRating } from './coaching.types';

export interface TimelineIdentity {
  accountId?: string;
  name?: string;
  teamId?: number;
  confidence: CoachingRating;
}

export interface TimelinePosition {
  x: number;
  y: number;
  z?: number;
}

export type TimelineEventCategory =
  | 'armor-destroy'
  | 'attack'
  | 'carry'
  | 'damage'
  | 'death'
  | 'game-state'
  | 'generic'
  | 'heal'
  | 'inventory'
  | 'knock'
  | 'login'
  | 'logout'
  | 'match'
  | 'object'
  | 'phase'
  | 'position'
  | 'revive'
  | 'swim-end'
  | 'swim-start'
  | 'utility'
  | 'vehicle-damage'
  | 'vehicle-destroy'
  | 'vehicle-enter'
  | 'vehicle-exit'
  | 'vehicle-wheel-destroy';

export type TimelineScalar = string | number | boolean | null;

export interface NormalizedTelemetryEvent {
  id: string;
  sourceIndex: number;
  sourceType: string;
  category: TimelineEventCategory;
  known: boolean;
  evidenceEligible: boolean;
  timestamp: Date | null;
  matchTimeSeconds: number | null;
  actor?: TimelineIdentity;
  target?: TimelineIdentity;
  actorPosition?: TimelinePosition;
  targetPosition?: TimelinePosition;
  data: Readonly<Record<string, TimelineScalar>>;
  sourceEvent: TelemetryEvent;
}

export type TimelineDiagnosticCode =
  | 'ambiguous-transition'
  | 'invalid-timestamp'
  | 'missing-timestamp'
  | 'unknown-event-type';

export interface TimelineDiagnostic {
  code: TimelineDiagnosticCode;
  sourceIndex?: number;
  eventId?: string;
  accountId?: string;
  message: string;
}

export interface TelemetryTimeline {
  matchStartTime: Date;
  events: NormalizedTelemetryEvent[];
  diagnostics: TimelineDiagnostic[];
}

export type PlayerCoreState = 'alive' | 'carried' | 'dead' | 'disconnected' | 'knocked';

export type PlayerActivityState = 'healing' | 'in-vehicle' | 'swimming';

export interface PlayerStateInterval<TState extends string> {
  state: TState;
  startTimeSeconds: number;
  endTimeSeconds: number | null;
  openedByEventId: string;
  closedByEventId?: string;
  confidence: CoachingRating;
}

export interface ProjectedPlayerState {
  identity: TimelineIdentity & { accountId: string };
  core: Array<PlayerStateInterval<PlayerCoreState>>;
  activities: Array<PlayerStateInterval<PlayerActivityState>>;
}

export interface PlayerStateProjection {
  players: Map<string, ProjectedPlayerState>;
  diagnostics: TimelineDiagnostic[];
}

export type EncounterOutcome = 'death' | 'disengaged' | 'knock' | 'unknown';

export interface TelemetryEncounter {
  id: string;
  monitoredPlayer: TimelineIdentity & { accountId: string };
  opponentAccountIds: string[];
  startTimeSeconds: number;
  endTimeSeconds: number;
  eventIds: string[];
  outcome: EncounterOutcome;
}

export interface TimelineShadowResult {
  timeline: TelemetryTimeline;
  state: PlayerStateProjection;
  encounters: TelemetryEncounter[];
}
