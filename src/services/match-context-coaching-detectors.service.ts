import type {
  CoachingDetectorResult,
  EnrichedTelemetryEncounter,
} from '../types/coaching-detector.types';
import { EncounterDetector } from './core-coaching-detectors.service';

const MATERIAL_BLUE_ZONE_DAMAGE = 25;
const UTILITY_ITEM_PATTERN = /(grenade|molotov|smoke|stun|c4|bluezone)/i;

export class LifecycleAccuracyDetector extends EncounterDetector {
  public readonly id = 'lifecycle-accuracy';

  public detect(encounter: EnrichedTelemetryEncounter): CoachingDetectorResult {
    if (encounter.actionableAtStart) return this.notApplicable(encounter);
    if (encounter.coreStateAtStart === 'knocked') {
      return this.suppressed(encounter, 'knocked');
    }
    if (encounter.coreStateAtStart === 'carried') {
      return this.suppressed(encounter, 'carried');
    }
    if (encounter.coreStateAtStart === 'dead') {
      return this.suppressed(encounter, 'dead');
    }
    return this.suppressed(encounter, 'disconnected');
  }
}

export class ZoneRotationDetector extends EncounterDetector {
  public readonly id = 'zone-rotation';

  public detect(encounter: EnrichedTelemetryEncounter): CoachingDetectorResult {
    if (encounter.blueZoneDamage.value < MATERIAL_BLUE_ZONE_DAMAGE) {
      return this.notApplicable(encounter);
    }
    const stateReason = this.unavailableStateReason(encounter);
    if (stateReason) return this.suppressed(encounter, stateReason);
    const decisiveEvent = this.playerLossEvent(encounter);
    if (!decisiveEvent) return this.notApplicable(encounter);
    const accountId = encounter.encounter.monitoredPlayer.accountId;
    const startSourceIndex = Math.min(...encounter.events.map((event) => event.sourceIndex));
    const priorContext = [...encounter.contextEvents]
      .filter(
        (event) =>
          event.matchTimeSeconds !== null &&
          (event.matchTimeSeconds < encounter.encounter.startTimeSeconds ||
            (event.matchTimeSeconds === encounter.encounter.startTimeSeconds &&
              event.sourceIndex < startSourceIndex))
      )
      .reverse();
    const phase = priorContext.find(
      (event) => event.category === 'phase' && typeof event.data.phase === 'number'
    );
    const position = priorContext.find(
      (event) =>
        event.category === 'position' && event.actor?.accountId === accountId && event.actorPosition
    );
    if (!phase || !position) {
      return this.suppressed(
        encounter,
        'insufficient-evidence',
        encounter.blueZoneDamage.evidenceEventIds
      );
    }
    return this.candidate(encounter, {
      category: 'rotation',
      claim: `You took ${Math.round(encounter.blueZoneDamage.value)} blue-zone damage around phase ${phase.data.phase} before or during this encounter.`,
      claimEventIds: [
        ...encounter.blueZoneDamage.evidenceEventIds,
        phase.id,
        position.id,
        decisiveEvent.id,
      ],
      recommendation:
        'Rotate before zone pressure removes health and forces the timing of the next fight.',
      betterPlay: ['rotate earlier', 'preserve fight health', 'choose the next position'],
      severity: 'high',
      decisiveEvent,
      causalLinks: ['blue-zone damage', 'reduced fight health', encounter.encounter.outcome],
    });
  }
}

export class ArmorDisadvantageDetector extends EncounterDetector {
  public readonly id = 'armor-disadvantage';

  public detect(encounter: EnrichedTelemetryEncounter): CoachingDetectorResult {
    if (!encounter.armorDestroyed.value) return this.notApplicable(encounter);
    const stateReason = this.unavailableStateReason(encounter);
    if (stateReason) return this.suppressed(encounter, stateReason);
    const decisiveEvent = this.playerLossEvent(encounter);
    if (!decisiveEvent) return this.notApplicable(encounter);
    const armorEvent = encounter.events.find(
      (event) => event.category === 'armor-destroy' && typeof event.data.itemId === 'string'
    );
    if (!armorEvent) {
      return this.suppressed(
        encounter,
        'insufficient-evidence',
        encounter.armorDestroyed.evidenceEventIds
      );
    }
    if (encounter.encounter.outcome === 'unknown' || encounter.encounter.outcome === 'disengaged') {
      return this.suppressed(
        encounter,
        'insufficient-evidence',
        encounter.armorDestroyed.evidenceEventIds
      );
    }
    return this.candidate(encounter, {
      category: 'armor',
      claim: `Your armor was destroyed inside the encounter that ended in a ${encounter.encounter.outcome}.`,
      claimEventIds: [...encounter.armorDestroyed.evidenceEventIds, decisiveEvent.id],
      recommendation:
        'Treat the armor break as a disengage trigger unless the opponent is already tradeable.',
      betterPlay: ['break contact after the armor loss', 're-arm or force a teammate trade'],
      decisiveEvent,
      causalLinks: ['armor destroyed', 'continued exposure', encounter.encounter.outcome],
    });
  }
}

export class UtilityUsageDetector extends EncounterDetector {
  public readonly id = 'utility-usage';

  public detect(encounter: EnrichedTelemetryEncounter): CoachingDetectorResult {
    const accountId = encounter.encounter.monitoredPlayer.accountId;
    const decisiveEvent = this.playerLossEvent(encounter);
    if (!decisiveEvent) return this.notApplicable(encounter);
    const knownUtility = encounter.contextEvents.find(
      (event) =>
        event.category === 'inventory' &&
        event.actor?.accountId === accountId &&
        typeof event.data.itemId === 'string' &&
        UTILITY_ITEM_PATTERN.test(event.data.itemId) &&
        event.sourceType.includes('LogItemPickup')
    );
    if (!knownUtility) return this.suppressed(encounter, 'insufficient-evidence');
    const stateReason = this.unavailableStateReason(encounter);
    if (stateReason) return this.suppressed(encounter, stateReason);
    const utilityTime = knownUtility.matchTimeSeconds ?? Number.NEGATIVE_INFINITY;
    const dropped = encounter.contextEvents.some(
      (event) =>
        event.sourceType.includes('Drop') &&
        event.actor?.accountId === accountId &&
        event.data.itemId === knownUtility.data.itemId &&
        (event.matchTimeSeconds ?? Number.NEGATIVE_INFINITY) >= utilityTime
    );
    const used = encounter.utilityEvents.some(
      (event) => (event.matchTimeSeconds ?? Number.NEGATIVE_INFINITY) >= utilityTime
    );
    if (dropped || used) return this.notApplicable(encounter);
    if (encounter.encounter.outcome === 'unknown' || encounter.encounter.outcome === 'disengaged') {
      return this.notApplicable(encounter);
    }
    return this.candidate(encounter, {
      category: 'utility',
      claim: `Telemetry established possession of ${knownUtility.data.itemId}, but no throwable use was logged before the ${encounter.encounter.outcome}.`,
      claimEventIds: [knownUtility.id, decisiveEvent.id],
      recommendation:
        'Use known utility to force movement or cover the reset before taking another direct exposure.',
      betterPlay: ['deploy utility', 'force enemy movement', 'use the utility window'],
      confidence: 'medium',
      decisiveEvent,
    });
  }
}

export class VehicleDecisionDetector extends EncounterDetector {
  public readonly id = 'vehicle-decision';

  public detect(encounter: EnrichedTelemetryEncounter): CoachingDetectorResult {
    if (!encounter.recentVehicleExit.value) return this.notApplicable(encounter);
    const stateReason = this.unavailableStateReason(encounter);
    if (stateReason) return this.suppressed(encounter, stateReason);
    const decisiveEvent = this.playerLossEvent(encounter);
    if (!decisiveEvent) return this.notApplicable(encounter);
    const vehicleExit = encounter.contextEvents.find(
      (event) =>
        encounter.recentVehicleExit.evidenceEventIds.includes(event.id) &&
        event.category === 'vehicle-exit' &&
        typeof event.data.vehicleId === 'string'
    );
    if (!vehicleExit) {
      return this.suppressed(
        encounter,
        'insufficient-evidence',
        encounter.recentVehicleExit.evidenceEventIds
      );
    }
    if (encounter.encounter.outcome === 'unknown' || encounter.encounter.outcome === 'disengaged') {
      return this.notApplicable(encounter);
    }
    return this.candidate(encounter, {
      category: 'vehicle',
      claim: `You left a vehicle immediately before the encounter that ended in a ${encounter.encounter.outcome}.`,
      claimEventIds: [...encounter.recentVehicleExit.evidenceEventIds, decisiveEvent.id],
      recommendation:
        'Choose a dismount with cover and teammate pressure before giving the opponent a clean shot.',
      betterPlay: ['dismount behind cover', 'coordinate the stop', 'avoid an exposed exit'],
      decisiveEvent,
      causalLinks: ['vehicle exit', 'immediate exposure', encounter.encounter.outcome],
    });
  }
}

export class CarryContextDetector extends EncounterDetector {
  public readonly id = 'carry-context';

  public detect(encounter: EnrichedTelemetryEncounter): CoachingDetectorResult {
    if (encounter.coreStateAtStart !== 'carried') return this.notApplicable(encounter);
    return this.suppressed(
      encounter,
      'carried',
      encounter.events.map((event) => event.id)
    );
  }
}

export class RedeployContextDetector extends EncounterDetector {
  public readonly id = 'redeploy-context';

  public detect(encounter: EnrichedTelemetryEncounter): CoachingDetectorResult {
    const redeploy = encounter.contextEvents.find((event) =>
      event.sourceType.toLowerCase().includes('redeploy')
    );
    if (!redeploy) return this.notApplicable(encounter);
    return this.suppressed(encounter, 'unsupported-event', [redeploy.id]);
  }
}
