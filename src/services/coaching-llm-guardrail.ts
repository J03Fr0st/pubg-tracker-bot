import type { CoachingInsight, CoachingNarration } from '../types/coaching.types';

export type GuardrailVerdict = { ok: true } | { ok: false; reason: string };

export interface CoachingLlmGuardrail {
  verify(narration: CoachingNarration, insights: CoachingInsight[]): GuardrailVerdict;
}

const COMMON_ALLOWED_WORDS = new Set([
  'Break',
  'Decisive',
  'Do',
  'Died',
  'Enemy',
  'Fight',
  'Got',
  'Pattern',
  'Reset',
  'Stop',
  'The',
  'Took',
  'You',
  'Your',
]);

const UNSUPPORTED_TERRAIN_WORDS = new Set([
  'field',
  'ridge',
  'compound',
  'tree',
  'rock',
  'wall',
  'city',
  'bridge',
  'shoreline',
  'cover',
]);

const ADVICE_WORDS = new Set(['smoke', 'grenade', 'crash', 'compound', 'vehicle']);

export class WhitelistCoachingLlmGuardrail implements CoachingLlmGuardrail {
  public constructor(private readonly options: { maxLineLength: number }) {}

  public verify(narration: CoachingNarration, insights: CoachingInsight[]): GuardrailVerdict {
    if (!Array.isArray(narration.sections)) {
      return { ok: false, reason: 'narration.sections is not an array' };
    }

    const allowedPlayers = new Set(insights.map((i) => i.playerName));
    const allowedNumbers = this.collectAllowedNumbers(insights);
    const allowedNames = this.collectAllowedNames(insights);

    for (const section of narration.sections) {
      if (!allowedPlayers.has(section.playerName)) {
        return { ok: false, reason: `unknown player "${section.playerName}"` };
      }
      if (!Array.isArray(section.lines)) {
        return { ok: false, reason: 'section.lines is not an array' };
      }
      for (const line of section.lines) {
        const reason = this.rejectLine(line, insights, allowedNames, allowedNumbers);
        if (reason) {
          return { ok: false, reason };
        }
      }
    }
    return { ok: true };
  }

  private rejectLine(
    line: string,
    insights: CoachingInsight[],
    allowedNames: Set<string>,
    allowedNumbers: Set<string>
  ): string | null {
    if (line.length > this.options.maxLineLength) {
      return `line exceeds maxLineLength (${line.length} > ${this.options.maxLineLength})`;
    }
    const lower = line.toLowerCase();
    for (const word of UNSUPPORTED_TERRAIN_WORDS) {
      if (lower.includes(word) && !this.isWordSupported(word, insights)) {
        return `unsupported terrain word "${word}"`;
      }
    }
    if (!this.onlyUsesSupportedAdvice(lower, insights)) {
      return 'advice word not present in insight recommendations';
    }
    for (const number of line.match(/\d+/g) ?? []) {
      if (!allowedNumbers.has(number)) {
        return `unknown number "${number}"`;
      }
    }
    for (const name of line.match(/\b[A-Z][A-Za-z0-9_]+\b/g) ?? []) {
      if (!allowedNames.has(name) && !COMMON_ALLOWED_WORDS.has(name)) {
        return `unknown name "${name}"`;
      }
    }
    return null;
  }

  private collectAllowedNumbers(insights: CoachingInsight[]): Set<string> {
    const allowedNumbers = new Set<string>();

    for (const insight of insights) {
      allowedNumbers.add(String(insight.matchTimeSeconds));
      for (const part of this.formatMatchTime(insight.matchTimeSeconds).split(':')) {
        allowedNumbers.add(part);
        allowedNumbers.add(String(Number(part)));
      }
      for (const text of this.getAllowedText(insight)) {
        for (const number of text.match(/\d+/g) ?? []) {
          allowedNumbers.add(number);
        }
      }
    }

    return allowedNumbers;
  }

  private collectAllowedNames(insights: CoachingInsight[]): Set<string> {
    const allowedNames = new Set<string>();

    for (const insight of insights) {
      allowedNames.add(insight.playerName);
      allowedNames.add(this.toTitleCase(insight.category).replace(/\s+/g, ''));
      if (insight.title) {
        allowedNames.add(insight.title.replace(/\s+/g, ''));
        for (const word of insight.title.split(' ')) {
          allowedNames.add(word);
        }
      }
      for (const word of this.toTitleCase(insight.category).split(' ')) {
        allowedNames.add(word);
      }

      for (const text of this.getAllowedText(insight)) {
        for (const token of text.match(/\b[A-Z][A-Za-z0-9_]+\b/g) ?? []) {
          allowedNames.add(token);
        }
      }
    }

    return allowedNames;
  }

  private getAllowedText(insight: CoachingInsight): string[] {
    return [
      ...insight.evidence,
      insight.recommendation,
      ...(insight.betterPlay ?? []),
      ...(insight.claims?.map((claim) => claim.text) ?? []),
    ];
  }

  private isWordSupported(word: string, insights: CoachingInsight[]): boolean {
    return insights.some((insight) =>
      this.getAllowedText(insight).join(' ').toLowerCase().includes(word)
    );
  }

  private onlyUsesSupportedAdvice(line: string, insights: CoachingInsight[]): boolean {
    const supportedAdvice = insights
      .flatMap((insight) => [insight.recommendation, ...(insight.betterPlay ?? [])])
      .join(' ')
      .toLowerCase();

    for (const word of ADVICE_WORDS) {
      if (line.includes(word) && !supportedAdvice.includes(word)) {
        return false;
      }
    }

    return true;
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
