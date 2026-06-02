import { WhitelistCoachingLlmGuardrail } from '../../../src/services/coaching-llm-guardrail';
import type { CoachingInsight, CoachingNarration } from '../../../src/types/coaching.types';

const insight: CoachingInsight = {
  playerName: 'Alice',
  category: 'decisive-mistake',
  kind: 'decisive-mistake',
  title: 'Decisive mistake',
  timestamp: new Date('2024-01-01T00:00:00Z'),
  matchTimeSeconds: 120,
  severity: 'high',
  confidence: 'high',
  evidence: ['Took 80 damage from Bob'],
  recommendation: 'break line of sight',
};

describe('WhitelistCoachingLlmGuardrail', () => {
  const guardrail = new WhitelistCoachingLlmGuardrail({ maxLineLength: 240 });

  it('accepts narration that only references allowed names and numbers', () => {
    const narration: CoachingNarration = {
      sections: [
        {
          playerName: 'Alice',
          title: 'Decisive mistake',
          lines: ['2:00 - Decisive mistake', 'Do this: break line of sight'],
        },
      ],
    };
    const result = guardrail.verify(narration, [insight]);
    expect(result).toEqual({ ok: true });
  });

  it('rejects narration that mentions an unknown player name', () => {
    const narration: CoachingNarration = {
      sections: [
        {
          playerName: 'Alice',
          title: 'Decisive mistake',
          lines: ['Charlie shot you'],
        },
      ],
    };
    const result = guardrail.verify(narration, [insight]);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toMatch(/unknown name/i);
    }
  });

  it('rejects narration that exceeds maxLineLength', () => {
    const shortGuardrail = new WhitelistCoachingLlmGuardrail({ maxLineLength: 10 });
    const narration: CoachingNarration = {
      sections: [
        { playerName: 'Alice', title: 'Decisive mistake', lines: ['this line is way too long'] },
      ],
    };
    const result = shortGuardrail.verify(narration, [insight]);
    expect(result.ok).toBe(false);
  });

  it('accepts supported weapon, zone, rotate, and damage evidence', () => {
    const enrichedInsight: CoachingInsight = {
      ...insight,
      playerName: 'Aculite',
      evidence: [
        'You took 67 damage from EnemyOne, healed zero, moved 8m, then died to the same player with M416.',
        'You took 31 blue-zone damage in the 60s before this fight.',
      ],
      recommendation:
        'Rotate earlier, break line of sight, heal, then re-engage only from a new angle.',
      betterPlay: [
        'rotate earlier before taking optional fights',
        'break line of sight',
        'heal before re-engaging',
        'force a new angle',
      ],
    };
    const narration: CoachingNarration = {
      sections: [
        {
          playerName: 'Aculite',
          title: 'Decisive mistake',
          lines: [
            'You took 31 blue-zone damage, then died with M416 in the fight. Rotate earlier before taking optional fights.',
          ],
        },
      ],
    };

    const result = guardrail.verify(narration, [enrichedInsight]);
    expect(result).toEqual({ ok: true });
  });
});
