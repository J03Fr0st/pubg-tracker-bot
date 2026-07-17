import type {
  CoachingInsight,
  CoachingLlmClient,
  CoachingNarration,
  CoachingNarrationSection,
  CoachingNarratorOptions,
  CoachingRating,
} from '../types/coaching.types';
import { debug } from '../utils/logger';

const DEFAULT_OPTIONS: CoachingNarratorOptions = {
  enabled: false,
  maxLineLength: 240,
};

const CONNECTIVE_TOKENS = new Set([
  'a',
  'an',
  'and',
  'are',
  'as',
  'at',
  'be',
  'but',
  'do',
  'for',
  'from',
  'in',
  'is',
  'it',
  'of',
  'on',
  'or',
  'that',
  'the',
  'then',
  'this',
  'to',
  'with',
  'you',
  'your',
]);

const COACHING_RATINGS: CoachingRating[] = ['low', 'medium', 'high'];

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

      const semanticReason = this.validateSectionContent(lines, insight);
      if (semanticReason) {
        return { ok: false, reason: `section ${index} ${semanticReason}` };
      }

      sections.push({
        playerName: insight.playerName,
        title: insight.title,
        lines,
      });
    }

    return { ok: true, narration: { sections } };
  }

  private validateSectionContent(lines: string[], insight: CoachingInsight): string | null {
    const text = lines.join(' ');
    const severityReason = this.findContradictoryRating(text, 'severity', insight.severity);
    if (severityReason) {
      return severityReason;
    }
    const confidenceReason = this.findContradictoryRating(
      text,
      'confidence',
      insight.confidence
    );
    if (confidenceReason) {
      return confidenceReason;
    }

    const narrationTokens = new Set(this.tokenize(text));
    const allowedTokens = this.collectAllowedTokens(insight);
    for (const token of narrationTokens) {
      if (!allowedTokens.has(token)) {
        return `contains unsupported token "${token}"`;
      }
    }

    if (
      insight.evidence.length === 0 ||
      !insight.evidence.every((evidence) =>
        this.containsAllMeaningfulTokens(evidence, narrationTokens)
      )
    ) {
      return 'does not preserve all supplied evidence';
    }

    const actions =
      insight.betterPlay && insight.betterPlay.length > 0
        ? insight.betterPlay
        : [insight.recommendation];
    if (!actions.some((action) => this.containsAllMeaningfulTokens(action, narrationTokens))) {
      return 'does not include a supplied action';
    }

    return null;
  }

  private collectAllowedTokens(insight: CoachingInsight): Set<string> {
    const allowedTokens = new Set(CONNECTIVE_TOKENS);
    const sourceText = [
      insight.playerName,
      insight.category,
      insight.title ?? this.toTitleCase(insight.category),
      this.formatMatchTime(insight.matchTimeSeconds),
      ...insight.evidence,
      insight.recommendation,
      ...(insight.betterPlay ?? []),
      ...(insight.claims?.flatMap((claim) => [claim.text, ...claim.evidence]) ?? []),
      'severity',
      insight.severity,
      'confidence',
      insight.confidence,
    ];

    for (const token of sourceText.flatMap((value) => this.tokenize(value))) {
      allowedTokens.add(token);
    }
    return allowedTokens;
  }

  private containsAllMeaningfulTokens(source: string, narrationTokens: Set<string>): boolean {
    const requiredTokens = this.tokenize(source).filter((token) => !CONNECTIVE_TOKENS.has(token));
    return (
      requiredTokens.length > 0 && requiredTokens.every((token) => narrationTokens.has(token))
    );
  }

  private findContradictoryRating(
    text: string,
    label: 'severity' | 'confidence',
    expected: CoachingRating
  ): string | null {
    const normalized = this.tokenize(text).join(' ');
    for (const rating of COACHING_RATINGS) {
      if (rating === expected) {
        continue;
      }
      const pattern = new RegExp(
        `\\b${rating} ${label}\\b|\\b${label} ${rating}\\b|\\b${label} is ${rating}\\b`
      );
      if (pattern.test(normalized)) {
        return `contradicts ${label} ${expected}`;
      }
    }
    return null;
  }

  private tokenize(text: string): string[] {
    return text.toLowerCase().replace(/'s\b/g, '').match(/[a-z0-9_]+/g) ?? [];
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }

  private hasExactKeys(value: Record<string, unknown>, expectedKeys: string[]): boolean {
    const actualKeys = Object.keys(value).sort();
    const sortedExpectedKeys = [...expectedKeys].sort();
    return (
      actualKeys.length === sortedExpectedKeys.length &&
      actualKeys.every((key, index) => key === sortedExpectedKeys[index])
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
