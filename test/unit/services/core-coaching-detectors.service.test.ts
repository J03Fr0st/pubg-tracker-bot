import {
  DamageConversionDetector,
  FailedResetDetector,
  MovementExposureDetector,
  RecoveryDecisionDetector,
  TeamSpacingDetector,
} from '../../../src/services/core-coaching-detectors.service';
import type { EnrichedTelemetryEncounter } from '../../../src/types/coaching-detector.types';
import type { NormalizedTelemetryEvent } from '../../../src/types/coaching-timeline.types';

const player = { accountId: 'account.player', name: 'Player', confidence: 'high' as const };
const enemy = { accountId: 'account.enemy', name: 'Enemy', confidence: 'high' as const };

const event = (
  id: string,
  category: NormalizedTelemetryEvent['category'],
  seconds: number,
  values: Partial<NormalizedTelemetryEvent> = {}
): NormalizedTelemetryEvent => ({
  id,
  sourceIndex: Number(id.replace('event-', '')),
  sourceType: category,
  category,
  known: true,
  evidenceEligible: true,
  timestamp: new Date(`2026-07-25T10:00:${seconds.toString().padStart(2, '0')}.000Z`),
  matchTimeSeconds: seconds,
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
    opponentAccountIds: [enemy.accountId],
    startTimeSeconds: 2,
    endTimeSeconds: 10,
    eventIds: [],
    outcome: 'knock',
  },
  events: [],
  contextEvents: [],
  coreStateAtStart: 'alive',
  actionableAtStart: true,
  damageTaken: { value: 0, evidenceEventIds: [] },
  damageDealt: { value: 0, evidenceEventIds: [] },
  blueZoneDamage: { value: 0, evidenceEventIds: [] },
  armorDestroyed: { value: false, evidenceEventIds: [] },
  recentVehicleExit: { value: false, evidenceEventIds: [] },
  healEvents: [],
  movementEvents: [],
  utilityEvents: [],
  ...overrides,
});

describe('core coaching detectors', () => {
  it('creates a failed-reset candidate only for actionable same-opponent damage', () => {
    const heavy = event('event-1', 'damage', 2, {
      actor: enemy,
      target: player,
      data: { damage: 70 },
    });
    const knock = event('event-2', 'knock', 10, { actor: enemy, target: player });
    const detector = new FailedResetDetector();

    const candidate = detector.detect(
      enriched({
        events: [heavy, knock],
        damageTaken: { value: 70, evidenceEventIds: [heavy.id] },
      })
    );
    const suppressed = detector.detect(
      enriched({
        coreStateAtStart: 'knocked',
        actionableAtStart: false,
        events: [heavy, knock],
        damageTaken: { value: 70, evidenceEventIds: [heavy.id] },
      })
    );

    expect(candidate).toMatchObject({
      kind: 'candidate',
      candidate: {
        detectorId: 'failed-reset',
        dedupeKey: 'reset:encounter-account.player-1',
        category: 'fight-reset',
        claims: [{ eventIds: ['event-1', 'event-2'] }],
      },
    });
    expect(suppressed).toMatchObject({ kind: 'suppressed', reason: 'knocked' });
  });

  it('suppresses failed reset when a heal completed before the decisive event', () => {
    const heavy = event('event-1', 'damage', 2, {
      actor: enemy,
      target: player,
      data: { damage: 70 },
    });
    const heal = event('event-2', 'heal', 7, { actor: player });
    const knock = event('event-3', 'knock', 10, { actor: enemy, target: player });

    expect(
      new FailedResetDetector().detect(
        enriched({
          events: [heavy, knock],
          healEvents: [heal],
          damageTaken: { value: 70, evidenceEventIds: [heavy.id] },
        })
      )
    ).toMatchObject({ kind: 'suppressed', reason: 'reset-completed' });
  });

  it('does not treat environmental damage as a reset or recovery opportunity', () => {
    const blueZone = event('event-1', 'damage', 2, {
      target: player,
      data: { damage: 70, damageTypeCategory: 'Damage_BlueZone' },
    });
    const death = event('event-2', 'death', 10, {
      actor: enemy,
      target: player,
    });
    const encounter = enriched({
      events: [blueZone, death],
      damageTaken: { value: 0, evidenceEventIds: [] },
      blueZoneDamage: { value: 70, evidenceEventIds: [blueZone.id] },
    });

    expect(new FailedResetDetector().detect(encounter)).toMatchObject({
      kind: 'not-applicable',
    });
    expect(new RecoveryDecisionDetector().detect(encounter)).toMatchObject({
      kind: 'not-applicable',
    });
  });

  it('suppresses same-opponent reset wording when the decisive actor is unknown', () => {
    const heavy = event('event-1', 'damage', 2, {
      actor: enemy,
      target: player,
      data: { damage: 70 },
    });
    const death = event('event-2', 'death', 10, { target: player });

    expect(
      new FailedResetDetector().detect(
        enriched({
          events: [heavy, death],
          damageTaken: { value: 70, evidenceEventIds: [heavy.id] },
        })
      )
    ).toMatchObject({ kind: 'suppressed', reason: 'insufficient-evidence' });
  });

  it('creates team-spacing coaching from synchronized teammate positions', () => {
    const result = new TeamSpacingDetector().detect(
      enriched({
        closestTeammate: {
          accountId: 'account.teammate',
          name: 'Teammate',
          distanceMeters: 85,
          confidence: 'high',
          coreState: 'alive',
          evidenceEventIds: ['event-position-player', 'event-position-teammate'],
        },
      })
    );

    expect(result).toMatchObject({
      kind: 'candidate',
      candidate: {
        detectorId: 'team-spacing',
        category: 'team-spacing',
        claims: [{ eventIds: ['event-position-player', 'event-position-teammate'] }],
      },
    });
  });

  it('creates failed-trade coaching when a nearby teammate records no opponent damage', () => {
    const knock = event('event-1', 'knock', 10, {
      actor: enemy,
      target: player,
    });
    const result = new TeamSpacingDetector().detect(
      enriched({
        events: [knock],
        contextEvents: [knock],
        closestTeammate: {
          accountId: 'account.teammate',
          name: 'Teammate',
          distanceMeters: 30,
          confidence: 'high',
          coreState: 'alive',
          evidenceEventIds: ['event-position-player', 'event-position-teammate'],
        },
      })
    );

    expect(result).toMatchObject({
      kind: 'candidate',
      candidate: {
        detectorId: 'team-spacing',
        category: 'team-spacing',
        claims: [
          {
            eventIds: ['event-position-player', 'event-position-teammate', 'event-1'],
          },
        ],
      },
    });
  });

  it('does not claim a failed trade when the nearby teammate damaged the opponent', () => {
    const teammateDamage = event('event-1', 'damage', 8, {
      actor: {
        accountId: 'account.teammate',
        name: 'Teammate',
        confidence: 'high',
      },
      target: enemy,
      data: { damage: 35 },
    });
    const knock = event('event-2', 'knock', 10, {
      actor: enemy,
      target: player,
    });

    expect(
      new TeamSpacingDetector().detect(
        enriched({
          events: [knock],
          contextEvents: [teammateDamage, knock],
          closestTeammate: {
            accountId: 'account.teammate',
            name: 'Teammate',
            distanceMeters: 30,
            confidence: 'high',
            coreState: 'alive',
            evidenceEventIds: ['event-position-player', 'event-position-teammate'],
          },
        })
      )
    ).toMatchObject({ kind: 'not-applicable' });
  });

  it('suppresses team coaching when the nearest teammate is not actionable', () => {
    expect(
      new TeamSpacingDetector().detect(
        enriched({
          closestTeammate: {
            accountId: 'account.teammate',
            name: 'Teammate',
            distanceMeters: 85,
            confidence: 'high',
            coreState: 'knocked',
            evidenceEventIds: ['event-position-player', 'event-position-teammate'],
          },
        })
      )
    ).toMatchObject({ kind: 'suppressed', reason: 'teammate-unavailable' });
  });

  it('creates damage-conversion coaching for a materially losing trade', () => {
    const result = new DamageConversionDetector().detect(
      enriched({
        damageTaken: { value: 80, evidenceEventIds: ['event-taken'] },
        damageDealt: { value: 20, evidenceEventIds: ['event-dealt'] },
      })
    );

    expect(result).toMatchObject({
      kind: 'candidate',
      candidate: { detectorId: 'damage-conversion', category: 'damage-conversion' },
    });
  });

  it('suppresses environmental damage as damage-conversion evidence', () => {
    expect(
      new DamageConversionDetector().detect(
        enriched({
          encounter: {
            ...enriched().encounter,
            opponentAccountIds: [],
          },
          damageTaken: { value: 80, evidenceEventIds: ['event-blue-zone'] },
        })
      )
    ).toMatchObject({ kind: 'suppressed', reason: 'insufficient-evidence' });
  });

  it('creates movement-exposure coaching for repeated hits without repositioning', () => {
    const hit1 = event('event-1', 'damage', 2, {
      actor: enemy,
      target: player,
      data: { damage: 35 },
    });
    const hit2 = event('event-2', 'damage', 8, {
      actor: enemy,
      target: player,
      data: { damage: 40 },
    });
    const position1 = event('event-3', 'position', 2, {
      actor: player,
      actorPosition: { x: 0, y: 0, z: 0 },
    });
    const position2 = event('event-4', 'position', 8, {
      actor: player,
      actorPosition: { x: 500, y: 0, z: 0 },
    });

    expect(
      new MovementExposureDetector().detect(
        enriched({
          events: [hit1, hit2],
          movementEvents: [position1, position2],
          damageTaken: { value: 75, evidenceEventIds: [hit1.id, hit2.id] },
        })
      )
    ).toMatchObject({
      kind: 'candidate',
      candidate: { detectorId: 'movement-exposure', category: 'survival' },
    });
  });

  it('suppresses movement coaching when exposure starts while knocked', () => {
    const hit1 = event('event-1', 'damage', 3, {
      actor: enemy,
      target: player,
      data: { damage: 20 },
    });
    const hit2 = event('event-2', 'damage', 5, {
      actor: enemy,
      target: player,
      data: { damage: 20 },
    });

    expect(
      new MovementExposureDetector().detect(
        enriched({
          coreStateAtStart: 'knocked',
          actionableAtStart: false,
          events: [hit1, hit2],
          movementEvents: [
            event('event-3', 'position', 3, {
              actor: player,
              actorPosition: { x: 0, y: 0 },
            }),
            event('event-4', 'position', 5, {
              actor: player,
              actorPosition: { x: 0, y: 0 },
            }),
          ],
        })
      )
    ).toMatchObject({ kind: 'suppressed', reason: 'knocked' });
  });

  it('does not use movement samples that predate the repeated exposure', () => {
    const hit1 = event('event-1', 'damage', 8, {
      actor: enemy,
      target: player,
      data: { damage: 35 },
    });
    const hit2 = event('event-2', 'damage', 10, {
      actor: enemy,
      target: player,
      data: { damage: 40 },
    });

    expect(
      new MovementExposureDetector().detect(
        enriched({
          events: [hit1, hit2],
          movementEvents: [
            event('event-3', 'position', 2, {
              actor: player,
              actorPosition: { x: 0, y: 0 },
            }),
            event('event-4', 'position', 4, {
              actor: player,
              actorPosition: { x: 0, y: 0 },
            }),
          ],
          damageTaken: { value: 75, evidenceEventIds: [hit1.id, hit2.id] },
        })
      )
    ).toMatchObject({ kind: 'suppressed', reason: 'insufficient-evidence' });
  });

  it('creates recovery coaching when usable time passed without healing', () => {
    const heavy = event('event-1', 'damage', 2, {
      actor: enemy,
      target: player,
      data: { damage: 70 },
    });
    const knock = event('event-2', 'knock', 10, { actor: enemy, target: player });

    expect(
      new RecoveryDecisionDetector().detect(
        enriched({
          events: [heavy, knock],
          damageTaken: { value: 70, evidenceEventIds: [heavy.id] },
        })
      )
    ).toMatchObject({
      kind: 'candidate',
      candidate: {
        detectorId: 'recovery-decision',
        dedupeKey: 'reset:encounter-account.player-1',
      },
    });
  });

  it('uses only healing completed after heavy damage as recovery evidence', () => {
    const before = event('event-1', 'heal', 1, { actor: player });
    const heavy = event('event-2', 'damage', 2, {
      actor: enemy,
      target: player,
      data: { damage: 70 },
    });
    const after = event('event-3', 'heal', 7, { actor: player });
    const knock = event('event-4', 'knock', 10, { actor: enemy, target: player });
    const detector = new RecoveryDecisionDetector();

    expect(
      detector.detect(
        enriched({
          events: [heavy, knock],
          healEvents: [before],
          damageTaken: { value: 70, evidenceEventIds: [heavy.id] },
        })
      )
    ).toMatchObject({ kind: 'candidate' });
    expect(
      detector.detect(
        enriched({
          events: [heavy, knock],
          healEvents: [before, after],
          damageTaken: { value: 70, evidenceEventIds: [heavy.id] },
        })
      )
    ).toMatchObject({ kind: 'suppressed', reason: 'reset-completed' });
  });
});
