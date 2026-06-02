import type { LogHeal, LogItemUse, LogPlayerTakeDamage } from '@j03fr0st/pubg-ts';
import type { MatchAnalysis } from '../types/analytics-results.types';
import type { CoachingInsight, CoachingNarration } from '../types/coaching.types';
import type { CoachingPipelineResult } from '../types/coaching-pipeline.types';
import type { CoachingDecisionEngineService } from './coaching-decision-engine.service';
import type { FightContextBuilderService } from './fight-context-builder.service';

export interface CoachingAnalyzer {
  analyze(
    matchAnalysis: MatchAnalysis,
    trackedPlayerNames: string[],
    damageEvents: LogPlayerTakeDamage[],
    resetEvents?: Array<LogHeal | LogItemUse>
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

export interface CoachingPipelineDefaults {
  fightContextBuilder: FightContextBuilderService;
  decisionEngine: CoachingDecisionEngineService;
  narrate: CoachingNarrator['narrate'];
}

export namespace CoachingPipelineService {
  export function withDefaults(deps: CoachingPipelineDefaults): CoachingPipelineService {
    return new CoachingPipelineService({
      analyze: (analysis, names, damage, resetEvents) => {
        const contexts = deps.fightContextBuilder.buildFightContexts(
          analysis,
          names,
          damage,
          resetEvents
        );
        return deps.decisionEngine.createInsights(contexts);
      },
      narrate: deps.narrate,
    });
  }
}
