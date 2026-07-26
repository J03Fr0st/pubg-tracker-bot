import type { TelemetryEvent } from '@j03fr0st/pubg-ts';
import type { MatchAnalysis, TrackedPlayerIdentity } from '../types/analytics-results.types';
import type { CoachingInsight } from '../types/coaching.types';
import type { CoachingDetectorRegistryService } from './coaching-detector-registry.service';
import type {
  CoachingCandidateRankerService,
  CoachingNarrativeBuilderService,
} from './coaching-insight-ranking.service';
import type { TelemetryContextEnricherService } from './telemetry-context-enricher.service';
import type { TimelineCoachingShadowService } from './timeline-coaching-shadow.service';

export class TimelineCoachingAnalyzerService {
  public constructor(
    private readonly timeline: TimelineCoachingShadowService,
    private readonly enricher: TelemetryContextEnricherService,
    private readonly detectors: CoachingDetectorRegistryService,
    private readonly ranker: CoachingCandidateRankerService,
    private readonly narrative: CoachingNarrativeBuilderService
  ) {}

  public analyze(
    matchAnalysis: MatchAnalysis,
    monitoredPlayers: TrackedPlayerIdentity[],
    rawEvents: TelemetryEvent[]
  ): CoachingInsight[] {
    const firstPlayer = matchAnalysis.playerAnalyses.values().next().value;
    if (!firstPlayer) return [];
    const derived = this.timeline.derive(rawEvents, firstPlayer.matchStartTime, monitoredPlayers);
    const enriched = this.enricher.enrich(
      derived.timeline,
      derived.state,
      derived.encounters,
      monitoredPlayers
    );
    const detectorResults = this.detectors.run(enriched);
    const ranked = this.ranker.rank(detectorResults);
    return this.narrative.build(ranked);
  }
}
