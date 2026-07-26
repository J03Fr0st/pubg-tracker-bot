import {
  ArmorDisadvantageDetector,
  CarryContextDetector,
  LifecycleAccuracyDetector,
  RedeployContextDetector,
  UtilityUsageDetector,
  VehicleDecisionDetector,
  ZoneRotationDetector,
} from '../../../src/services/match-context-coaching-detectors.service';
import type { EnrichedTelemetryEncounter } from '../../../src/types/coaching-detector.types';
import type { NormalizedTelemetryEvent } from '../../../src/types/coaching-timeline.types';

const player = { accountId: 'account.player', name: 'Player', confidence: 'high' as const };
const enemy = { accountId: 'account.enemy', name: 'Enemy', confidence: 'high' as const };

const event = (
  id: string,
  category: NormalizedTelemetryEvent['category'],
  values: Partial<NormalizedTelemetryEvent> = {}
): NormalizedTelemetryEvent => ({
  id,
  sourceIndex: 1,
  sourceType: category,
  category,
  known: true,
  evidenceEligible: true,
  timestamp: new Date('2026-07-25T10:00:10.000Z'),
  matchTimeSeconds: 10,
  actor: player,
  data: {},
  sourceEvent: { _T: category, common: { isGame: 1 } },
  ...values,
});

const enriched = (
  overrides: Partial<EnrichedTelemetryEncounter> = {}
): EnrichedTelemetryEncounter => ({
  encounter: {
    id: 'encounter-account.player-1',
    monitoredPlayer: player,
    opponentAccountIds: ['account.enemy'],
    startTimeSeconds: 10,
    endTimeSeconds: 20,
    eventIds: [],
    outcome: 'knock',
  },
  events: [event('event-decisive', 'knock', { sourceIndex: 10, target: player })],
  contextEvents: [],
  coreStateAtStart: 'alive',
  actionableAtStart: true,
  damageTaken: { value: 70, evidenceEventIds: ['event-damage'] },
  damageDealt: { value: 0, evidenceEventIds: [] },
  blueZoneDamage: { value: 0, evidenceEventIds: [] },
  armorDestroyed: { value: false, evidenceEventIds: [] },
  recentVehicleExit: { value: false, evidenceEventIds: [] },
  healEvents: [],
  movementEvents: [],
  utilityEvents: [],
  ...overrides,
});

describe('match-context coaching detectors', () => {
  it('links material blue-zone damage to a forced fight', () => {
    const phase = event('event-phase', 'phase', {
      sourceType: 'LogPhaseChange',
      data: { phase: 4 },
    });
    const position = event('event-position', 'position', {
      sourceType: 'LogPlayerPosition',
      actorPosition: { x: 100, y: 200 },
    });
    expect(
      new ZoneRotationDetector().detect(
        enriched({
          blueZoneDamage: { value: 30, evidenceEventIds: ['event-blue'] },
          contextEvents: [phase, position],
        })
      )
    ).toMatchObject({
      kind: 'candidate',
      candidate: {
        detectorId: 'zone-rotation',
        category: 'rotation',
        causalLinks: ['blue-zone damage', 'reduced fight health', 'knock'],
      },
    });
  });

  it('creates armor-disadvantage coaching only when armor loss is encounter-local', () => {
    const detector = new ArmorDisadvantageDetector();
    const armor = event('event-armor', 'armor-destroy', {
      target: player,
      data: { itemId: 'Item_Armor_C_01_Lv2_C' },
    });
    expect(
      detector.detect(
        enriched({
          events: [armor, event('event-decisive', 'knock', { target: player })],
          armorDestroyed: { value: true, evidenceEventIds: ['event-armor'] },
        })
      )
    ).toMatchObject({
      kind: 'candidate',
      candidate: { detectorId: 'armor-disadvantage', category: 'armor' },
    });
    expect(detector.detect(enriched())).toMatchObject({ kind: 'not-applicable' });
    expect(
      detector.detect(
        enriched({
          events: [
            event('event-armor', 'armor-destroy', { target: player }),
            event('event-decisive', 'knock', { target: player }),
          ],
          armorDestroyed: { value: true, evidenceEventIds: ['event-armor'] },
        })
      )
    ).toMatchObject({ kind: 'suppressed', reason: 'insufficient-evidence' });
  });

  it('coaches known unused utility without inferring inventory from absence', () => {
    const pickup = event('event-pickup', 'inventory', {
      sourceType: 'LogItemPickup',
      data: { itemId: 'Item_Weapon_Grenade_C' },
    });
    const detector = new UtilityUsageDetector();

    expect(detector.detect(enriched({ contextEvents: [pickup], utilityEvents: [] }))).toMatchObject(
      {
        kind: 'candidate',
        candidate: {
          detectorId: 'utility-usage',
          category: 'utility',
          claims: [{ eventIds: ['event-pickup', 'event-decisive'] }],
        },
      }
    );
    expect(
      detector.detect(
        enriched({
          contextEvents: [pickup],
          utilityEvents: [event('event-throw', 'utility')],
        })
      )
    ).toMatchObject({ kind: 'not-applicable' });
  });

  it('links a recent dismount to the immediate losing encounter', () => {
    const dismount = event('event-dismount', 'vehicle-exit', {
      sourceType: 'LogVehicleLeave',
      data: { vehicleId: 'vehicle-1' },
    });
    expect(
      new VehicleDecisionDetector().detect(
        enriched({
          recentVehicleExit: { value: true, evidenceEventIds: ['event-dismount'] },
          contextEvents: [dismount],
        })
      )
    ).toMatchObject({
      kind: 'candidate',
      candidate: { detectorId: 'vehicle-decision', category: 'vehicle' },
    });
  });

  it('suppresses visible match-context coaching when the player is not actionable', () => {
    const unavailable = {
      coreStateAtStart: 'knocked' as const,
      actionableAtStart: false,
    };
    const phase = event('event-phase', 'phase', { data: { phase: 4 } });
    const position = event('event-position', 'position', {
      actorPosition: { x: 100, y: 200 },
    });

    expect(
      new ZoneRotationDetector().detect(
        enriched({
          ...unavailable,
          blueZoneDamage: { value: 30, evidenceEventIds: ['event-blue'] },
          contextEvents: [phase, position],
        })
      )
    ).toMatchObject({ kind: 'suppressed', reason: 'knocked' });
    expect(
      new UtilityUsageDetector().detect(
        enriched({
          ...unavailable,
          contextEvents: [
            event('event-pickup', 'inventory', {
              sourceType: 'LogItemPickup',
              data: { itemId: 'Item_Weapon_Grenade_C' },
            }),
          ],
        })
      )
    ).toMatchObject({ kind: 'suppressed', reason: 'knocked' });
  });

  it('does not describe a successful enemy knock as the player losing the encounter', () => {
    const victory = event('event-victory', 'knock', {
      sourceIndex: 10,
      actor: player,
      target: enemy,
    });
    const phase = event('event-phase', 'phase', { data: { phase: 4 } });
    const position = event('event-position', 'position', {
      actorPosition: { x: 100, y: 200 },
    });
    const armor = event('event-armor', 'armor-destroy', {
      target: player,
      data: { itemId: 'Item_Armor_C_01_Lv2_C' },
    });
    const pickup = event('event-pickup', 'inventory', {
      sourceType: 'LogItemPickup',
      data: { itemId: 'Item_Weapon_Grenade_C' },
    });
    const dismount = event('event-dismount', 'vehicle-exit', {
      data: { vehicleId: 'vehicle-1' },
    });
    const wonEncounter = enriched({
      events: [armor, victory],
      contextEvents: [phase, position, pickup, dismount],
      blueZoneDamage: { value: 30, evidenceEventIds: ['event-blue'] },
      armorDestroyed: { value: true, evidenceEventIds: [armor.id] },
      recentVehicleExit: { value: true, evidenceEventIds: [dismount.id] },
    });

    expect(new ZoneRotationDetector().detect(wonEncounter)).toMatchObject({
      kind: 'not-applicable',
    });
    expect(new ArmorDisadvantageDetector().detect(wonEncounter)).toMatchObject({
      kind: 'not-applicable',
    });
    expect(new UtilityUsageDetector().detect(wonEncounter)).toMatchObject({
      kind: 'not-applicable',
    });
    expect(new VehicleDecisionDetector().detect(wonEncounter)).toMatchObject({
      kind: 'not-applicable',
    });
  });

  it('suppresses coaching while carried instead of treating it as action time', () => {
    expect(
      new CarryContextDetector().detect(
        enriched({ coreStateAtStart: 'carried', actionableAtStart: false })
      )
    ).toMatchObject({ kind: 'suppressed', reason: 'carried' });
  });

  it('uses lifecycle accuracy as a non-visible actionability guardrail', () => {
    expect(new LifecycleAccuracyDetector().detect(enriched())).toMatchObject({
      kind: 'not-applicable',
    });
    expect(
      new LifecycleAccuracyDetector().detect(
        enriched({ coreStateAtStart: 'dead', actionableAtStart: false })
      )
    ).toMatchObject({ kind: 'suppressed', reason: 'dead' });
  });

  it('suppresses untyped redeploy telemetry until the SDK supports it', () => {
    const redeploy = event('event-redeploy', 'generic', {
      sourceType: 'LogPlayerRedeploy',
      known: false,
      evidenceEligible: false,
    });

    expect(
      new RedeployContextDetector().detect(enriched({ contextEvents: [redeploy] }))
    ).toMatchObject({ kind: 'suppressed', reason: 'unsupported-event' });
  });
});
