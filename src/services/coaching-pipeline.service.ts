import type { LogHeal, LogItemUse, LogPlayerTakeDamage } from '@j03fr0st/pubg-ts';
import type { MatchAnalysis } from '../types/analytics-results.types';
import type { CoachingInsight, CoachingNarration } from '../types/coaching.types';
import type { CoachingPipelineResult } from '../types/coaching-pipeline.types';

type CoachingPipelineDeps = {
  analyze: (
    matchAnalysis: MatchAnalysis,
    trackedPlayerNames: string[],
    damageEvents: LogPlayerTakeDamage[],
    resetEvents: Array<LogHeal | LogItemUse>
  ) => CoachingInsight[];
  narrate: (insights: CoachingInsight[]) => Promise<CoachingNarration>;
};

export class CoachingPipelineService {
  public constructor(private readonly deps: CoachingPipelineDeps) {}

  public async run(
    matchAnalysis: MatchAnalysis,
    trackedPlayerNames: string[],
    damageEvents: LogPlayerTakeDamage[],
    resetEvents: Array<LogHeal | LogItemUse> = []
  ): Promise<CoachingPipelineResult> {
    let insights: CoachingInsight[];
    try {
      insights = this.deps.analyze(matchAnalysis, trackedPlayerNames, damageEvents, resetEvents);
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
