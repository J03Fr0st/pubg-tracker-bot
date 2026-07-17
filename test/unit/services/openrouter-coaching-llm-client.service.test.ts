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

const parsedNarration = {
  sections: [
    {
      playerName: 'TestPlayer',
      title: 'Decisive mistake',
      lines: [
        '18:42 - Decisive mistake: Took 83 damage from EnemyOne and died 6s later.',
        'Do this: break line of sight.',
      ],
    },
  ],
};

function makeClient(): OpenRouterCoachingLlmClient {
  return new OpenRouterCoachingLlmClient({
    apiKey: 'key-123',
    model: 'anthropic/claude-sonnet-4',
    timeoutMs: 8000,
  });
}

function mockSuccessfulFetch(payload: unknown): jest.Mock {
  const fetchMock = jest.fn().mockResolvedValue({
    ok: true,
    json: async () => payload,
  });
  global.fetch = fetchMock as unknown as typeof fetch;
  return fetchMock;
}

describe('OpenRouterCoachingLlmClient', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    jest.useRealTimers();
  });

  it('posts telemetry-backed insights and returns parsed content as unknown', async () => {
    const fetchMock = mockSuccessfulFetch({
      choices: [{ message: { content: JSON.stringify(parsedNarration) } }],
    });

    const result = await makeClient().narrate([insight]);

    expect(fetchMock).toHaveBeenCalledWith(
      'https://openrouter.ai/api/v1/chat/completions',
      expect.objectContaining({
        method: 'POST',
        headers: {
          Authorization: 'Bearer key-123',
          'Content-Type': 'application/json',
        },
        signal: expect.any(AbortSignal),
      })
    );
    const request = fetchMock.mock.calls[0][1] as RequestInit;
    const body = JSON.parse(String(request.body));
    expect(body.model).toBe('anthropic/claude-sonnet-4');
    expect(body.messages[0].content).toContain('strict and blunt');
    expect(body.messages[1].content).toContain('strict_blunt');
    expect(body.messages[1].content).toContain('EnemyOne');
    expect(body.messages[1].content).toContain('Took 83 damage from EnemyOne');
    expect(body.messages[1].content).not.toContain('LogPlayerTakeDamage');
    expect(body.messages[1].content).not.toContain('LogPlayerKillV2');
    expect(result).toEqual(parsedNarration);
  });

  it('includes richer evidence and Better Play without raw telemetry events', async () => {
    const fetchMock = mockSuccessfulFetch({
      choices: [{ message: { content: JSON.stringify(parsedNarration) } }],
    });

    await makeClient().narrate([
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

    const request = fetchMock.mock.calls[0][1] as RequestInit;
    const body = JSON.parse(String(request.body));
    const userContent = body.messages[1].content as string;
    expect(userContent).toContain('M416');
    expect(userContent).toContain('31 blue-zone damage');
    expect(userContent).toContain('rotate earlier before taking optional fights');
    expect(userContent).not.toContain('LogPlayerTakeDamage');
    expect(userContent).not.toContain('LogPlayerPosition');
  });

  it('returns syntactically valid but domain-invalid JSON for the narrator to reject', async () => {
    const domainInvalid: unknown = { sections: 'not-an-array' };
    mockSuccessfulFetch({
      choices: [{ message: { content: JSON.stringify(domainInvalid) } }],
    });

    await expect(makeClient().narrate([insight])).resolves.toEqual(domainInvalid);
  });

  it.each([
    ['null payload', null],
    ['array payload', []],
    ['missing choices', {}],
    ['non-array choices', { choices: 'invalid' }],
    ['empty choices', { choices: [] }],
    ['non-object first choice', { choices: [null] }],
    ['missing message', { choices: [{}] }],
    ['non-object message', { choices: [{ message: 'invalid' }] }],
    ['missing content', { choices: [{ message: {} }] }],
    ['non-string content', { choices: [{ message: { content: 42 } }] }],
    ['blank content', { choices: [{ message: { content: '   ' } }] }],
  ])('throws the stable provider-envelope error for %s', async (_caseName, payload) => {
    mockSuccessfulFetch(payload);

    await expect(makeClient().narrate([insight])).rejects.toThrow(
      'OpenRouter coaching response did not include message content'
    );
  });

  it('throws the stable syntax error for invalid message content JSON', async () => {
    mockSuccessfulFetch({ choices: [{ message: { content: 'plain text' } }] });

    await expect(makeClient().narrate([insight])).rejects.toThrow(
      'OpenRouter coaching response was not valid JSON'
    );
  });

  it('throws the stable syntax error when the HTTP response body is not JSON', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => {
        throw new SyntaxError('Unexpected token');
      },
    }) as unknown as typeof fetch;

    await expect(makeClient().narrate([insight])).rejects.toThrow(
      'OpenRouter coaching response was not valid JSON'
    );
  });

  it('throws the existing stable error on non-2xx responses', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 429,
      text: async () => 'rate limited',
    }) as unknown as typeof fetch;

    await expect(makeClient().narrate([insight])).rejects.toThrow(
      'OpenRouter request failed: 429 rate limited'
    );
  });
});
