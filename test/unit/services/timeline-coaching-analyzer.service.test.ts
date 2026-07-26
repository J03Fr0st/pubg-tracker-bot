import type { TelemetryEvent } from '@j03fr0st/pubg-ts';
import { CoachingDetectorRegistryService } from '../../../src/services/coaching-detector-registry.service';
import {
  CoachingCandidateRankerService,
  CoachingNarrativeBuilderService,
} from '../../../src/services/coaching-insight-ranking.service';
import {
  DamageConversionDetector,
  FailedResetDetector,
  MovementExposureDetector,
  RecoveryDecisionDetector,
  TeamSpacingDetector,
} from '../../../src/services/core-coaching-detectors.service';
import { EncounterSegmenterService } from '../../../src/services/encounter-segmenter.service';
import {
  ArmorDisadvantageDetector,
  CarryContextDetector,
  LifecycleAccuracyDetector,
  RedeployContextDetector,
  UtilityUsageDetector,
  VehicleDecisionDetector,
  ZoneRotationDetector,
} from '../../../src/services/match-context-coaching-detectors.service';
import { PlayerStateProjectorService } from '../../../src/services/player-state-projector.service';
import { TelemetryContextEnricherService } from '../../../src/services/telemetry-context-enricher.service';
import { TelemetryTimelineBuilderService } from '../../../src/services/telemetry-timeline-builder.service';
import { TimelineCoachingAnalyzerService } from '../../../src/services/timeline-coaching-analyzer.service';
import { TimelineCoachingShadowService } from '../../../src/services/timeline-coaching-shadow.service';
import type { MatchAnalysis } from '../../../src/types/analytics-results.types';

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

const analysis = {
  matchId: 'match-1',
  playerAnalyses: new Map([
    [
      player.name,
      {
        playerName: player.name,
        accountId: player.accountId,
        matchStartTime: start,
      },
    ],
  ]),
  processingTimeMs: 0,
  totalEventsProcessed: 0,
} as MatchAnalysis;

const createAnalyzer = () =>
  new TimelineCoachingAnalyzerService(
    new TimelineCoachingShadowService(
      new TelemetryTimelineBuilderService(),
      new PlayerStateProjectorService(),
      new EncounterSegmenterService()
    ),
    new TelemetryContextEnricherService(),
    new CoachingDetectorRegistryService([
      new LifecycleAccuracyDetector(),
      new FailedResetDetector(),
      new TeamSpacingDetector(),
      new DamageConversionDetector(),
      new MovementExposureDetector(),
      new RecoveryDecisionDetector(),
      new ZoneRotationDetector(),
      new ArmorDisadvantageDetector(),
      new UtilityUsageDetector(),
      new VehicleDecisionDetector(),
      new CarryContextDetector(),
      new RedeployContextDetector(),
    ]),
    new CoachingCandidateRankerService(),
    new CoachingNarrativeBuilderService()
  );

describe('TimelineCoachingAnalyzerService', () => {
  it('does not call knock-to-death time a reset opportunity', () => {
    const events = [
      raw('LogPlayerTakeDamage', 2, {
        attacker: enemy,
        victim: player,
        damage: 100,
      }),
      raw('LogPlayerMakeGroggy', 2, { attacker: enemy, victim: player }),
      raw('LogPlayerKillV2', 10, { killer: enemy, victim: player }),
    ];

    const insights = createAnalyzer().analyze(analysis, [player], events);

    expect(insights.flatMap((insight) => insight.evidence).join(' ')).not.toContain(
      'before creating a reset'
    );
  });

  it('emits visible reset coaching when heavy damage leaves actionable recovery time', () => {
    const events = [
      raw('LogPlayerTakeDamage', 2, {
        attacker: enemy,
        victim: player,
        damage: 70,
      }),
      raw('LogPlayerMakeGroggy', 10, { attacker: enemy, victim: player }),
    ];

    const insights = createAnalyzer().analyze(analysis, [player], events);

    expect(insights).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          category: 'fight-reset',
          evidence: expect.arrayContaining([
            'Enemy hit you for 70 damage, then 8s later you got knocked before creating a reset.',
          ]),
        }),
      ])
    );
  });

  it('produces identical results from live and JSON-cached raw telemetry', () => {
    const events = [
      raw('LogPlayerTakeDamage', 2, {
        attacker: enemy,
        victim: player,
        damage: 70,
      }),
      raw('LogPlayerMakeGroggy', 10, { attacker: enemy, victim: player }),
    ];

    const live = createAnalyzer().analyze(analysis, [player], events);
    const cached = createAnalyzer().analyze(
      analysis,
      [player],
      JSON.parse(JSON.stringify(events)) as TelemetryEvent[]
    );

    expect(cached).toEqual(live);
  });
});
