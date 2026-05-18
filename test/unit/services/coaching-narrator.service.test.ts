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
    expect(narration.sections[0].lines[0]).toContain('Took 83 damage from EnemyOne');
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

    expect(narration.sections[0].lines[0]).toContain('Took 83 damage from EnemyOne');
  });

  it('rejects LLM narration that invents a new player name', async () => {
    const llmClient: CoachingLlmClient = {
      narrate: jest.fn().mockResolvedValue({
        sections: [
          {
            playerName: 'TestPlayer',
            lines: ['18:42 - Fight Reset: EnemyTwo punished your re-peek. Heal before re-engaging.'],
          },
        ],
      }),
    };
    const service = new CoachingNarratorService(llmClient, {
      enabled: true,
      maxLineLength: 240,
    });

    const narration = await service.narrate([insight]);

    expect(narration.sections[0].lines[0]).toContain('Took 83 damage from EnemyOne');
    expect(narration.sections[0].lines[0]).not.toContain('EnemyTwo');
  });
});
