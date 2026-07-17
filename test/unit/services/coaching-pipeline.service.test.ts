import { CoachingDecisionEngineService } from '../../../src/services/coaching-decision-engine.service';
import { CoachingPipelineService } from '../../../src/services/coaching-pipeline.service';
import type { MatchAnalysis } from '../../../src/types/analytics-results.types';
import type {
  CoachingAnalysisInput,
  CoachingInsight,
  CoachingNarration,
} from '../../../src/types/coaching.types';

const fakeMatchAnalysis: MatchAnalysis = {
  matchId: 'm1',
  playerAnalyses: new Map(),
  processingTimeMs: 0,
  totalEventsProcessed: 0,
};
const input: CoachingAnalysisInput = {
  matchAnalysis: fakeMatchAnalysis,
  monitoredPlayers: [{ pubgId: 'account.alice', name: 'Alice', rosterId: 'roster-1' }],
  telemetryEvents: [],
};
const insight: CoachingInsight = {
  playerName: 'Alice',
  category: 'decisive-mistake',
  kind: 'decisive-mistake',
  title: 'Decisive mistake',
  timestamp: new Date('2024-01-01T00:00:00.000Z'),
  matchTimeSeconds: 120,
  severity: 'high',
  confidence: 'high',
  evidence: ['x'],
  recommendation: 'r',
};
const narration: CoachingNarration = {
  sections: [{ playerName: 'Alice', title: 'Decisive mistake', lines: ['line'] }],
};

describe('CoachingPipelineService', () => {
  afterEach(() => jest.restoreAllMocks());

  it('returns ok and forwards the complete analysis input', async () => {
    const decisionEngine = new CoachingDecisionEngineService();
    const createInsights = jest.spyOn(decisionEngine, 'createInsights').mockReturnValue([insight]);
    const pipeline = new CoachingPipelineService({
      decisionEngine,
      narrate: jest.fn().mockResolvedValue(narration),
    });

    await expect(pipeline.run(input)).resolves.toEqual({
      kind: 'ok',
      insights: [insight],
      narration,
    });
    expect(createInsights).toHaveBeenCalledWith(input);
  });

  it('returns empty without narration when analysis has no insights', async () => {
    const decisionEngine = new CoachingDecisionEngineService();
    jest.spyOn(decisionEngine, 'createInsights').mockReturnValue([]);
    const narrate = jest.fn();
    const pipeline = new CoachingPipelineService({ decisionEngine, narrate });

    await expect(pipeline.run(input)).resolves.toEqual({ kind: 'empty' });
    expect(narrate).not.toHaveBeenCalled();
  });

  it('returns the analyze stage when the decision engine throws', async () => {
    const decisionEngine = new CoachingDecisionEngineService();
    jest.spyOn(decisionEngine, 'createInsights').mockImplementation(() => {
      throw new Error('boom');
    });
    const pipeline = new CoachingPipelineService({ decisionEngine, narrate: jest.fn() });

    await expect(pipeline.run(input)).resolves.toEqual({
      kind: 'failed',
      reason: 'boom',
      stage: 'analyze',
    });
  });

  it('returns the narrate stage when narration rejects', async () => {
    const decisionEngine = new CoachingDecisionEngineService();
    jest.spyOn(decisionEngine, 'createInsights').mockReturnValue([insight]);
    const pipeline = new CoachingPipelineService({
      decisionEngine,
      narrate: jest.fn().mockRejectedValue(new Error('llm down')),
    });

    await expect(pipeline.run(input)).resolves.toEqual({
      kind: 'failed',
      reason: 'llm down',
      stage: 'narrate',
    });
  });
});
