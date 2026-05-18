import type {
  CoachingInsight,
  CoachingLlmClient,
  CoachingNarration,
  OpenRouterChatResponse,
} from '../types/coaching.types';

interface OpenRouterCoachingLlmClientOptions {
  apiKey: string;
  model: string;
  timeoutMs: number;
}

const OPENROUTER_CHAT_COMPLETIONS_URL = 'https://openrouter.ai/api/v1/chat/completions';

export class OpenRouterCoachingLlmClient implements CoachingLlmClient {
  public constructor(private readonly options: OpenRouterCoachingLlmClientOptions) {}

  public async narrate(insights: CoachingInsight[]): Promise<CoachingNarration> {
    const abortController = new AbortController();
    const timeout = setTimeout(() => abortController.abort(), this.options.timeoutMs);

    try {
      const response = await fetch(OPENROUTER_CHAT_COMPLETIONS_URL, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.options.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: this.options.model,
          messages: [
            {
              role: 'system',
              content:
                'You are a PUBG coaching assistant. Rewrite the supplied telemetry-backed coaching insights for Discord. Do not invent facts. Do not add advice that is not supported by the evidence. Keep each insight under two short sentences. Return only valid JSON.',
            },
            {
              role: 'user',
              content: JSON.stringify({
                insights: insights.map((insight) => ({
                  playerName: insight.playerName,
                  category: insight.category,
                  matchTime: this.formatMatchTime(insight.matchTimeSeconds),
                  severity: insight.severity,
                  confidence: insight.confidence,
                  evidence: insight.evidence,
                  recommendation: insight.recommendation,
                })),
              }),
            },
          ],
          response_format: {
            type: 'json_object',
          },
        }),
        signal: abortController.signal,
      });

      if (!response.ok) {
        const text = await response.text();
        throw new Error(`OpenRouter request failed: ${response.status} ${text}`);
      }

      const json = (await response.json()) as OpenRouterChatResponse;
      const content = json.choices?.[0]?.message?.content;
      if (!content) {
        throw new Error('OpenRouter coaching response did not include message content');
      }

      try {
        return JSON.parse(content) as CoachingNarration;
      } catch {
        throw new Error('OpenRouter coaching response was not valid JSON');
      }
    } finally {
      clearTimeout(timeout);
    }
  }

  private formatMatchTime(seconds: number): string {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
  }
}
