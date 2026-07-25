import type { TelemetryEvent } from '@j03fr0st/pubg-ts';
import { PlayerStateProjectorService } from '../../../src/services/player-state-projector.service';
import { TelemetryTimelineBuilderService } from '../../../src/services/telemetry-timeline-builder.service';

const start = new Date('2026-07-25T10:00:00.000Z');
const common = { isGame: 1 };
const player = { name: 'Player', accountId: 'account.player' };
const enemy = { name: 'Enemy', accountId: 'account.enemy' };

const raw = (
  sourceType: string,
  seconds: number,
  values: Record<string, unknown>
): TelemetryEvent =>
  ({
    _T: sourceType,
    _D: new Date(start.getTime() + seconds * 1000).toISOString(),
    common,
    ...values,
  }) as unknown as TelemetryEvent;

const project = (events: TelemetryEvent[]) => {
  const timeline = new TelemetryTimelineBuilderService().build(events, start);
  return new PlayerStateProjectorService().project(timeline, [player]);
};

describe('PlayerStateProjectorService', () => {
  it('projects alive to knocked to revived to alive', () => {
    const projection = project([
      raw('LogPlayerMakeGroggy', 10, { attacker: enemy, victim: player }),
      raw('LogPlayerRevive', 18, { reviver: enemy, victim: player }),
    ]);

    expect(projection.players.get(player.accountId)?.core).toMatchObject([
      { state: 'alive', startTimeSeconds: 0, endTimeSeconds: 10 },
      { state: 'knocked', startTimeSeconds: 10, endTimeSeconds: 18 },
      { state: 'alive', startTimeSeconds: 18, endTimeSeconds: null },
    ]);
  });

  it('projects knocked to carried to knocked', () => {
    const projection = project([
      raw('LogPlayerMakeGroggy', 10, { attacker: enemy, victim: player }),
      raw('LogCharacterCarry', 12, { character: player, carryState: 'Carry' }),
      raw('LogCharacterCarry', 16, { character: player, carryState: 'Drop' }),
    ]);

    expect(
      projection.players.get(player.accountId)?.core.map((interval) => interval.state)
    ).toEqual(['alive', 'knocked', 'carried', 'knocked']);
  });

  it.each([
    [
      [
        raw('LogPlayerMakeGroggy', 10, { attacker: enemy, victim: player }),
        raw('LogPlayerKillV2', 18, { killer: enemy, victim: player }),
      ],
      ['alive', 'knocked', 'dead'],
    ],
    [[raw('LogPlayerKillV2', 18, { killer: enemy, victim: player })], ['alive', 'dead']],
  ])('projects valid death path %#', (events, expectedStates) => {
    const projection = project(events);
    expect(
      projection.players.get(player.accountId)?.core.map((interval) => interval.state)
    ).toEqual(expectedStates);
  });

  it('restores the prior state after logout and login', () => {
    const projection = project([
      raw('LogPlayerLogout', 5, { accountId: player.accountId }),
      raw('LogPlayerLogin', 9, { accountId: player.accountId }),
    ]);

    expect(projection.players.get(player.accountId)?.core).toMatchObject([
      { state: 'alive', endTimeSeconds: 5 },
      { state: 'disconnected', startTimeSeconds: 5, endTimeSeconds: 9 },
      { state: 'alive', startTimeSeconds: 9, endTimeSeconds: null },
    ]);
  });

  it('projects vehicle and swimming activity independently from core lifecycle', () => {
    const projection = project([
      raw('LogVehicleRide', 2, { character: player, vehicle: { vehicleId: 'vehicle-1' } }),
      raw('LogVehicleLeave', 7, { character: player, vehicle: { vehicleId: 'vehicle-1' } }),
      raw('LogSwimStart', 9, { character: player }),
      raw('LogSwimEnd', 14, { character: player }),
    ]);

    expect(projection.players.get(player.accountId)?.activities).toMatchObject([
      { state: 'in-vehicle', startTimeSeconds: 2, endTimeSeconds: 7 },
      { state: 'swimming', startTimeSeconds: 9, endTimeSeconds: 14 },
    ]);
  });

  it('diagnoses contradictory transitions without inventing state', () => {
    const projection = project([
      raw('LogPlayerRevive', 5, { reviver: enemy, victim: player }),
      raw('LogCharacterCarry', 8, { character: player, carryState: 'Carry' }),
    ]);

    expect(projection.players.get(player.accountId)?.core).toHaveLength(1);
    expect(projection.diagnostics.map((diagnostic) => diagnostic.code)).toEqual([
      'ambiguous-transition',
      'ambiguous-transition',
    ]);
  });

  it('does not apply another player lifecycle event to the monitored player', () => {
    const other = { name: 'Other', accountId: 'account.other' };
    const projection = project([
      raw('LogPlayerMakeGroggy', 10, { attacker: enemy, victim: other }),
      raw('LogPlayerKillV2', 18, { killer: enemy, victim: other }),
    ]);

    expect(projection.players.get(player.accountId)?.core).toMatchObject([
      { state: 'alive', startTimeSeconds: 0, endTimeSeconds: null },
    ]);
  });
});
