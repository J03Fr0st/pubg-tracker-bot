import type { CoachingCategory, CoachingRating } from '../types/coaching.types';
import type {
  CoachingCandidate,
  CoachingDetector,
  CoachingDetectorResult,
  DetectorSuppressionReason,
  EnrichedTelemetryEncounter,
} from '../types/coaching-detector.types';
import type { NormalizedTelemetryEvent, TimelinePosition } from '../types/coaching-timeline.types';

const HEAVY_DAMAGE = 60;
const MIN_RESET_SECONDS = 6;
const TRADE_DISTANCE_METERS = 60;
const MATERIAL_MOVEMENT_METERS = 15;

export abstract class EncounterDetector implements CoachingDetector {
  public abstract readonly id: string;
  public abstract detect(encounter: EnrichedTelemetryEncounter): CoachingDetectorResult;

  protected notApplicable(encounter: EnrichedTelemetryEncounter): CoachingDetectorResult {
    return {
      kind: 'not-applicable',
      detectorId: this.id,
      encounterId: encounter.encounter.id,
    };
  }

  protected suppressed(
    encounter: EnrichedTelemetryEncounter,
    reason: DetectorSuppressionReason,
    eventIds: string[] = []
  ): CoachingDetectorResult {
    return {
      kind: 'suppressed',
      detectorId: this.id,
      encounterId: encounter.encounter.id,
      reason,
      evidenceEventIds: eventIds,
    };
  }

  protected candidate(
    encounter: EnrichedTelemetryEncounter,
    options: {
      category: CoachingCategory;
      claim: string;
      claimEventIds: string[];
      recommendation: string;
      betterPlay: string[];
      dedupeKey?: string;
      severity?: CoachingRating;
      confidence?: CoachingRating;
      actionability?: number;
      causalLinks?: string[];
      decisiveEvent?: NormalizedTelemetryEvent;
    }
  ): CoachingDetectorResult {
    const decisiveEvent =
      options.decisiveEvent ??
      [...encounter.events].reverse().find((event) => event.timestamp) ??
      encounter.events[0];
    const timestamp = decisiveEvent?.timestamp ?? new Date(0);
    const matchTimeSeconds = decisiveEvent?.matchTimeSeconds ?? encounter.encounter.endTimeSeconds;
    const candidate: CoachingCandidate = {
      detectorId: this.id,
      dedupeKey: options.dedupeKey ?? `${this.id}:${encounter.encounter.id}`,
      player: {
        ...encounter.encounter.monitoredPlayer,
        name:
          encounter.encounter.monitoredPlayer.name ?? encounter.encounter.monitoredPlayer.accountId,
      },
      category: options.category,
      title: 'Decisive mistake',
      timestamp,
      matchTimeSeconds,
      severity: options.severity ?? 'medium',
      confidence: options.confidence ?? 'high',
      actionability: options.actionability ?? 0.8,
      causalProximity: 1,
      claims: [
        {
          text: options.claim,
          eventIds: options.claimEventIds,
          confidence: options.confidence ?? 'high',
        },
      ],
      recommendation: options.recommendation,
      betterPlay: options.betterPlay,
      causalLinks: options.causalLinks,
    };
    return { kind: 'candidate', candidate };
  }

  protected unavailableStateReason(
    encounter: EnrichedTelemetryEncounter
  ): DetectorSuppressionReason | undefined {
    if (encounter.actionableAtStart) return undefined;
    if (encounter.coreStateAtStart === 'knocked') return 'knocked';
    if (encounter.coreStateAtStart === 'carried') return 'carried';
    if (encounter.coreStateAtStart === 'dead') return 'dead';
    return 'disconnected';
  }

  protected playerLossEvent(
    encounter: EnrichedTelemetryEncounter
  ): NormalizedTelemetryEvent | undefined {
    return [...encounter.events]
      .reverse()
      .find(
        (event) =>
          (event.category === 'knock' || event.category === 'death') &&
          event.target?.accountId === encounter.encounter.monitoredPlayer.accountId
      );
  }

  protected isOpponentDamage(
    encounter: EnrichedTelemetryEncounter,
    event: NormalizedTelemetryEvent
  ): boolean {
    return (
      event.category === 'damage' &&
      event.target?.accountId === encounter.encounter.monitoredPlayer.accountId &&
      event.actor?.accountId !== undefined &&
      encounter.encounter.opponentAccountIds.includes(event.actor.accountId)
    );
  }
}

export class FailedResetDetector extends EncounterDetector {
  public readonly id = 'failed-reset';

  public detect(encounter: EnrichedTelemetryEncounter): CoachingDetectorResult {
    const heavy = this.heavyDamage(encounter);
    const decisive = this.decisiveEvent(encounter);
    if (!heavy || !decisive) return this.notApplicable(encounter);
    const stateReason = this.unavailableStateReason(encounter);
    if (stateReason) return this.suppressed(encounter, stateReason, [heavy.id, decisive.id]);
    if (!heavy.actor?.accountId || !decisive.actor?.accountId) {
      return this.suppressed(encounter, 'insufficient-evidence', [heavy.id, decisive.id]);
    }
    const seconds = (decisive.matchTimeSeconds ?? 0) - (heavy.matchTimeSeconds ?? 0);
    if (seconds < MIN_RESET_SECONDS) {
      return this.suppressed(encounter, 'insufficient-time', [heavy.id, decisive.id]);
    }
    if (heavy.actor.accountId !== decisive.actor.accountId) {
      return this.suppressed(encounter, 'wrong-encounter', [heavy.id, decisive.id]);
    }
    const completedHeal = encounter.healEvents.find(
      (event) =>
        (event.matchTimeSeconds ?? -1) > (heavy.matchTimeSeconds ?? 0) &&
        (event.matchTimeSeconds ?? Number.POSITIVE_INFINITY) < (decisive.matchTimeSeconds ?? 0)
    );
    if (completedHeal) {
      return this.suppressed(encounter, 'reset-completed', [
        heavy.id,
        completedHeal.id,
        decisive.id,
      ]);
    }

    const damage = Math.round(Number(heavy.data.damage));
    const enemyName = heavy.actor?.name ?? 'The same opponent';
    return this.candidate(encounter, {
      category: 'fight-reset',
      claim: `${enemyName} hit you for ${damage} damage, then ${seconds}s later you ${decisive.category === 'death' ? 'died' : 'got knocked'} before creating a reset.`,
      claimEventIds: [heavy.id, decisive.id],
      recommendation:
        'Break line of sight, complete a heal, then re-engage from a new angle or with teammate pressure.',
      betterPlay: ['break line of sight', 'heal', 'change angle'],
      dedupeKey: `reset:${encounter.encounter.id}`,
      severity: 'high',
      decisiveEvent: decisive,
      causalLinks: ['heavy damage', 'no completed reset', decisive.category],
    });
  }

  private heavyDamage(encounter: EnrichedTelemetryEncounter): NormalizedTelemetryEvent | undefined {
    return encounter.events.find(
      (event) =>
        this.isOpponentDamage(encounter, event) &&
        typeof event.data.damage === 'number' &&
        event.data.damage >= HEAVY_DAMAGE
    );
  }

  private decisiveEvent(
    encounter: EnrichedTelemetryEncounter
  ): NormalizedTelemetryEvent | undefined {
    return encounter.events.find(
      (event) =>
        (event.category === 'knock' || event.category === 'death') &&
        event.target?.accountId === encounter.encounter.monitoredPlayer.accountId
    );
  }
}

export class TeamSpacingDetector extends EncounterDetector {
  public readonly id = 'team-spacing';

  public detect(encounter: EnrichedTelemetryEncounter): CoachingDetectorResult {
    const stateReason = this.unavailableStateReason(encounter);
    if (stateReason) return this.suppressed(encounter, stateReason);
    const teammate = encounter.closestTeammate;
    if (!teammate) return this.suppressed(encounter, 'insufficient-evidence');
    if (teammate.confidence === 'low') {
      return this.suppressed(encounter, 'low-confidence-geometry', teammate.evidenceEventIds);
    }
    if (teammate.coreState !== 'alive') {
      return this.suppressed(encounter, 'teammate-unavailable', teammate.evidenceEventIds);
    }
    if (teammate.distanceMeters <= TRADE_DISTANCE_METERS) {
      const decisive = encounter.events.find(
        (event) =>
          (event.category === 'knock' || event.category === 'death') &&
          event.target?.accountId === encounter.encounter.monitoredPlayer.accountId
      );
      if (!decisive) return this.notApplicable(encounter);
      const opponentIds = new Set(encounter.encounter.opponentAccountIds);
      const teammateTraded = encounter.contextEvents.some(
        (event) =>
          event.category === 'damage' &&
          event.actor?.accountId === teammate.accountId &&
          event.target?.accountId !== undefined &&
          opponentIds.has(event.target.accountId)
      );
      if (teammateTraded) return this.notApplicable(encounter);

      return this.candidate(encounter, {
        category: 'team-spacing',
        claim: `${teammate.name} was ${Math.round(teammate.distanceMeters)}m away, but no damage event from them to this opponent was logged before you ${decisive.category === 'death' ? 'died' : 'were knocked'}.`,
        claimEventIds: [...teammate.evidenceEventIds, decisive.id],
        recommendation:
          'Coordinate the same target and timing so a nearby teammate can immediately trade.',
        betterPlay: ['call the target', 'synchronize the peek', 'trade immediately'],
        confidence: teammate.confidence,
        decisiveEvent: decisive,
      });
    }
    return this.candidate(encounter, {
      category: 'team-spacing',
      claim: `${teammate.name} was ${Math.round(teammate.distanceMeters)}m away when this fight started, outside the configured trade distance.`,
      claimEventIds: teammate.evidenceEventIds,
      recommendation: 'Start the fight only when the nearest teammate can trade immediately.',
      betterPlay: ['close team spacing', 'synchronize the entry'],
      confidence: teammate.confidence,
    });
  }
}

export class DamageConversionDetector extends EncounterDetector {
  public readonly id = 'damage-conversion';

  public detect(encounter: EnrichedTelemetryEncounter): CoachingDetectorResult {
    if (encounter.damageTaken.value < HEAVY_DAMAGE) return this.notApplicable(encounter);
    const stateReason = this.unavailableStateReason(encounter);
    if (stateReason) return this.suppressed(encounter, stateReason);
    if (encounter.encounter.opponentAccountIds.length === 0) {
      return this.suppressed(
        encounter,
        'insufficient-evidence',
        encounter.damageTaken.evidenceEventIds
      );
    }
    if (encounter.damageDealt.value >= encounter.damageTaken.value / 2) {
      return this.notApplicable(encounter);
    }
    const eventIds = [
      ...encounter.damageTaken.evidenceEventIds,
      ...encounter.damageDealt.evidenceEventIds,
    ];
    return this.candidate(encounter, {
      category: 'damage-conversion',
      claim: `You took ${Math.round(encounter.damageTaken.value)} damage while dealing ${Math.round(encounter.damageDealt.value)} in this encounter.`,
      claimEventIds: eventIds,
      recommendation: 'Stop the damage-negative trade and reposition before exposing again.',
      betterPlay: ['stop the trade', 'reposition', 're-engage with an advantage'],
    });
  }
}

export class MovementExposureDetector extends EncounterDetector {
  public readonly id = 'movement-exposure';

  public detect(encounter: EnrichedTelemetryEncounter): CoachingDetectorResult {
    const hits = encounter.events.filter((event) => this.isOpponentDamage(encounter, event));
    if (hits.length < 2) return this.notApplicable(encounter);
    const stateReason = this.unavailableStateReason(encounter);
    if (stateReason) {
      return this.suppressed(
        encounter,
        stateReason,
        hits.map((event) => event.id)
      );
    }
    const firstHitSeconds = hits[0].matchTimeSeconds ?? Number.NEGATIVE_INFINITY;
    const lastHitSeconds = hits.at(-1)?.matchTimeSeconds ?? Number.POSITIVE_INFINITY;
    const exposureMovement = encounter.movementEvents.filter(
      (event) =>
        event.matchTimeSeconds !== null &&
        event.matchTimeSeconds >= firstHitSeconds &&
        event.matchTimeSeconds <= lastHitSeconds
    );
    if (exposureMovement.length < 2) {
      return this.suppressed(
        encounter,
        'insufficient-evidence',
        hits.map((event) => event.id)
      );
    }
    const first = exposureMovement[0];
    const last = exposureMovement.at(-1);
    if (!first.actorPosition || !last?.actorPosition) {
      return this.suppressed(encounter, 'low-confidence-geometry');
    }
    const distanceMeters = this.distance(first.actorPosition, last.actorPosition) / 100;
    if (distanceMeters >= MATERIAL_MOVEMENT_METERS) return this.notApplicable(encounter);

    return this.candidate(encounter, {
      category: 'survival',
      claim: `You took ${hits.length} hits while logged movement changed by only ${Math.round(distanceMeters)}m.`,
      claimEventIds: [...hits.map((event) => event.id), first.id, last.id],
      recommendation: 'Break the repeated exposure by moving to a materially different angle.',
      betterPlay: ['leave the exposed position', 'force a new angle'],
      confidence: 'medium',
    });
  }

  private distance(left: TimelinePosition, right: TimelinePosition): number {
    const dx = left.x - right.x;
    const dy = left.y - right.y;
    const dz = (left.z ?? 0) - (right.z ?? 0);
    return Math.sqrt(dx * dx + dy * dy + dz * dz);
  }
}

export class RecoveryDecisionDetector extends EncounterDetector {
  public readonly id = 'recovery-decision';

  public detect(encounter: EnrichedTelemetryEncounter): CoachingDetectorResult {
    const heavy = encounter.events.find(
      (event) =>
        this.isOpponentDamage(encounter, event) &&
        typeof event.data.damage === 'number' &&
        event.data.damage >= HEAVY_DAMAGE
    );
    const decisive = encounter.events.find(
      (event) =>
        (event.category === 'knock' || event.category === 'death') &&
        event.target?.accountId === encounter.encounter.monitoredPlayer.accountId
    );
    if (!heavy || !decisive) return this.notApplicable(encounter);
    const stateReason = this.unavailableStateReason(encounter);
    if (stateReason) return this.suppressed(encounter, stateReason);
    const seconds = (decisive.matchTimeSeconds ?? 0) - (heavy.matchTimeSeconds ?? 0);
    if (seconds < MIN_RESET_SECONDS) return this.suppressed(encounter, 'insufficient-time');
    const completedHeal = encounter.healEvents.find(
      (event) =>
        (event.matchTimeSeconds ?? -1) > (heavy.matchTimeSeconds ?? 0) &&
        (event.matchTimeSeconds ?? Number.POSITIVE_INFINITY) < (decisive.matchTimeSeconds ?? 0)
    );
    if (completedHeal) {
      return this.suppressed(encounter, 'reset-completed', [
        heavy.id,
        completedHeal.id,
        decisive.id,
      ]);
    }
    return this.candidate(encounter, {
      category: 'survival',
      claim: `${seconds}s of actionable time passed after heavy damage without a completed recovery event.`,
      claimEventIds: [heavy.id, decisive.id],
      recommendation: 'Use the available safe window to heal before taking the next exposure.',
      betterPlay: ['create safety', 'complete recovery', 'then re-engage'],
      dedupeKey: `reset:${encounter.encounter.id}`,
      decisiveEvent: decisive,
    });
  }
}
