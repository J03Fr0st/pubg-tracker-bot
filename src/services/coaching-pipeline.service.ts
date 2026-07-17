import type {
  CoachingAnalysisInput,
  CoachingInsight,
  CoachingNarration,
} from '../types/coaching.types';
import type { CoachingPipelineResult } from '../types/coaching-pipeline.types';
import type { CoachingDecisionEngineService } from './coaching-decision-engine.service';

type CoachingPipelineDeps = {
  decisionEngine: CoachingDecisionEngineService;
  narrate: (insights: CoachingInsight[]) => Promise<CoachingNarration>;
};

export class CoachingPipelineService {
  public constructor(private readonly deps: CoachingPipelineDeps) {}

  public async run(input: CoachingAnalysisInput): Promise<CoachingPipelineResult> {
    let insights: CoachingInsight[];
    try {
      insights = this.deps.decisionEngine.createInsights(input);
    } catch (err) {
      return { kind: 'failed', reason: messageOf(err), stage: 'analyze' };
    }
    if (insights.length === 0) return { kind: 'empty' };
    try {
      return { kind: 'ok', insights, narration: await this.deps.narrate(insights) };
    } catch (err) {
      return { kind: 'failed', reason: messageOf(err), stage: 'narrate' };
    }
  }
}

function messageOf(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
