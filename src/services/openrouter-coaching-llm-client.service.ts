import type { CoachingInsight, CoachingLlmClient } from '../types/coaching.types';

interface OpenRouterCoachingLlmClientOptions {
  apiKey: string;
  model: string;
  timeoutMs: number;
}

const OPENROUTER_CHAT_COMPLETIONS_URL = 'https://openrouter.ai/api/v1/chat/completions';
const MISSING_CONTENT_ERROR = 'OpenRouter coaching response did not include message content';
const INVALID_JSON_ERROR = 'OpenRouter coaching response was not valid JSON';

export class OpenRouterCoachingLlmClient implements CoachingLlmClient {
  public constructor(private readonly options: OpenRouterCoachingLlmClientOptions) {}

  public async narrate(insights: CoachingInsight[]): Promise<unknown> {
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

      let envelope: unknown;
      try {
        envelope = await response.json();
      } catch {
        throw new Error(INVALID_JSON_ERROR);
      }

      const content = this.extractMessageContent(envelope);
      try {
        const parsed: unknown = JSON.parse(content);
        return parsed;
      } catch {
        throw new Error(INVALID_JSON_ERROR);
      }
    } finally {
      clearTimeout(timeout);
    }
  }

  private extractMessageContent(envelope: unknown): string {
    if (!this.isRecord(envelope) || !Array.isArray(envelope.choices)) {
      throw new Error(MISSING_CONTENT_ERROR);
    }
    const firstChoice = envelope.choices[0];
    if (!this.isRecord(firstChoice) || !this.isRecord(firstChoice.message)) {
      throw new Error(MISSING_CONTENT_ERROR);
    }
    const content = firstChoice.message.content;
    if (typeof content !== 'string' || content.trim().length === 0) {
      throw new Error(MISSING_CONTENT_ERROR);
    }
    return content;
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }

  private formatMatchTime(seconds: number): string {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
  }
}
