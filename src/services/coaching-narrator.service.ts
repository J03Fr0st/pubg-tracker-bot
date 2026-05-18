import type {
  CoachingInsight,
  CoachingLlmClient,
  CoachingNarration,
  CoachingNarratorOptions,
} from '../types/coaching.types';
import { debug } from '../utils/logger';

const DEFAULT_OPTIONS: CoachingNarratorOptions = {
  enabled: false,
  maxLineLength: 240,
};

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

const ADVICE_WORDS = new Set([
  'smoke',
  'grenade',
  'crash',
  'compound',
  'vehicle',
]);

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
        const llmNarration = await this.llmClient.narrate(insights);
        if (this.isValidNarration(llmNarration, insights)) {
          return llmNarration;
        }
        debug('LLM coaching narration failed validation, using template narration');
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
        lines: [this.formatTemplateLine(insight)],
      })),
    };
  }

  private formatTemplateLine(insight: CoachingInsight): string {
    const label = insight.title ?? this.toTitleCase(insight.category);
    const matchTime = this.formatMatchTime(insight.matchTimeSeconds);
    const evidence = insight.evidence.join('; ');
    const line = `${matchTime} - ${label}: ${evidence}. ${insight.recommendation}`;

    if (line.length <= this.options.maxLineLength) {
      return line;
    }

    return `${line.slice(0, this.options.maxLineLength - 3)}...`;
  }

  private isValidNarration(narration: CoachingNarration, insights: CoachingInsight[]): boolean {
    if (!Array.isArray(narration.sections)) {
      return false;
    }

    const allowedPlayers = new Set(insights.map((insight) => insight.playerName));
    const allowedNumbers = this.collectAllowedNumbers(insights);
    const allowedNames = this.collectAllowedNames(insights);

    return narration.sections.every((section) => {
      if (!allowedPlayers.has(section.playerName) || !Array.isArray(section.lines)) {
        return false;
      }

      return section.lines.every((line) => {
        if (line.length > this.options.maxLineLength) {
          return false;
        }

        const lowerLine = line.toLowerCase();
        for (const word of UNSUPPORTED_TERRAIN_WORDS) {
          if (lowerLine.includes(word) && !this.isWordSupported(word, insights)) {
            return false;
          }
        }

        if (!this.onlyUsesSupportedAdvice(lowerLine, insights)) {
          return false;
        }

        for (const number of line.match(/\d+/g) ?? []) {
          if (!allowedNumbers.has(number)) {
            return false;
          }
        }

        for (const name of line.match(/\b[A-Z][A-Za-z0-9_]+\b/g) ?? []) {
          if (!allowedNames.has(name) && !COMMON_ALLOWED_WORDS.has(name)) {
            return false;
          }
        }

        return true;
      });
    });
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
