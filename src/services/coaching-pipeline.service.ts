import type { TelemetryEvent } from '@j03fr0st/pubg-ts';
import type { MatchAnalysis, TrackedPlayerIdentity } from '../types/analytics-results.types';
import type { CoachingInsight, CoachingNarration } from '../types/coaching.types';
import type { CoachingPipelineResult } from '../types/coaching-pipeline.types';

type CoachingPipelineDeps = {
  analyze: (
    matchAnalysis: MatchAnalysis,
    trackedPlayers: TrackedPlayerIdentity[],
    rawEvents: TelemetryEvent[]
  ) => CoachingInsight[];
  narrate: (insights: CoachingInsight[]) => Promise<CoachingNarration>;
};

export class CoachingPipelineService {
  public constructor(private readonly deps: CoachingPipelineDeps) {}

  public async run(
    matchAnalysis: MatchAnalysis,
    trackedPlayers: TrackedPlayerIdentity[],
    rawEvents: TelemetryEvent[]
  ): Promise<CoachingPipelineResult> {
    let insights: CoachingInsight[];
    try {
      insights = this.deps.analyze(matchAnalysis, trackedPlayers, rawEvents);
    } catch (err) {
      return { kind: 'failed', reason: messageOf(err), stage: 'analyze' };
    }

    if (insights.length === 0) {
      return { kind: 'empty' };
    }

    try {
      const narration = await this.deps.narrate(insights);
      return { kind: 'ok', insights, narration };
    } catch (err) {
      return { kind: 'failed', reason: messageOf(err), stage: 'narrate' };
    }
  }
}

function messageOf(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
