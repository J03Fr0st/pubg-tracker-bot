import {
  type CoachingTimelineThresholds,
  DEFAULT_COACHING_TIMELINE_THRESHOLDS,
} from '../config/coaching-timeline';
import type { TrackedPlayerIdentity } from '../types/analytics-results.types';
import type {
  EncounterOutcome,
  NormalizedTelemetryEvent,
  PlayerStateProjection,
  TelemetryEncounter,
  TelemetryTimeline,
  TimelinePosition,
} from '../types/coaching-timeline.types';

const COMBAT_CATEGORIES = new Set([
  'armor-destroy',
  'attack',
  'damage',
  'death',
  'knock',
  'utility',
  'vehicle-damage',
  'vehicle-destroy',
  'vehicle-wheel-destroy',
]);

interface ActiveEncounter {
  encounter: TelemetryEncounter;
  lastPosition?: TimelinePosition;
}

export class EncounterSegmenterService {
  public constructor(
    private readonly thresholds: CoachingTimelineThresholds = DEFAULT_COACHING_TIMELINE_THRESHOLDS
  ) {}

  public segment(
    timeline: TelemetryTimeline,
    state: PlayerStateProjection,
    monitoredPlayers: TrackedPlayerIdentity[]
  ): TelemetryEncounter[] {
    const identities = new Map(
      monitoredPlayers
        .filter((player) => state.players.has(player.accountId))
        .map((player) => [player.accountId, player])
    );
    const active = new Map<string, ActiveEncounter>();
    const encounters: TelemetryEncounter[] = [];
    const ordinals = new Map<string, number>();

    for (const event of timeline.events) {
      if (event.matchTimeSeconds === null) continue;
      this.closeForLifecycleBoundary(event, active);
      if (!COMBAT_CATEGORIES.has(event.category)) continue;

      for (const [accountId, identity] of identities) {
        const involvement = this.involvementOf(event, accountId);
        if (!involvement.involved) continue;

        const previous = active.get(accountId);
        if (previous && this.shouldStartNew(previous, event, involvement.opponentAccountId)) {
          if (previous.encounter.outcome === 'unknown') {
            previous.encounter.outcome = 'disengaged';
          }
          active.delete(accountId);
        }

        let current = active.get(accountId);
        if (!current) {
          const ordinal = (ordinals.get(accountId) ?? 0) + 1;
          ordinals.set(accountId, ordinal);
          current = {
            encounter: {
              id: `encounter-${accountId}-${ordinal}`,
              monitoredPlayer: { ...identity, confidence: 'high' },
              opponentAccountIds: involvement.opponentAccountId
                ? [involvement.opponentAccountId]
                : [],
              startTimeSeconds: event.matchTimeSeconds,
              endTimeSeconds: event.matchTimeSeconds,
              eventIds: [],
              outcome: 'unknown',
            },
          };
          active.set(accountId, current);
          encounters.push(current.encounter);
        } else if (
          involvement.opponentAccountId &&
          !current.encounter.opponentAccountIds.includes(involvement.opponentAccountId)
        ) {
          current.encounter.opponentAccountIds.push(involvement.opponentAccountId);
        }

        current.encounter.eventIds.push(event.id);
        current.encounter.endTimeSeconds = event.matchTimeSeconds;
        current.lastPosition = involvement.monitoredPosition ?? current.lastPosition;

        const outcome = this.outcomeOf(event);
        if (outcome !== 'unknown') {
          current.encounter.outcome = outcome;
          active.delete(accountId);
        }
      }
    }

    return encounters;
  }

  private involvementOf(
    event: NormalizedTelemetryEvent,
    monitoredAccountId: string
  ): {
    involved: boolean;
    monitoredPosition?: TimelinePosition;
    opponentAccountId?: string;
  } {
    const actorIsMonitored = event.actor?.accountId === monitoredAccountId;
    const targetIsMonitored = event.target?.accountId === monitoredAccountId;
    if (!actorIsMonitored && !targetIsMonitored) {
      return { involved: false };
    }
    return {
      involved: true,
      monitoredPosition: targetIsMonitored ? event.targetPosition : event.actorPosition,
      opponentAccountId: targetIsMonitored ? event.actor?.accountId : event.target?.accountId,
    };
  }

  private shouldStartNew(
    active: ActiveEncounter,
    event: NormalizedTelemetryEvent,
    opponentAccountId?: string
  ): boolean {
    if (event.matchTimeSeconds === null) return false;
    if (
      event.matchTimeSeconds - active.encounter.endTimeSeconds >
      this.thresholds.encounterInactivitySeconds
    ) {
      return true;
    }
    if (
      opponentAccountId &&
      active.encounter.opponentAccountIds.length > 0 &&
      !active.encounter.opponentAccountIds.includes(opponentAccountId)
    ) {
      return true;
    }
    const position =
      event.actor?.accountId === active.encounter.monitoredPlayer.accountId
        ? event.actorPosition
        : event.targetPosition;
    return Boolean(
      active.lastPosition &&
        position &&
        this.distance(active.lastPosition, position) >
          this.thresholds.encounterSeparationCentimeters
    );
  }

  private closeForLifecycleBoundary(
    event: NormalizedTelemetryEvent,
    active: Map<string, ActiveEncounter>
  ): void {
    if (!['revive', 'login', 'logout', 'carry'].includes(event.category)) return;
    const accountId = event.target?.accountId ?? event.actor?.accountId;
    if (!accountId) return;
    const encounter = active.get(accountId);
    if (encounter?.encounter.outcome === 'unknown') {
      encounter.encounter.outcome = 'disengaged';
    }
    active.delete(accountId);
  }

  private outcomeOf(event: NormalizedTelemetryEvent): EncounterOutcome {
    if (event.category === 'knock') return 'knock';
    if (event.category === 'death') return 'death';
    return 'unknown';
  }

  private distance(left: TimelinePosition, right: TimelinePosition): number {
    const dx = left.x - right.x;
    const dy = left.y - right.y;
    const dz = (left.z ?? 0) - (right.z ?? 0);
    return Math.sqrt(dx * dx + dy * dy + dz * dz);
  }
}
