import type { TrackedPlayerIdentity } from './analytics-results.types';
import type { CoachingCategory, CoachingRating } from './coaching.types';
import type {
  NormalizedTelemetryEvent,
  PlayerCoreState,
  PlayerStateProjection,
  TelemetryEncounter,
  TelemetryTimeline,
  TimelineIdentity,
} from './coaching-timeline.types';

export interface EvidenceValue<T> {
  value: T;
  evidenceEventIds: string[];
}

export interface ClosestTeammateFact extends TrackedPlayerIdentity {
  distanceMeters: number;
  confidence: CoachingRating;
  coreState: PlayerCoreState;
  evidenceEventIds: string[];
}

export interface EnrichedTelemetryEncounter {
  encounter: TelemetryEncounter;
  events: NormalizedTelemetryEvent[];
  contextEvents: NormalizedTelemetryEvent[];
  coreStateAtStart: PlayerCoreState;
  actionableAtStart: boolean;
  damageTaken: EvidenceValue<number>;
  damageDealt: EvidenceValue<number>;
  blueZoneDamage: EvidenceValue<number>;
  armorDestroyed: EvidenceValue<boolean>;
  recentVehicleExit: EvidenceValue<boolean>;
  closestTeammate?: ClosestTeammateFact;
  healEvents: NormalizedTelemetryEvent[];
  movementEvents: NormalizedTelemetryEvent[];
  utilityEvents: NormalizedTelemetryEvent[];
}

export interface EnrichedTelemetryMatch {
  timeline: TelemetryTimeline;
  state: PlayerStateProjection;
  encounters: EnrichedTelemetryEncounter[];
  monitoredPlayers: TrackedPlayerIdentity[];
}

export type DetectorSuppressionReason =
  | 'ambiguous-lifecycle'
  | 'carried'
  | 'dead'
  | 'detector-failed'
  | 'disconnected'
  | 'insufficient-evidence'
  | 'insufficient-time'
  | 'knocked'
  | 'low-confidence-geometry'
  | 'reset-completed'
  | 'teammate-unavailable'
  | 'unsupported-event'
  | 'wrong-encounter';

export interface CoachingEvidenceClaim {
  text: string;
  eventIds: string[];
  confidence: CoachingRating;
}

export interface CoachingCandidate {
  detectorId: string;
  dedupeKey: string;
  player: TimelineIdentity & { accountId: string; name: string };
  category: CoachingCategory;
  title: 'Decisive mistake' | 'Pattern to fix' | 'Player fingerprint';
  timestamp: Date;
  matchTimeSeconds: number;
  severity: CoachingRating;
  confidence: CoachingRating;
  actionability: number;
  causalProximity: number;
  claims: CoachingEvidenceClaim[];
  recommendation: string;
  betterPlay: string[];
  causalLinks?: string[];
}

export type CoachingDetectorResult =
  | { kind: 'candidate'; candidate: CoachingCandidate }
  | {
      kind: 'suppressed';
      detectorId: string;
      encounterId: string;
      reason: DetectorSuppressionReason;
      evidenceEventIds: string[];
    }
  | { kind: 'not-applicable'; detectorId: string; encounterId: string };

export interface CoachingDetector {
  readonly id: string;
  detect(encounter: EnrichedTelemetryEncounter): CoachingDetectorResult;
}
