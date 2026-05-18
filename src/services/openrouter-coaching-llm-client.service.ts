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
                'You are a strict and blunt PUBG coach narrator. Rewrite only the supplied telemetry-backed coaching facts for Discord. Do not infer tactics from raw telemetry. Do not invent names, numbers, terrain, cover, weapons, distances, or advice. Return only valid JSON with sections[].playerName, sections[].title, and sections[].lines.',
            },
            {
              role: 'user',
              content: JSON.stringify({
                tone: 'strict_blunt',
                insights: insights.map((insight) => ({
                  playerName: insight.playerName,
                  title: insight.title,
                  category: insight.category,
                  kind: insight.kind,
                  matchTime: this.formatMatchTime(insight.matchTimeSeconds),
                  severity: insight.severity,
                  confidence: insight.confidence,
                  claims: insight.claims ?? [],
                  evidence: insight.evidence,
                  betterPlay: insight.betterPlay ?? [insight.recommendation],
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
