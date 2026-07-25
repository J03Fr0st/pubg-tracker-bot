import { CoachingPipelineService } from '../../../src/services/coaching-pipeline.service';
import type { MatchAnalysis } from '../../../src/types/analytics-results.types';
import type { CoachingInsight, CoachingNarration } from '../../../src/types/coaching.types';

describe('CoachingPipelineService', () => {
  const fakeMatchAnalysis = {
    matchId: 'm1',
    playerAnalyses: new Map(),
    processingTimeMs: 0,
    totalEventsProcessed: 0,
  } as MatchAnalysis;

  const insight: CoachingInsight = {
    playerName: 'Alice',
    category: 'decisive-mistake',
    kind: 'decisive-mistake',
    title: 'Decisive mistake',
    timestamp: new Date('2024-01-01T00:00:00Z'),
    matchTimeSeconds: 120,
    severity: 'high',
    confidence: 'high',
    evidence: ['x'],
    recommendation: 'r',
  };

  const narration: CoachingNarration = {
    sections: [{ playerName: 'Alice', title: 'Decisive mistake', lines: ['line'] }],
  };

  it('returns kind:ok with insights and narration on the happy path', async () => {
    const analyze = jest.fn().mockReturnValue([insight]);
    const deriveTimeline = jest.fn().mockReturnValue({
      timeline: { events: [], diagnostics: [] },
      state: { players: new Map(), diagnostics: [] },
      encounters: [],
    });
    const pipeline = new CoachingPipelineService({
      analyze,
      deriveTimeline,
      narrate: jest.fn().mockResolvedValue(narration),
    });
    const rawEvents = [
      {
        _T: 'LogHeal',
        _D: '2024-01-01T00:01:00.000Z',
        character: { name: 'Alice' },
      },
      {
        _T: 'LogPlayerRevive',
        _D: '2024-01-01T00:01:30.000Z',
        reviver: { name: 'Bob' },
        victim: { name: 'Alice' },
      },
    ] as never;
    const trackedPlayers = [{ name: 'Alice', accountId: 'account.alice' }];
    const result = await pipeline.run(fakeMatchAnalysis, trackedPlayers, rawEvents);

    expect(result).toEqual({ kind: 'ok', insights: [insight], narration });
    expect(deriveTimeline).toHaveBeenCalledWith(fakeMatchAnalysis, trackedPlayers, rawEvents);
    expect(analyze).toHaveBeenCalledWith(fakeMatchAnalysis, trackedPlayers, rawEvents);
  });

  it('returns kind:empty when analyze yields no insights', async () => {
    const pipeline = new CoachingPipelineService({
      analyze: jest.fn().mockReturnValue([]),
      narrate: jest.fn(),
    });

    const result = await pipeline.run(
      fakeMatchAnalysis,
      [{ name: 'Alice', accountId: 'account.alice' }],
      []
    );

    expect(result).toEqual({ kind: 'empty' });
  });

  it('returns kind:failed when analyze throws', async () => {
    const pipeline = new CoachingPipelineService({
      analyze: () => {
        throw new Error('boom');
      },
      narrate: jest.fn(),
    });

    const result = await pipeline.run(
      fakeMatchAnalysis,
      [{ name: 'Alice', accountId: 'account.alice' }],
      []
    );

    expect(result).toEqual({ kind: 'failed', reason: 'boom', stage: 'analyze' });
  });

  it('returns kind:failed when narrate rejects', async () => {
    const pipeline = new CoachingPipelineService({
      analyze: jest.fn().mockReturnValue([insight]),
      narrate: jest.fn().mockRejectedValue(new Error('llm down')),
    });

    const result = await pipeline.run(
      fakeMatchAnalysis,
      [{ name: 'Alice', accountId: 'account.alice' }],
      []
    );

    expect(result).toEqual({ kind: 'failed', reason: 'llm down', stage: 'narrate' });
  });

  it('supports direct wiring of coaching analysis and narration', async () => {
    const pipeline = new CoachingPipelineService({
      analyze: jest.fn().mockReturnValue([]),
      narrate: async () => ({ sections: [] }),
    });
    const result = await pipeline.run(fakeMatchAnalysis, [], []);
    expect(result.kind).toBe('empty');
  });

  it('keeps visible coaching available when shadow derivation fails', async () => {
    const pipeline = new CoachingPipelineService({
      analyze: jest.fn().mockReturnValue([insight]),
      deriveTimeline: () => {
        throw new Error('shadow failed');
      },
      narrate: jest.fn().mockResolvedValue(narration),
    });

    const result = await pipeline.run(
      fakeMatchAnalysis,
      [{ name: 'Alice', accountId: 'account.alice' }],
      []
    );

    expect(result).toEqual({ kind: 'ok', insights: [insight], narration });
  });
});
