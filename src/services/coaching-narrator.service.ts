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
    const lineTokens = lines.map((line) => this.tokenize(line));
    const ratingLineIndexes = new Set<number>();
    for (let index = 0; index < lineTokens.length; index += 1) {
      const tokens = lineTokens[index];
      if (tokens.includes('severity') || tokens.includes('confidence')) {
        const ratingReason = this.validateRatingLine(tokens, insight);
        if (ratingReason) {
          return ratingReason;
        }
        ratingLineIndexes.add(index);
      }
    }

    const allowedTokens = this.collectAllowedTokens(insight);
    for (const tokens of lineTokens) {
      for (const token of tokens) {
        if (!allowedTokens.has(token)) {
          return `contains unsupported token "${token}"`;
        }
      }
    }

    const meaningfulLines = lineTokens.map((tokens) => this.meaningfulTokens(tokens));
    if (insight.evidence.length === 0) {
      return 'does not preserve all supplied evidence';
    }
    const evidenceSequences = insight.evidence
      .map((evidence) => this.meaningfulTokens(this.tokenize(evidence)))
      .filter((tokens) => tokens.length > 0);
    if (
      evidenceSequences.length !== insight.evidence.length ||
      !evidenceSequences.every((sequence) =>
        meaningfulLines.some((line) => this.containsSequence(line, sequence))
      )
    ) {
      return 'does not preserve all supplied evidence';
    }

    const actions =
      insight.betterPlay && insight.betterPlay.length > 0
        ? insight.betterPlay
        : [insight.recommendation];
    const actionSequences = actions
      .map((action) => this.meaningfulTokens(this.tokenize(action)))
      .filter((tokens) => tokens.length > 0);
    if (
      actionSequences.length !== actions.length ||
      !meaningfulLines.some((line) => this.canSegment(line, actionSequences))
    ) {
      return 'does not include a supplied action';
    }

    const metadataSequences = [
      insight.playerName,
      insight.category,
      insight.title ?? this.toTitleCase(insight.category),
      this.formatMatchTime(insight.matchTimeSeconds),
    ]
      .map((value) => this.meaningfulTokens(this.tokenize(value)))
      .filter((tokens) => tokens.length > 0);
    const statementSequences = [
      ...evidenceSequences,
      ...(insight.claims?.flatMap((claim) => [claim.text, ...claim.evidence]) ?? []).map((value) =>
        this.meaningfulTokens(this.tokenize(value))
      ),
    ].filter((tokens) => tokens.length > 0);
    const attributableSequences = [...metadataSequences, ...statementSequences];

    for (let index = 0; index < meaningfulLines.length; index += 1) {
      if (ratingLineIndexes.has(index)) {
        continue;
      }
      const line = meaningfulLines[index];
      if (
        !this.canSegment(line, actionSequences) &&
        !this.canSegment(line, attributableSequences)
      ) {
        return 'contains a statement not attributable to supplied content';
      }
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

  private meaningfulTokens(tokens: string[]): string[] {
    return tokens.filter((token) => !CONNECTIVE_TOKENS.has(token));
  }

  private containsSequence(tokens: string[], sequence: string[]): boolean {
    for (let start = 0; start <= tokens.length - sequence.length; start += 1) {
      if (sequence.every((token, offset) => token === tokens[start + offset])) {
        return true;
      }
    }
    return false;
  }

  private canSegment(tokens: string[], sequences: string[][]): boolean {
    if (tokens.length === 0 || sequences.length === 0) {
      return false;
    }

    const reachable = new Array<boolean>(tokens.length + 1).fill(false);
    reachable[0] = true;
    for (let start = 0; start < tokens.length; start += 1) {
      if (!reachable[start]) {
        continue;
      }
      for (const sequence of sequences) {
        if (
          start + sequence.length <= tokens.length &&
          sequence.every((token, offset) => token === tokens[start + offset])
        ) {
          reachable[start + sequence.length] = true;
        }
      }
    }
    return reachable[tokens.length];
  }

  private validateRatingLine(tokens: string[], insight: CoachingInsight): string | null {
    const seenLabels = new Set<'severity' | 'confidence'>();
    let index = 0;

    while (index < tokens.length) {
      let label: 'severity' | 'confidence';
      let rating: CoachingRating | undefined;
      const first = tokens[index];

      if (this.isCoachingRating(first)) {
        rating = first;
        const next = tokens[index + 1];
        if (next !== 'severity' && next !== 'confidence') {
          return 'contains unsupported rating syntax';
        }
        label = next;
        index += 2;
      } else if (first === 'severity' || first === 'confidence') {
        label = first;
        index += tokens[index + 1] === 'is' ? 2 : 1;
        const next = tokens[index];
        if (!this.isCoachingRating(next)) {
          return 'contains unsupported rating syntax';
        }
        rating = next;
        index += 1;
      } else {
        return 'contains unsupported rating syntax';
      }

      if (seenLabels.has(label)) {
        return `contains duplicate ${label} rating`;
      }
      seenLabels.add(label);
      if (rating !== insight[label]) {
        return `contradicts ${label} ${insight[label]}`;
      }

      if (index === tokens.length) {
        return null;
      }
      if (tokens[index] !== 'and' || index + 1 === tokens.length) {
        return 'contains unsupported rating syntax';
      }
      index += 1;
    }

    return 'contains unsupported rating syntax';
  }

  private isCoachingRating(token: string | undefined): token is CoachingRating {
    return COACHING_RATINGS.includes(token as CoachingRating);
  }

  private tokenize(text: string): string[] {
    return (
      text
        .normalize('NFKC')
        .toLowerCase()
        .replace(/['\u2019]s(?![\p{L}\p{N}_])/gu, '')
        .match(/[\p{L}\p{N}_]+/gu) ?? []
    );
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
