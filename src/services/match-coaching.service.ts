import type { LogPlayerTakeDamage } from '@j03fr0st/pubg-ts';
import type { MatchAnalysis } from '../types/analytics-results.types';
import type { CoachingInsight } from '../types/coaching.types';
import { CoachingDecisionEngineService } from './coaching-decision-engine.service';
import { FightContextBuilderService } from './fight-context-builder.service';

export class MatchCoachingService {
  public constructor(
    private readonly fightContextBuilder = new FightContextBuilderService(),
    private readonly decisionEngine = new CoachingDecisionEngineService()
  ) {}

  public analyzeMatch(
    matchAnalysis: MatchAnalysis,
    trackedPlayerNames: string[],
    damageEvents: LogPlayerTakeDamage[] = []
  ): CoachingInsight[] {
    const contexts = this.fightContextBuilder.buildFightContexts(
      matchAnalysis,
      trackedPlayerNames,
      damageEvents
    );

    return this.decisionEngine.createInsights(contexts);
  }
}
