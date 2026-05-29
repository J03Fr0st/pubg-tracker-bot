import type { LogPlayerTakeDamage } from '@j03fr0st/pubg-ts';
import type { MatchAnalysis } from '../types/analytics-results.types';
import type {
  CoachingInsight,
  CoachingNarration,
} from '../types/coaching.types';
import type { CoachingPipelineResult } from '../types/coaching-pipeline.types';

export interface CoachingAnalyzer {
  analyze(
    matchAnalysis: MatchAnalysis,
    trackedPlayerNames: string[],
    damageEvents: LogPlayerTakeDamage[]
  ): CoachingInsight[];
}

export interface CoachingNarrator {
  narrate(insights: CoachingInsight[]): Promise<CoachingNarration>;
}

export class CoachingPipelineService {
  public constructor(
    private readonly deps: {
      analyze: CoachingAnalyzer['analyze'];
      narrate: CoachingNarrator['narrate'];
    }
  ) {}

  public async run(
    matchAnalysis: MatchAnalysis,
    trackedPlayerNames: string[],
    damageEvents: LogPlayerTakeDamage[]
  ): Promise<CoachingPipelineResult> {
    let insights: CoachingInsight[];
    try {
      insights = this.deps.analyze(matchAnalysis, trackedPlayerNames, damageEvents);
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
