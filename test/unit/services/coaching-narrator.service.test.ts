import { CoachingNarratorService } from '../../../src/services/coaching-narrator.service';
import type { CoachingInsight, CoachingLlmClient } from '../../../src/types/coaching.types';

const insight: CoachingInsight = {
  playerName: 'TestPlayer',
  category: 'fight-reset',
  timestamp: new Date('2024-01-01T10:18:42.000Z'),
  matchTimeSeconds: 1122,
  severity: 'high',
  confidence: 'high',
  evidence: ['Took 83 damage from EnemyOne', 'Died to EnemyOne 6s later'],
  recommendation:
    'Break line of sight, heal, or force a new angle before challenging the same player again.',
};

const enrichedInsight: CoachingInsight = {
  playerName: 'Aculite',
  category: 'decisive-mistake',
  kind: 'decisive-mistake',
  title: 'Decisive mistake',
  timestamp: new Date('2026-05-25T16:27:19.510Z'),
  matchTimeSeconds: 841,
  severity: 'high',
  confidence: 'high',
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

describe('CoachingNarratorService', () => {
  it('formats deterministic template narration when LLM is disabled', async () => {
    const service = new CoachingNarratorService(undefined, {
      enabled: false,
      maxLineLength: 240,
    });

    const narration = await service.narrate([insight]);

    expect(narration.sections).toHaveLength(1);
    expect(narration.sections[0].playerName).toBe('TestPlayer');
    expect(narration.sections[0].lines[0]).toContain('18:42 - Fight Reset');
    expect(narration.sections[0].lines[1]).toBe('- Took 83 damage from EnemyOne');
    expect(narration.sections[0].lines[2]).toBe('- Died to EnemyOne 6s later');
    expect(narration.sections[0].lines[3]).toContain('Do this: Break line of sight');
    expect(narration.sections[0].lines.join('\n')).not.toContain(';');
  });

  it('uses valid LLM narration when enabled', async () => {
    const llmClient: CoachingLlmClient = {
      narrate: jest.fn().mockResolvedValue({
        sections: [
          {
            playerName: 'TestPlayer',
            lines: [
              '18:42 - Fight Reset: You took 83 damage and died 6s later to the same player. Break line of sight and heal before challenging again.',
            ],
          },
        ],
      }),
    };
    const service = new CoachingNarratorService(llmClient, {
      enabled: true,
      maxLineLength: 240,
    });

    const narration = await service.narrate([insight]);

    expect(llmClient.narrate).toHaveBeenCalledWith([insight]);
    expect(narration.sections[0].lines[0]).toContain('You took 83 damage');
  });

  it('falls back to template narration when LLM throws', async () => {
    const llmClient: CoachingLlmClient = {
      narrate: jest.fn().mockRejectedValue(new Error('OpenRouter timeout')),
    };
    const service = new CoachingNarratorService(llmClient, {
      enabled: true,
      maxLineLength: 240,
    });

    const narration = await service.narrate([insight]);

    expect(narration.sections[0].lines.join('\n')).toContain('Took 83 damage from EnemyOne');
  });

  it('rejects LLM narration that invents a new player name', async () => {
    const llmClient: CoachingLlmClient = {
      narrate: jest.fn().mockResolvedValue({
        sections: [
          {
            playerName: 'TestPlayer',
            lines: ['18:42 - Fight Reset: EnemyTwo punished your swing. Heal before re-engaging.'],
          },
        ],
      }),
    };
    const service = new CoachingNarratorService(llmClient, {
      enabled: true,
      maxLineLength: 240,
    });

    const narration = await service.narrate([insight]);

    const fallbackText = narration.sections[0].lines.join('\n');
    expect(fallbackText).toContain('Took 83 damage from EnemyOne');
    expect(fallbackText).not.toContain('EnemyTwo');
  });

  it('formats decisive mistake and pattern section titles', async () => {
    const service = new CoachingNarratorService(undefined, {
      enabled: false,
      maxLineLength: 280,
    });

    const narration = await service.narrate([
      {
        ...insight,
        category: 'decisive-mistake',
        kind: 'decisive-mistake',
        title: 'Decisive mistake',
      },
      {
        ...insight,
        category: 'pattern',
        kind: 'pattern',
        title: 'Pattern to fix',
        recommendation: 'Stop giving the same enemy a second clean fight.',
      },
      {
        ...insight,
        category: 'player-fingerprint',
        kind: 'player-fingerprint',
        title: 'Player fingerprint',
        evidence: ['Aggressive re-peeker: 2 of 2 reviewed fights matched this telemetry pattern.'],
        recommendation: 'Treat first damage as a reset trigger.',
      },
    ]);

    expect(narration.sections[0].title).toBe('Decisive mistake');
    expect(narration.sections[1].title).toBe('Pattern to fix');
    expect(narration.sections[2].title).toBe('Player fingerprint');
    expect(narration.sections[2].lines[0]).toContain('Player fingerprint');
  });

  it('formats enriched death-review and zone-pressure evidence in template narration', async () => {
    const service = new CoachingNarratorService(undefined, {
      enabled: false,
      maxLineLength: 240,
    });

    const narration = await service.narrate([enrichedInsight]);
    const text = narration.sections[0].lines.join('\n');

    expect(text).toContain('14:01 - Decisive mistake');
    expect(text).toContain('died to the same player with M416');
    expect(text).toContain('31 blue-zone damage in the 60s before this fight');
    expect(text).toContain('Do this: Rotate earlier');
    expect(narration.sections[0].lines.every((line) => line.length <= 240)).toBe(true);
  });

  it('rejects LLM narration that invents a new distance', async () => {
    const llmClient: CoachingLlmClient = {
      narrate: jest.fn().mockResolvedValue({
        sections: [
          {
            playerName: 'TestPlayer',
            title: 'Decisive mistake',
            lines: ['You were 999m away from trade pressure.'],
          },
        ],
      }),
    };
    const service = new CoachingNarratorService(llmClient, { enabled: true, maxLineLength: 240 });

    const narration = await service.narrate([insight]);

    const fallbackText = narration.sections[0].lines.join('\n');
    expect(fallbackText).not.toContain('999m');
    expect(fallbackText).toContain('Took 83 damage from EnemyOne');
  });

  it('rejects unsupported terrain labels from LLM output', async () => {
    const llmClient: CoachingLlmClient = {
      narrate: jest.fn().mockResolvedValue({
        sections: [
          {
            playerName: 'TestPlayer',
            title: 'Decisive mistake',
            lines: ['You died because you crossed a field with no cover.'],
          },
        ],
      }),
    };
    const service = new CoachingNarratorService(llmClient, { enabled: true, maxLineLength: 240 });

    const narration = await service.narrate([insight]);

    const fallbackText = narration.sections[0].lines.join('\n');
    expect(fallbackText).not.toContain('field');
    expect(fallbackText).toContain('Took 83 damage from EnemyOne');
  });

  it('rejects advice outside supplied better plays', async () => {
    const llmClient: CoachingLlmClient = {
      narrate: jest.fn().mockResolvedValue({
        sections: [
          {
            playerName: 'TestPlayer',
            title: 'Decisive mistake',
            lines: ['You should have thrown a smoke and crashed the compound.'],
          },
        ],
      }),
    };
    const service = new CoachingNarratorService(llmClient, { enabled: true, maxLineLength: 240 });

    const narration = await service.narrate([insight]);

    const fallbackText = narration.sections[0].lines.join('\n');
    expect(fallbackText).not.toContain('smoke');
    expect(fallbackText).toContain('Took 83 damage from EnemyOne');
  });
});
