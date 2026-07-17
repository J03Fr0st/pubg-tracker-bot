import type {
  CoachingInsight,
  CoachingLlmClient,
  CoachingNarration,
  CoachingNarrationSection,
  CoachingNarratorOptions,
} from '../types/coaching.types';
import { debug } from '../utils/logger';

const DEFAULT_OPTIONS: CoachingNarratorOptions = {
  enabled: false,
  maxLineLength: 240,
};

type NarrationValidationResult =
  | { ok: true; narration: CoachingNarration }
  | { ok: false; reason: string };

export class CoachingNarratorService {
  public constructor(
    private readonly llmClient?: CoachingLlmClient,
    private readonly options: CoachingNarratorOptions = DEFAULT_OPTIONS
  ) {}

  public async narrate(insights: CoachingInsight[]): Promise<CoachingNarration> {
    if (insights.length === 0) {
      return { sections: [] };
    }

    if (this.options.enabled && this.llmClient) {
      try {
        const validation = this.validateNarration(await this.llmClient.narrate(insights), insights);
        if (validation.ok) {
          return validation.narration;
        }
        debug(`LLM coaching narration rejected: ${validation.reason}`);
      } catch (err) {
        debug(`LLM coaching narration failed, using template narration: ${err}`);
      }
    }

    return this.createTemplateNarration(insights);
  }

  private validateNarration(
    value: unknown,
    insights: CoachingInsight[]
  ): NarrationValidationResult {
    if (!this.isRecord(value) || !this.hasExactKeys(value, ['sections'])) {
      return { ok: false, reason: 'narration must contain only sections' };
    }
    if (!Array.isArray(value.sections) || value.sections.length === 0) {
      return { ok: false, reason: 'narration.sections must be a non-empty array' };
    }
    if (value.sections.length !== insights.length) {
      return { ok: false, reason: 'section count must match insight count' };
    }

    const sections: CoachingNarrationSection[] = [];
    for (let index = 0; index < insights.length; index += 1) {
      const rawSection = value.sections[index];
      const insight = insights[index];
      if (!this.isRecord(rawSection)) {
        return { ok: false, reason: `section ${index} must be an object` };
      }

      const expectedKeys = insight.title
        ? ['lines', 'playerName', 'title']
        : ['lines', 'playerName'];
      if (!this.hasExactKeys(rawSection, expectedKeys)) {
        return { ok: false, reason: `section ${index} has invalid fields` };
      }
      if (rawSection.playerName !== insight.playerName) {
        return { ok: false, reason: `section ${index} playerName does not match insight order` };
      }
      if (insight.title && rawSection.title !== insight.title) {
        return { ok: false, reason: `section ${index} title does not match insight` };
      }
      if (!Array.isArray(rawSection.lines) || rawSection.lines.length === 0) {
        return { ok: false, reason: `section ${index} lines must be a non-empty array` };
      }

      const lines: string[] = [];
      for (const rawLine of rawSection.lines) {
        if (typeof rawLine !== 'string') {
          return { ok: false, reason: `section ${index} lines must contain only strings` };
        }
        if (rawLine.trim().length === 0) {
          return { ok: false, reason: `section ${index} contains a blank line` };
        }
        if (rawLine.length > this.options.maxLineLength) {
          return { ok: false, reason: `section ${index} contains an oversized line` };
        }
        lines.push(rawLine.trim());
      }

      sections.push({
        playerName: insight.playerName,
        title: insight.title,
        lines,
      });
    }

    return { ok: true, narration: { sections } };
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }

  private hasExactKeys(value: Record<string, unknown>, expectedKeys: string[]): boolean {
    const actualKeys = Object.keys(value).sort();
    return (
      actualKeys.length === expectedKeys.length &&
      actualKeys.every((key, index) => key === [...expectedKeys].sort()[index])
    );
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
