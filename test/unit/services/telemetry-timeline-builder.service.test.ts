import type { TelemetryEvent } from '@j03fr0st/pubg-ts';
import {
  SUPPORTED_TELEMETRY_SOURCE_TYPES,
  TelemetryTimelineBuilderService,
} from '../../../src/services/telemetry-timeline-builder.service';

const common = { isGame: 1 };
const start = new Date('2026-07-25T10:00:00.000Z');

const event = (value: Record<string, unknown>): TelemetryEvent =>
  value as unknown as TelemetryEvent;

describe('TelemetryTimelineBuilderService', () => {
  const builder = new TelemetryTimelineBuilderService();

  it('sorts by valid timestamp and preserves source order for ties and malformed events', () => {
    const input = [
      event({ _T: 'UnknownLate', _D: 'invalid', common }),
      event({ _T: 'LogPhaseChange', _D: '2026-07-25T10:00:05.000Z', common, phase: 2 }),
      event({ _T: 'LogMatchDefinition', common }),
      event({ _T: 'LogPlayerLogin', _D: '2026-07-25T10:00:02.000Z', common }),
      event({ _T: 'LogPlayerLogout', _D: '2026-07-25T10:00:02.000Z', common }),
    ];

    const timeline = builder.build(input, start);

    expect(timeline.events.map((entry) => entry.sourceIndex)).toEqual([3, 4, 1, 0, 2]);
    expect(timeline.events.map((entry) => entry.matchTimeSeconds)).toEqual([2, 2, 5, null, null]);
    expect(timeline.diagnostics.map((diagnostic) => diagnostic.code)).toEqual([
      'invalid-timestamp',
      'unknown-event-type',
      'missing-timestamp',
    ]);
    expect(input.map((entry) => entry._T)).toEqual([
      'UnknownLate',
      'LogPhaseChange',
      'LogMatchDefinition',
      'LogPlayerLogin',
      'LogPlayerLogout',
    ]);
  });

  it('extracts account-first identities, positions, and combat evidence', () => {
    const timeline = builder.build(
      [
        event({
          _T: 'LogPlayerTakeDamage',
          _D: '2026-07-25T10:00:03.000Z',
          common,
          attacker: {
            accountId: 'account.enemy',
            name: 'Enemy',
            teamId: 2,
            location: { x: 100, y: 200, z: 300 },
          },
          victim: {
            accountId: 'account.player',
            name: 'Player',
            teamId: 1,
            location: { x: 400, y: 500, z: 600 },
          },
          damage: 63.5,
          damageTypeCategory: 'Damage_Gun',
          damageReason: 'TorsoShot',
          damageCauserName: 'WeapM416_C',
        }),
      ],
      start
    );

    expect(timeline.events[0]).toMatchObject({
      id: 'event-0',
      category: 'damage',
      sourceType: 'LogPlayerTakeDamage',
      matchTimeSeconds: 3,
      actor: {
        accountId: 'account.enemy',
        name: 'Enemy',
        teamId: 2,
        confidence: 'high',
      },
      target: {
        accountId: 'account.player',
        name: 'Player',
        teamId: 1,
        confidence: 'high',
      },
      actorPosition: { x: 100, y: 200, z: 300 },
      targetPosition: { x: 400, y: 500, z: 600 },
      data: {
        damage: 63.5,
        damageTypeCategory: 'Damage_Gun',
        damageReason: 'TorsoShot',
        damageCauserName: 'WeapM416_C',
      },
    });
  });

  it('lowers identity confidence when only a name is available', () => {
    const timeline = builder.build(
      [
        event({
          _T: 'LogPlayerAttack',
          _D: '2026-07-25T10:00:01.000Z',
          common,
          attacker: { name: 'NameOnly' },
        }),
      ],
      start
    );

    expect(timeline.events[0].actor).toEqual({
      accountId: undefined,
      name: 'NameOnly',
      confidence: 'medium',
    });
  });

  it.each([
    ['LogPlayerAttack', 'attack'],
    ['LogPlayerTakeDamage', 'damage'],
    ['LogPlayerMakeGroggy', 'knock'],
    ['LogPlayerKillV2', 'death'],
    ['LogPlayerRevive', 'revive'],
    ['LogCharacterCarry', 'carry'],
    ['LogPlayerLogin', 'login'],
    ['LogPlayerLogout', 'logout'],
    ['LogPlayerPosition', 'position'],
    ['LogHeal', 'heal'],
    ['LogSwimStart', 'swim-start'],
    ['LogSwimEnd', 'swim-end'],
    ['LogVehicleRide', 'vehicle-enter'],
    ['LogVehicleLeave', 'vehicle-exit'],
    ['LogVehicleDamage', 'vehicle-damage'],
    ['LogWheelDestroy', 'vehicle-wheel-destroy'],
    ['LogVehicleDestroy', 'vehicle-destroy'],
    ['LogArmorDestroy', 'armor-destroy'],
    ['LogPlayerUseThrowable', 'utility'],
    ['LogItemPickup', 'inventory'],
    ['LogGameStatePeriodic', 'game-state'],
    ['LogPhaseChange', 'phase'],
    ['LogMatchStart', 'match'],
  ] as const)('normalizes %s as %s', (sourceType, category) => {
    const timeline = builder.build(
      [event({ _T: sourceType, _D: '2026-07-25T10:00:01.000Z', common })],
      start
    );

    expect(timeline.events[0]).toMatchObject({ sourceType, category, known: true });
  });

  it('retains unknown events as non-evidentiary generic records', () => {
    const timeline = builder.build(
      [event({ _T: 'LogFutureFeature', _D: '2026-07-25T10:00:01.000Z', common })],
      start
    );

    expect(timeline.events[0]).toMatchObject({
      sourceType: 'LogFutureFeature',
      category: 'generic',
      known: false,
      evidenceEligible: false,
    });
    expect(timeline.diagnostics[0]).toMatchObject({
      code: 'unknown-event-type',
      sourceIndex: 0,
    });
  });

  it('catalogues every event type in the installed SDK contract', () => {
    expect(SUPPORTED_TELEMETRY_SOURCE_TYPES).toEqual([
      'LogArmorDestroy',
      'LogCarePackageLand',
      'LogCarePackageSpawn',
      'LogCharacterCarry',
      'LogEmPickupLiftOff',
      'LogGameStatePeriodic',
      'LogHeal',
      'LogItemAttach',
      'LogItemDetach',
      'LogItemDrop',
      'LogItemEquip',
      'LogItemPickup',
      'LogItemPickupFromCarepackage',
      'LogItemPickupFromLootBox',
      'LogItemPickupFromVehicleTrunk',
      'LogItemPutToVehicleTrunk',
      'LogItemUnequip',
      'LogItemUse',
      'LogMatchDefinition',
      'LogMatchEnd',
      'LogMatchStart',
      'LogObjectDestroy',
      'LogObjectInteraction',
      'LogParachuteLanding',
      'LogPhaseChange',
      'LogPlayerAttack',
      'LogPlayerCreate',
      'LogPlayerDestroyProp',
      'LogPlayerKill',
      'LogPlayerKillV2',
      'LogPlayerLogin',
      'LogPlayerLogout',
      'LogPlayerMakeGroggy',
      'LogPlayerPosition',
      'LogPlayerRevive',
      'LogPlayerTakeDamage',
      'LogPlayerUseFlareGun',
      'LogPlayerUseThrowable',
      'LogSwimEnd',
      'LogSwimStart',
      'LogVaultStart',
      'LogVehicleDamage',
      'LogVehicleDestroy',
      'LogVehicleLeave',
      'LogVehicleRide',
      'LogWeaponFireCount',
      'LogWheelDestroy',
    ]);
  });
});
