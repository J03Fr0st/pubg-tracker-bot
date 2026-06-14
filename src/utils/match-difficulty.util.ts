/**
 * Pure opponent difficulty calculator.
 *
 * Converts encountered opponents' season K/D and ADR into a match-level
 * 0-100 score and label. Has no Discord, repository, PUBG API, or
 * environment dependencies.
 */

export interface OpponentSeasonStats {
  kd: number;
  adr: number;
}

export type OpponentDifficultyLabel = 'Easy' | 'Standard' | 'Hard' | 'Brutal';

export interface OpponentDifficultyResult {
  score: number;
  label: OpponentDifficultyLabel;
  opponentCount: number;
}

export interface LobbyDifficultyResult {
  score: number;
  label: OpponentDifficultyLabel;
  playerCount: number;
  humanCount: number;
  botCount: number;
}

const BASE_KD = 1.0;
const BASE_ADR = 150;
const SCORE_SCALE = 50;
const MIN_SCORE = 0;
const MAX_SCORE = 100;

function isUsableStat(value: number): boolean {
  return Number.isFinite(value) && value >= 0;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function scoreOpponent(stats: OpponentSeasonStats): number {
  const raw = ((stats.kd / BASE_KD) + (stats.adr / BASE_ADR)) / 2 * SCORE_SCALE;
  return clamp(Math.round(raw), MIN_SCORE, MAX_SCORE);
}

function labelFor(score: number): OpponentDifficultyLabel {
  if (score <= 34) return 'Easy';
  if (score <= 64) return 'Standard';
  if (score <= 84) return 'Hard';
  return 'Brutal';
}

export function isBotAccountId(accountId: string): boolean {
  return accountId.startsWith('ai.');
}

export function calculateOpponentDifficulty(
  opponentAccountIds: Iterable<string>,
  seasonStats: Map<string, OpponentSeasonStats>
): OpponentDifficultyResult | null {
  const uniqueIds = new Set(opponentAccountIds);
  const scores: number[] = [];

  for (const id of uniqueIds) {
    if (!id) continue;
    const stats = seasonStats.get(id);
    if (!stats) continue;
    if (!isUsableStat(stats.kd) || !isUsableStat(stats.adr)) continue;
    scores.push(scoreOpponent(stats));
  }

  if (scores.length === 0) {
    return null;
  }

  const sum = scores.reduce((acc, value) => acc + value, 0);
  const score = Math.round(sum / scores.length);

  return {
    score,
    label: labelFor(score),
    opponentCount: scores.length,
  };
}

export function calculateLobbyDifficulty(
  participantAccountIds: Iterable<string>,
  seasonStats: Map<string, OpponentSeasonStats>
): LobbyDifficultyResult | null {
  const uniqueIds = new Set(participantAccountIds);
  const scores: number[] = [];
  let humanCount = 0;
  let botCount = 0;

  for (const id of uniqueIds) {
    if (!id) continue;

    if (isBotAccountId(id)) {
      scores.push(MIN_SCORE);
      botCount += 1;
      continue;
    }

    const stats = seasonStats.get(id);
    if (!stats) continue;
    if (!isUsableStat(stats.kd) || !isUsableStat(stats.adr)) continue;

    scores.push(scoreOpponent(stats));
    humanCount += 1;
  }

  if (scores.length === 0) {
    return null;
  }

  const sum = scores.reduce((acc, value) => acc + value, 0);
  const score = Math.round(sum / scores.length);

  return {
    score,
    label: labelFor(score),
    playerCount: scores.length,
    humanCount,
    botCount,
  };
}
