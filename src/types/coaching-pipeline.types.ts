import type { CoachingInsight, CoachingNarration } from './coaching.types';

export type CoachingPipelineResult =
  | { kind: 'empty' }
  | {
      kind: 'ok';
      insights: CoachingInsight[];
      narration: CoachingNarration;
    }
  | {
      kind: 'failed';
      reason: string;
      stage: 'analyze' | 'narrate';
    };
