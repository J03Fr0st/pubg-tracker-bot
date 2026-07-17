import { CoachingNarratorService } from '../../../src/services/coaching-narrator.service';
import type { CoachingInsight, CoachingLlmClient } from '../../../src/types/coaching.types';

const options = { enabled: true, maxLineLength: 240 };

const insight: CoachingInsight = {
  playerName: 'Alice',
  category: 'decisive-mistake',
  kind: 'decisive-mistake',
  title: 'Decisive mistake',
  timestamp: new Date('2026-07-17T12:02:00.000Z'),
  matchTimeSeconds: 120,
  severity: 'high',
  confidence: 'medium',
  evidence: [
    'Alice took 80 damage from Bob at 2:00.',
    'Bob eliminated Alice 6s later with M416.',
  ],
  recommendation: 'Break line of sight and heal before re-engaging.',
  betterPlay: ['break line of sight', 'heal before re-engaging'],
};

const secondInsight: CoachingInsight = {
  ...insight,
  playerName: 'Carol',
  category: 'pattern',
  kind: 'pattern',
  title: 'Pattern to fix',
  matchTimeSeconds: 180,
  evidence: ['Carol took 40 damage from Dave at 3:00.'],
  recommendation: 'Reposition before re-engaging.',
  betterPlay: ['reposition before re-engaging'],
};

const validNarration = {
  sections: [
    {
      playerName: 'Alice',
      title: 'Decisive mistake',
      lines: [
        '2:00 - Decisive mistake: Alice took 80 damage from Bob.',
        'Bob eliminated Alice 6s later with M416.',
        'Do this: break line of sight and heal before re-engaging.',
      ],
    },
  ],
};

function makeLlmClient(value: unknown): CoachingLlmClient {
  return { narrate: jest.fn().mockResolvedValue(value) };
}

async function expectTemplateFallback(
  value: unknown,
  insights: CoachingInsight[] = [insight]
): Promise<void> {
  const actual = await new CoachingNarratorService(makeLlmClient(value), options).narrate(insights);
  const expected = await new CoachingNarratorService(undefined, {
    enabled: false,
    maxLineLength: options.maxLineLength,
  }).narrate(insights);
  expect(actual).toEqual(expected);
}

describe('CoachingNarratorService', () => {
  it('formats deterministic template narration when LLM is disabled', async () => {
    const service = new CoachingNarratorService(undefined, {
      enabled: false,
      maxLineLength: 240,
    });

    const narration = await service.narrate([insight]);

    expect(narration).toEqual({
      sections: [
        {
          playerName: 'Alice',
          title: 'Decisive mistake',
          lines: [
            '2:00 - Decisive mistake',
            '- Alice took 80 damage from Bob at 2:00.',
            '- Bob eliminated Alice 6s later with M416.',
            'Do this: Break line of sight and heal before re-engaging.',
          ],
        },
      ],
    });
  });

  it('returns empty template narration without calling the LLM for no insights', async () => {
    const llmClient = makeLlmClient(validNarration);
    const service = new CoachingNarratorService(llmClient, options);

    await expect(service.narrate([])).resolves.toEqual({ sections: [] });
    expect(llmClient.narrate).not.toHaveBeenCalled();
  });

  it('reconstructs structurally valid model narration', async () => {
    const llmClient = makeLlmClient(validNarration);
    const service = new CoachingNarratorService(llmClient, options);

    const narration = await service.narrate([insight]);

    expect(llmClient.narrate).toHaveBeenCalledWith([insight]);
    expect(narration).toEqual(validNarration);
    expect(narration).not.toBe(validNarration);
    expect(narration.sections[0]).not.toBe(validNarration.sections[0]);
    expect(narration.sections[0].lines).not.toBe(validNarration.sections[0].lines);
  });

  it('falls back to template narration when the LLM throws', async () => {
    const llmClient: CoachingLlmClient = {
      narrate: jest.fn().mockRejectedValue(new Error('OpenRouter timeout')),
    };
    const service = new CoachingNarratorService(llmClient, options);

    const narration = await service.narrate([insight]);

    expect(narration.sections[0].lines).toContain('- Alice took 80 damage from Bob at 2:00.');
  });

  it.each([
    ['null root', null],
    ['array root', []],
    ['missing sections', {}],
    ['unknown root field', { sections: validNarration.sections, extra: true }],
    ['non-array sections', { sections: 'invalid' }],
    ['empty sections', { sections: [] }],
    ['null section', { sections: [null] }],
    [
      'unknown section field',
      {
        sections: [
          {
            ...validNarration.sections[0],
            severity: 'high',
          },
        ],
      },
    ],
    [
      'wrong player',
      {
        sections: [{ ...validNarration.sections[0], playerName: 'Mallory' }],
      },
    ],
    [
      'missing title',
      {
        sections: [
          {
            playerName: 'Alice',
            lines: validNarration.sections[0].lines,
          },
        ],
      },
    ],
    [
      'wrong title',
      {
        sections: [{ ...validNarration.sections[0], title: 'Pattern to fix' }],
      },
    ],
    [
      'non-array lines',
      {
        sections: [{ ...validNarration.sections[0], lines: 'invalid' }],
      },
    ],
    [
      'empty lines',
      {
        sections: [{ ...validNarration.sections[0], lines: [] }],
      },
    ],
    [
      'non-string line',
      {
        sections: [{ ...validNarration.sections[0], lines: [42] }],
      },
    ],
    [
      'blank line',
      {
        sections: [{ ...validNarration.sections[0], lines: ['   '] }],
      },
    ],
    [
      'oversized line',
      {
        sections: [{ ...validNarration.sections[0], lines: ['x'.repeat(241)] }],
      },
    ],
  ])('falls back for a malformed %s', async (_caseName, value) => {
    await expectTemplateFallback(value);
  });

  it('rejects the wrong section count', async () => {
    await expectTemplateFallback(validNarration, [insight, secondInsight]);
  });

  it('rejects sections in the wrong insight order', async () => {
    await expectTemplateFallback(
      {
        sections: [
          {
            playerName: 'Carol',
            title: 'Pattern to fix',
            lines: ['Carol took 40 damage from Dave at 3:00.'],
          },
          validNarration.sections[0],
        ],
      },
      [insight, secondInsight]
    );
  });

  it('rejects a title when the corresponding insight has no title', async () => {
    const untitledInsight: CoachingInsight = {
      ...insight,
      title: undefined,
      kind: undefined,
      category: 'fight-reset',
    };
    await expectTemplateFallback(
      {
        sections: [
          {
            playerName: 'Alice',
            title: 'Decisive mistake',
            lines: validNarration.sections[0].lines,
          },
        ],
      },
      [untitledInsight]
    );
  });
});
