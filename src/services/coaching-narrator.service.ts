import type {
  CoachingInsight,
  CoachingLlmClient,
  CoachingNarration,
  CoachingNarratorOptions,
} from '../types/coaching.types';
import { debug } from '../utils/logger';
import { type CoachingLlmGuardrail, WhitelistCoachingLlmGuardrail } from './coaching-llm-guardrail';

const DEFAULT_OPTIONS: CoachingNarratorOptions = {
  enabled: false,
  maxLineLength: 240,
};

export class CoachingNarratorService {
  public constructor(
    private readonly llmClient?: CoachingLlmClient,
    private readonly options: CoachingNarratorOptions = DEFAULT_OPTIONS,
    private readonly guardrail: CoachingLlmGuardrail = new WhitelistCoachingLlmGuardrail({
      maxLineLength: options.maxLineLength,
    })
  ) {}

  public async narrate(insights: CoachingInsight[]): Promise<CoachingNarration> {
    if (insights.length === 0) {
      return { sections: [] };
    }

    if (this.options.enabled && this.llmClient) {
      try {
        const llmNarration = await this.llmClient.narrate(insights);
        const verdict = this.guardrail.verify(llmNarration, insights);
        if (verdict.ok) {
          return llmNarration;
        }
        debug(`LLM coaching narration rejected by guardrail: ${verdict.reason}`);
      } catch (err) {
        debug(`LLM coaching narration failed, using template narration: ${err}`);
      }
    }

    return this.createTemplateNarration(insights);
  }

  private createTemplateNarration(insights: CoachingInsight[]): CoachingNarration {
    return {
      sections: insights.map((insight) => ({
        playerName: insight.playerName,
        title: insight.title,
        lines: this.formatTemplateLines(insight),
      })),
    };
  }

  private formatTemplateLines(insight: CoachingInsight): string[] {
    const label = insight.title ?? this.toTitleCase(insight.category);
    const matchTime = this.formatMatchTime(insight.matchTimeSeconds);
    const lines = [
      `${matchTime} - ${label}`,
      ...insight.evidence.map((evidence) => `- ${evidence}`),
      `Do this: ${insight.recommendation}`,
    ];

    return lines.map((line) => this.truncateLine(line));
  }

  private truncateLine(line: string): string {
    return line.length <= this.options.maxLineLength
      ? line
      : `${line.slice(0, this.options.maxLineLength - 3)}...`;
  }

  private formatMatchTime(seconds: number): string {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
  }

  private toTitleCase(category: string): string {
    return category
      .split('-')
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  }
}
