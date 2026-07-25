import type { TelemetryEvent } from '@j03fr0st/pubg-ts';
import type { TrackedPlayerIdentity } from '../types/analytics-results.types';
import type { TimelineShadowResult } from '../types/coaching-timeline.types';
import type { EncounterSegmenterService } from './encounter-segmenter.service';
import type { PlayerStateProjectorService } from './player-state-projector.service';
import type { TelemetryTimelineBuilderService } from './telemetry-timeline-builder.service';

export class TimelineCoachingShadowService {
  public constructor(
    private readonly timelineBuilder: TelemetryTimelineBuilderService,
    private readonly stateProjector: PlayerStateProjectorService,
    private readonly encounterSegmenter: EncounterSegmenterService
  ) {}

  public derive(
    rawEvents: TelemetryEvent[],
    matchStartTime: Date,
    monitoredPlayers: TrackedPlayerIdentity[]
  ): TimelineShadowResult {
    const timeline = this.timelineBuilder.build(rawEvents, matchStartTime);
    const state = this.stateProjector.project(timeline, monitoredPlayers);
    const encounters = this.encounterSegmenter.segment(timeline, state, monitoredPlayers);
    return { timeline, state, encounters };
  }
}
