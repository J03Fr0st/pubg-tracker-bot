import {
  CoachingCandidateRankerService,
  CoachingNarrativeBuilderService,
} from '../../../src/services/coaching-insight-ranking.service';
import type {
  CoachingCandidate,
  CoachingDetectorResult,
} from '../../../src/types/coaching-detector.types';

const candidate = (
  detectorId: string,
  overrides: Partial<CoachingCandidate> = {}
): CoachingCandidate => ({
  detectorId,
  dedupeKey: `${detectorId}:encounter-1`,
  player: { accountId: 'account.player', name: 'Player', confidence: 'high' },
  category: 'survival',
  title: 'Decisive mistake',
  timestamp: new Date('2026-07-25T10:00:10.000Z'),
  matchTimeSeconds: 10,
  severity: 'medium',
  confidence: 'high',
  actionability: 0.8,
  causalProximity: 1,
  claims: [{ text: detectorId, eventIds: [`event-${detectorId}`], confidence: 'high' }],
  recommendation: `Fix ${detectorId}`,
  betterPlay: [`Do ${detectorId}`],
  ...overrides,
});

const result = (value: CoachingCandidate): CoachingDetectorResult => ({
  kind: 'candidate',
  candidate: value,
});

describe('CoachingCandidateRankerService', () => {
  it('deduplicates overlapping candidates, favors stronger evidence, and caps each player', () => {
    const weakReset = candidate('recovery-decision', {
      dedupeKey: 'reset:encounter-1',
      confidence: 'medium',
    });
    const strongReset = candidate('failed-reset', {
      dedupeKey: 'reset:encounter-1',
      severity: 'high',
      confidence: 'high',
    });

    const ranked = new CoachingCandidateRankerService().rank([
      result(weakReset),
      result(candidate('team-spacing', { category: 'team-spacing' })),
      result(candidate('zone-rotation', { category: 'rotation' })),
      result(candidate('vehicle-decision', { category: 'vehicle', actionability: 0.2 })),
      result(strongReset),
      {
        kind: 'suppressed',
        detectorId: 'ignored',
        encounterId: 'encounter-1',
        reason: 'insufficient-evidence',
        evidenceEventIds: [],
      },
    ]);

    expect(ranked.map((entry) => entry.detectorId)).toEqual([
      'failed-reset',
      'team-spacing',
      'zone-rotation',
    ]);
  });
});

describe('CoachingNarrativeBuilderService', () => {
  it('maps only candidate claims and established causal links into trusted insights', () => {
    const insights = new CoachingNarrativeBuilderService().build([
      candidate('zone-rotation', {
        category: 'rotation',
        causalLinks: ['blue-zone damage', 'exposed fight', 'knock'],
      }),
    ]);

    expect(insights).toEqual([
      expect.objectContaining({
        playerName: 'Player',
        category: 'rotation',
        evidence: ['zone-rotation', 'blue-zone damage -> exposed fight -> knock'],
        recommendation: 'Fix zone-rotation',
        claims: [
          {
            text: 'zone-rotation',
            confidence: 'high',
            evidence: ['event-zone-rotation'],
          },
        ],
      }),
    ]);
  });
});
