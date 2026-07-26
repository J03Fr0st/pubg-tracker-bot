import type { TelemetryEvent } from '@j03fr0st/pubg-ts';
import { EncounterSegmenterService } from '../../../src/services/encounter-segmenter.service';
import { PlayerStateProjectorService } from '../../../src/services/player-state-projector.service';
import { TelemetryTimelineBuilderService } from '../../../src/services/telemetry-timeline-builder.service';
import { TimelineCoachingShadowService } from '../../../src/services/timeline-coaching-shadow.service';

describe('TimelineCoachingShadowService', () => {
  it('derives timeline, state, and encounters without mutating raw telemetry', () => {
    const start = new Date('2026-07-25T10:00:00.000Z');
    const player = { name: 'Player', accountId: 'account.player' };
    const enemy = { name: 'Enemy', accountId: 'account.enemy' };
    const rawEvents = [
      {
        _T: 'LogPlayerTakeDamage',
        _D: '2026-07-25T10:00:02.000Z',
        common: { isGame: 1 },
        attacker: enemy,
        victim: player,
        damage: 100,
      },
      {
        _T: 'LogPlayerMakeGroggy',
        _D: '2026-07-25T10:00:02.000Z',
        common: { isGame: 1 },
        attacker: enemy,
        victim: player,
      },
      {
        _T: 'LogPlayerKillV2',
        _D: '2026-07-25T10:00:10.000Z',
        common: { isGame: 1 },
        killer: enemy,
        victim: player,
      },
    ] as unknown as TelemetryEvent[];
    const snapshot = JSON.stringify(rawEvents);
    const service = new TimelineCoachingShadowService(
      new TelemetryTimelineBuilderService(),
      new PlayerStateProjectorService(),
      new EncounterSegmenterService()
    );

    const result = service.derive(rawEvents, start, [player]);

    expect(result.timeline.events).toHaveLength(3);
    expect(result.state.players.get(player.accountId)?.core).toMatchObject([
      { state: 'alive', endTimeSeconds: 2 },
      { state: 'knocked', startTimeSeconds: 2, endTimeSeconds: 10 },
      { state: 'dead', startTimeSeconds: 10 },
    ]);
    expect(result.encounters.map((encounter) => encounter.eventIds)).toEqual([
      ['event-0', 'event-1'],
      ['event-2'],
    ]);
    expect(JSON.stringify(rawEvents)).toBe(snapshot);
  });
});
