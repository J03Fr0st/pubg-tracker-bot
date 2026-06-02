import { OpenRouterCoachingLlmClient } from '../../../src/services/openrouter-coaching-llm-client.service';
import type { CoachingInsight } from '../../../src/types/coaching.types';

const insight: CoachingInsight = {
  playerName: 'TestPlayer',
  category: 'decisive-mistake',
  kind: 'decisive-mistake',
  title: 'Decisive mistake',
  timestamp: new Date('2024-01-01T10:18:42.000Z'),
  matchTimeSeconds: 1122,
  severity: 'high',
  confidence: 'high',
  evidence: ['Took 83 damage from EnemyOne', 'Died to EnemyOne 6s later'],
  recommendation:
    'Break line of sight, heal, or force a new angle before challenging the same player again.',
  betterPlay: ['break line of sight', 'heal before re-engaging'],
  claims: [
    {
      text: 'EnemyOne hit you for 83 damage, then 6s later you died to the same player before creating a reset.',
      confidence: 'high',
      evidence: ['Took 83 damage from EnemyOne'],
    },
  ],
};

describe('OpenRouterCoachingLlmClient', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    jest.useRealTimers();
  });

  it('posts telemetry-backed insights to OpenRouter chat completions', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              content: JSON.stringify({
                sections: [
                  {
                    playerName: 'TestPlayer',
                    lines: [
                      '18:42 - Fight Reset: You took 83 damage and died 6s later to EnemyOne. Break line of sight before re-challenging.',
                    ],
                  },
                ],
              }),
            },
          },
        ],
      }),
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    const client = new OpenRouterCoachingLlmClient({
      apiKey: 'key-123',
      model: 'anthropic/claude-sonnet-4',
      timeoutMs: 8000,
    });

    const result = await client.narrate([insight]);

    expect(fetchMock).toHaveBeenCalledWith(
      'https://openrouter.ai/api/v1/chat/completions',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer key-123',
          'Content-Type': 'application/json',
        }),
      })
    );
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.model).toBe('anthropic/claude-sonnet-4');
    expect(body.messages[0].content).toContain('strict and blunt');
    expect(body.messages[1].content).toContain('strict_blunt');
    expect(body.messages[1].content).toContain('EnemyOne');
    expect(body.messages[1].content).toContain('Took 83 damage from EnemyOne');
    expect(body.messages[1].content).not.toContain('LogPlayerTakeDamage');
    expect(body.messages[1].content).not.toContain('LogPlayerKillV2');
    expect(result.sections[0].playerName).toBe('TestPlayer');
  });

  it('includes richer evidence and better plays without raw telemetry events', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              content: JSON.stringify({
                sections: [{ playerName: 'TestPlayer', lines: ['ok'] }],
              }),
            },
          },
        ],
      }),
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    const client = new OpenRouterCoachingLlmClient({
      apiKey: 'key-123',
      model: 'anthropic/claude-sonnet-4',
      timeoutMs: 8000,
    });

    await client.narrate([
      {
        ...insight,
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
      },
    ]);

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    const userContent = body.messages[1].content;
    expect(userContent).toContain('M416');
    expect(userContent).toContain('31 blue-zone damage');
    expect(userContent).toContain('rotate earlier before taking optional fights');
    expect(userContent).not.toContain('LogPlayerTakeDamage');
    expect(userContent).not.toContain('LogPlayerPosition');
  });

  it('throws on non-2xx OpenRouter responses', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 429,
      text: async () => 'rate limited',
    }) as unknown as typeof fetch;

    const client = new OpenRouterCoachingLlmClient({
      apiKey: 'key-123',
      model: 'anthropic/claude-sonnet-4',
      timeoutMs: 8000,
    });

    await expect(client.narrate([insight])).rejects.toThrow(
      'OpenRouter request failed: 429 rate limited'
    );
  });

  it('throws when OpenRouter returns invalid JSON content', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: 'plain text' } }],
      }),
    }) as unknown as typeof fetch;

    const client = new OpenRouterCoachingLlmClient({
      apiKey: 'key-123',
      model: 'anthropic/claude-sonnet-4',
      timeoutMs: 8000,
    });

    await expect(client.narrate([insight])).rejects.toThrow(
      'OpenRouter coaching response was not valid JSON'
    );
  });
});
