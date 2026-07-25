import type { TelemetryEvent } from '@j03fr0st/pubg-ts';
import { EncounterSegmenterService } from '../../../src/services/encounter-segmenter.service';
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

const segment = (events: TelemetryEvent[]) => {
  const timeline = new TelemetryTimelineBuilderService().build(events, start);
  const state = new PlayerStateProjectorService().project(timeline, [player]);
  return new EncounterSegmenterService().segment(timeline, state, [player]);
};

describe('EncounterSegmenterService', () => {
  it('groups combat evidence for one monitored player and opponent', () => {
    const encounters = segment([
      raw('LogPlayerAttack', 2, { attacker: player }),
      raw('LogPlayerTakeDamage', 3, { attacker: player, victim: enemy, damage: 40 }),
      raw('LogArmorDestroy', 4, { attacker: player, victim: enemy }),
      raw('LogPlayerMakeGroggy', 5, { attacker: player, victim: enemy }),
    ]);

    expect(encounters).toEqual([
      expect.objectContaining({
        id: 'encounter-account.player-1',
        opponentAccountIds: ['account.enemy'],
        startTimeSeconds: 2,
        endTimeSeconds: 5,
        eventIds: ['event-0', 'event-1', 'event-2', 'event-3'],
        outcome: 'knock',
      }),
    ]);
  });

  it('does not let pre-revive damage seed a post-revive encounter', () => {
    const encounters = segment([
      raw('LogPlayerTakeDamage', 2, { attacker: enemy, victim: player, damage: 80 }),
      raw('LogPlayerMakeGroggy', 3, { attacker: enemy, victim: player }),
      raw('LogPlayerRevive', 12, { reviver: enemy, victim: player }),
      raw('LogPlayerTakeDamage', 14, { attacker: enemy, victim: player, damage: 20 }),
    ]);

    expect(encounters).toHaveLength(2);
    expect(encounters[0]).toMatchObject({
      eventIds: ['event-0', 'event-1'],
      outcome: 'knock',
    });
    expect(encounters[1]).toMatchObject({
      eventIds: ['event-3'],
      outcome: 'unknown',
    });
  });

  it('closes the encounter on death', () => {
    const encounters = segment([
      raw('LogPlayerTakeDamage', 2, { attacker: enemy, victim: player, damage: 40 }),
      raw('LogPlayerKillV2', 5, { killer: enemy, victim: player }),
      raw('LogPlayerTakeDamage', 6, { attacker: enemy, victim: player, damage: 5 }),
    ]);

    expect(encounters[0]).toMatchObject({
      eventIds: ['event-0', 'event-1'],
      outcome: 'death',
    });
    expect(encounters[1].eventIds).toEqual(['event-2']);
  });

  it('starts a new encounter after the inactivity threshold', () => {
    const encounters = segment([
      raw('LogPlayerTakeDamage', 2, { attacker: enemy, victim: player, damage: 10 }),
      raw('LogPlayerTakeDamage', 30, { attacker: enemy, victim: player, damage: 10 }),
    ]);

    expect(encounters.map((encounter) => encounter.eventIds)).toEqual([['event-0'], ['event-1']]);
    expect(encounters[0].outcome).toBe('disengaged');
  });

  it('does not merge different account IDs because their names match', () => {
    const otherEnemy = { name: 'Enemy', accountId: 'account.other-enemy' };
    const encounters = segment([
      raw('LogPlayerTakeDamage', 2, { attacker: enemy, victim: player, damage: 10 }),
      raw('LogPlayerTakeDamage', 3, { attacker: otherEnemy, victim: player, damage: 10 }),
    ]);

    expect(encounters.map((encounter) => encounter.opponentAccountIds)).toEqual([
      ['account.enemy'],
      ['account.other-enemy'],
    ]);
  });

  it('keeps environmental damage without inventing an opponent', () => {
    const encounters = segment([
      raw('LogPlayerTakeDamage', 2, {
        victim: player,
        damage: 10,
        damageTypeCategory: 'Damage_BlueZone',
      }),
    ]);

    expect(encounters[0]).toMatchObject({ opponentAccountIds: [] });
  });

  it('creates stable encounter IDs when combat events share a timestamp', () => {
    const encounters = segment([
      raw('LogPlayerTakeDamage', 2, { attacker: enemy, victim: player, damage: 10 }),
      raw('LogPlayerMakeGroggy', 2, { attacker: enemy, victim: player }),
      raw('LogPlayerTakeDamage', 2, { attacker: enemy, victim: player, damage: 5 }),
    ]);

    expect(encounters.map((encounter) => encounter.id)).toEqual([
      'encounter-account.player-1',
      'encounter-account.player-2',
    ]);
  });
});
