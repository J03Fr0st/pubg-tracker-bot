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
  'Do',
  'Fight',
  'Reset',
  'You',
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
    const sectionsByPlayer = new Map<string, string[]>();

    for (const insight of insights) {
      const lines = sectionsByPlayer.get(insight.playerName) ?? [];
      lines.push(this.formatTemplateLine(insight));
      sectionsByPlayer.set(insight.playerName, lines);
    }

    return {
      sections: Array.from(sectionsByPlayer.entries()).map(([playerName, lines]) => ({
        playerName,
        lines,
      })),
    };
  }

  private formatTemplateLine(insight: CoachingInsight): string {
    const label = this.toTitleCase(insight.category);
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
      for (const text of [...insight.evidence, insight.recommendation]) {
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
      for (const word of this.toTitleCase(insight.category).split(' ')) {
        allowedNames.add(word);
      }

      for (const text of [...insight.evidence, insight.recommendation]) {
        for (const token of text.match(/\b[A-Z][A-Za-z0-9_]+\b/g) ?? []) {
          allowedNames.add(token);
        }
      }
    }

    return allowedNames;
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
