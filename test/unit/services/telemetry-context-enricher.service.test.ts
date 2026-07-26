import type { TelemetryEvent } from '@j03fr0st/pubg-ts';
import { EncounterSegmenterService } from '../../../src/services/encounter-segmenter.service';
import { PlayerStateProjectorService } from '../../../src/services/player-state-projector.service';
import { TelemetryContextEnricherService } from '../../../src/services/telemetry-context-enricher.service';
import { TelemetryTimelineBuilderService } from '../../../src/services/telemetry-timeline-builder.service';

const start = new Date('2026-07-25T10:00:00.000Z');
const common = { isGame: 1 };
const player = { name: 'Player', accountId: 'account.player', teamId: 1 };
const teammate = { name: 'Teammate', accountId: 'account.teammate', teamId: 1 };
const enemy = { name: 'Enemy', accountId: 'account.enemy', teamId: 2 };

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

describe('TelemetryContextEnricherService', () => {
  it('derives encounter facts with exact source-event provenance', () => {
    const rawEvents = [
      raw('LogPlayerPosition', 8, {
        character: { ...teammate, location: { x: 10000, y: 0, z: 0 } },
      }),
      raw('LogPlayerPosition', 9, {
        character: { ...player, location: { x: 0, y: 0, z: 0 } },
      }),
      raw('LogVehicleLeave', 9, {
        character: player,
        vehicle: { vehicleId: 'vehicle-1' },
      }),
      raw('LogPlayerTakeDamage', 10, {
        victim: player,
        damage: 30,
        damageTypeCategory: 'Damage_BlueZone',
      }),
      raw('LogPlayerTakeDamage', 11, {
        attacker: enemy,
        victim: player,
        damage: 70,
      }),
      raw('LogArmorDestroy', 12, {
        attacker: enemy,
        victim: player,
        item: { itemId: 'Item_Armor_C_01_Lv2_C' },
      }),
      raw('LogPlayerTakeDamage', 13, {
        attacker: player,
        victim: enemy,
        damage: 20,
      }),
      raw('LogPlayerMakeGroggy', 14, { attacker: enemy, victim: player }),
      raw('LogVehicleLeave', 10, {
        character: player,
        vehicle: { vehicleId: 'vehicle-2' },
      }),
    ];
    const timeline = new TelemetryTimelineBuilderService().build(rawEvents, start);
    const monitored = [player, teammate];
    const state = new PlayerStateProjectorService().project(timeline, monitored);
    const encounters = new EncounterSegmenterService().segment(timeline, state, monitored);

    const enriched = new TelemetryContextEnricherService().enrich(
      timeline,
      state,
      encounters,
      monitored
    );
    const playerEncounter = enriched.find(
      (entry) => entry.encounter.monitoredPlayer.accountId === player.accountId
    );

    expect(playerEncounter).toMatchObject({
      coreStateAtStart: 'alive',
      actionableAtStart: true,
      damageTaken: { value: 70, evidenceEventIds: ['event-4'] },
      damageDealt: { value: 20, evidenceEventIds: ['event-6'] },
      blueZoneDamage: { value: 30, evidenceEventIds: ['event-3'] },
      armorDestroyed: { value: true, evidenceEventIds: ['event-5'] },
      recentVehicleExit: { value: true, evidenceEventIds: ['event-2'] },
      closestTeammate: {
        accountId: teammate.accountId,
        name: teammate.name,
        distanceMeters: 100,
        confidence: 'high',
        coreState: 'alive',
        evidenceEventIds: ['event-1', 'event-0'],
      },
    });
  });

  it('resolves teammate lifecycle state by source order when timestamps are equal', () => {
    const rawEvents = [
      raw('LogPlayerPosition', 1, {
        character: { ...teammate, location: { x: 1000, y: 0, z: 0 } },
      }),
      raw('LogPlayerPosition', 1, {
        character: { ...player, location: { x: 0, y: 0, z: 0 } },
      }),
      raw('LogPlayerMakeGroggy', 2, {
        attacker: enemy,
        victim: teammate,
      }),
      raw('LogPlayerTakeDamage', 2, {
        attacker: enemy,
        victim: player,
        damage: 40,
      }),
    ];
    const timeline = new TelemetryTimelineBuilderService().build(rawEvents, start);
    const monitored = [player, teammate];
    const state = new PlayerStateProjectorService().project(timeline, monitored);
    const encounters = new EncounterSegmenterService().segment(timeline, state, monitored);

    const playerEncounter = new TelemetryContextEnricherService()
      .enrich(timeline, state, encounters, monitored)
      .find((entry) => entry.encounter.monitoredPlayer.accountId === player.accountId);

    expect(playerEncounter?.closestTeammate).toMatchObject({
      accountId: teammate.accountId,
      coreState: 'knocked',
    });
  });

  it('does not treat a monitored player from another telemetry team as a teammate', () => {
    const otherTeam = { ...teammate, teamId: 2 };
    const rawEvents = [
      raw('LogPlayerPosition', 1, {
        character: { ...otherTeam, location: { x: 1000, y: 0, z: 0 } },
      }),
      raw('LogPlayerPosition', 1, {
        character: { ...player, location: { x: 0, y: 0, z: 0 } },
      }),
      raw('LogPlayerTakeDamage', 2, {
        attacker: enemy,
        victim: player,
        damage: 40,
      }),
    ];
    const timeline = new TelemetryTimelineBuilderService().build(rawEvents, start);
    const monitored = [player, otherTeam];
    const state = new PlayerStateProjectorService().project(timeline, monitored);
    const encounters = new EncounterSegmenterService().segment(timeline, state, monitored);

    const playerEncounter = new TelemetryContextEnricherService()
      .enrich(timeline, state, encounters, monitored)
      .find((entry) => entry.encounter.monitoredPlayer.accountId === player.accountId);

    expect(playerEncounter?.closestTeammate).toBeUndefined();
  });
});
