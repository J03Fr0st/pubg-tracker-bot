import type {
  LogPlayerKillV2,
  LogPlayerMakeGroggy,
  LogPlayerTakeDamage,
} from '@j03fr0st/pubg-ts';
import type { MatchAnalysis, PlayerAnalysis } from '../types/analytics-results.types';
import type { CoachingInsight, CoachingRating } from '../types/coaching.types';

const MAX_INSIGHTS = 3;
const HEAVY_DAMAGE_THRESHOLD = 60;
const REPEEK_WINDOW_SECONDS = 20;

type DecisiveEvent = LogPlayerKillV2 | LogPlayerMakeGroggy;

export class MatchCoachingService {
  public analyzeMatch(
    matchAnalysis: MatchAnalysis,
    trackedPlayerNames: string[],
    damageEvents: LogPlayerTakeDamage[] = []
  ): CoachingInsight[] {
    const insights: CoachingInsight[] = [];

    for (const playerName of trackedPlayerNames) {
      const analysis = matchAnalysis.playerAnalyses.get(playerName);
      if (!analysis) {
        continue;
      }

      const repeekInsight = this.findRepeekAfterDamageInsight(analysis, damageEvents);
      if (repeekInsight) {
        insights.push(repeekInsight);
      }
    }

    return insights
      .sort((left, right) => this.score(right) - this.score(left))
      .slice(0, MAX_INSIGHTS);
  }

  private findRepeekAfterDamageInsight(
    analysis: PlayerAnalysis,
    damageEvents: LogPlayerTakeDamage[]
  ): CoachingInsight | null {
    const decisiveDeaths: DecisiveEvent[] = [
      ...analysis.deathEvents,
      ...analysis.knockedDownEvents,
    ];

    for (const death of decisiveDeaths) {
      const deathTime = this.getEventTime(death);
      const attackerName = this.getDecisiveAttackerName(death);
      if (!deathTime || !attackerName) {
        continue;
      }

      const matchingDamage = damageEvents
        .filter((event) => this.getVictimName(event) === analysis.playerName)
        .filter((event) => this.getAttackerName(event) === attackerName)
        .filter((event) => event.damage >= HEAVY_DAMAGE_THRESHOLD)
        .map((event) => {
          const eventTime = this.getEventTime(event);
          return eventTime
            ? {
                event,
                secondsBeforeDeath: (deathTime.getTime() - eventTime.getTime()) / 1000,
              }
            : null;
        })
        .filter((entry): entry is { event: LogPlayerTakeDamage; secondsBeforeDeath: number } =>
          Boolean(entry)
        )
        .filter(
          (entry) =>
            entry.secondsBeforeDeath >= 0 &&
            entry.secondsBeforeDeath <= REPEEK_WINDOW_SECONDS
        )
        .sort((left, right) => left.secondsBeforeDeath - right.secondsBeforeDeath)[0];

      if (!matchingDamage) {
        continue;
      }

      const matchTimeSeconds = Math.max(
        0,
        Math.round((deathTime.getTime() - analysis.matchStartTime.getTime()) / 1000)
      );
      const seconds = Math.round(matchingDamage.secondsBeforeDeath);
      const damage = Math.round(matchingDamage.event.damage);
      const outcome = death._T === 'LogPlayerMakeGroggy' ? 'Got knocked' : 'Died';

      return {
        playerName: analysis.playerName,
        category: 'fight-reset',
        timestamp: deathTime,
        matchTimeSeconds,
        severity: 'high',
        confidence: 'high',
        evidence: [
          `Took ${damage} damage from ${attackerName}`,
          `${outcome} to ${attackerName} ${seconds}s later`,
        ],
        recommendation:
          'Break line of sight, heal, or force a new angle before challenging the same player again.',
      };
    }

    return null;
  }

  private getEventTime(event: { _D?: string }): Date | null {
    if (!event._D) {
      return null;
    }

    const parsed = new Date(event._D);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  private getAttackerName(event: LogPlayerTakeDamage): string | null {
    return event.attacker?.name ?? null;
  }

  private getVictimName(event: LogPlayerTakeDamage): string | null {
    return event.victim?.name ?? null;
  }

  private getDecisiveAttackerName(event: DecisiveEvent): string | null {
    if ('killer' in event) {
      return event.killer?.name ?? null;
    }

    return event.attacker?.name ?? null;
  }

  private score(insight: CoachingInsight): number {
    return this.ratingScore(insight.severity) * 10 + this.ratingScore(insight.confidence);
  }

  private ratingScore(rating: CoachingRating): number {
    if (rating === 'high') return 3;
    if (rating === 'medium') return 2;
    return 1;
  }
}
