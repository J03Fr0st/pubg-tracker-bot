import type { CoachingInsight, CoachingRating } from '../types/coaching.types';
import type { CoachingCandidate, CoachingDetectorResult } from '../types/coaching-detector.types';

const MAX_INSIGHTS_PER_PLAYER = 3;

export class CoachingCandidateRankerService {
  public rank(results: CoachingDetectorResult[]): CoachingCandidate[] {
    const candidates = results
      .filter(
        (result): result is Extract<CoachingDetectorResult, { kind: 'candidate' }> =>
          result.kind === 'candidate'
      )
      .map((result) => result.candidate);
    const deduplicated = new Map<string, CoachingCandidate>();
    for (const candidate of candidates) {
      const key = `${candidate.player.accountId}:${candidate.dedupeKey}`;
      const current = deduplicated.get(key);
      if (!current || this.score(candidate) > this.score(current)) {
        deduplicated.set(key, candidate);
      }
    }

    const byPlayer = new Map<string, CoachingCandidate[]>();
    for (const candidate of deduplicated.values()) {
      const playerCandidates = byPlayer.get(candidate.player.accountId) ?? [];
      playerCandidates.push(candidate);
      byPlayer.set(candidate.player.accountId, playerCandidates);
    }

    return [...byPlayer.values()].flatMap((playerCandidates) =>
      this.selectNovelCandidates(playerCandidates)
    );
  }

  private selectNovelCandidates(candidates: CoachingCandidate[]): CoachingCandidate[] {
    const remaining = [...candidates];
    const selected: CoachingCandidate[] = [];
    while (remaining.length > 0 && selected.length < MAX_INSIGHTS_PER_PLAYER) {
      remaining.sort((left, right) => {
        const leftNovelty = selected.some((entry) => entry.category === left.category) ? -1 : 0;
        const rightNovelty = selected.some((entry) => entry.category === right.category) ? -1 : 0;
        return this.score(right) + rightNovelty - (this.score(left) + leftNovelty);
      });
      const next = remaining.shift();
      if (next) selected.push(next);
    }
    return selected;
  }

  private score(candidate: CoachingCandidate): number {
    return (
      this.ratingScore(candidate.confidence) * 4 +
      this.ratingScore(candidate.severity) * 3 +
      candidate.actionability * 2 +
      candidate.causalProximity
    );
  }

  private ratingScore(rating: CoachingRating): number {
    if (rating === 'high') return 3;
    if (rating === 'medium') return 2;
    return 1;
  }
}

export class CoachingNarrativeBuilderService {
  public build(candidates: CoachingCandidate[]): CoachingInsight[] {
    return candidates.map((candidate) => ({
      playerName: candidate.player.name,
      category: candidate.category,
      kind: 'decisive-mistake',
      title: candidate.title,
      timestamp: candidate.timestamp,
      matchTimeSeconds: candidate.matchTimeSeconds,
      severity: candidate.severity,
      confidence: candidate.confidence,
      evidence: [
        ...candidate.claims.map((claim) => claim.text),
        ...(candidate.causalLinks?.length ? [candidate.causalLinks.join(' -> ')] : []),
      ],
      recommendation: candidate.recommendation,
      betterPlay: candidate.betterPlay,
      claims: candidate.claims.map((claim) => ({
        text: claim.text,
        confidence: claim.confidence,
        evidence: claim.eventIds,
      })),
    }));
  }
}
