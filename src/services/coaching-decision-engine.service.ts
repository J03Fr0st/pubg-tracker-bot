import {
  type CoachingScoringWeights,
  DEFAULT_COACHING_SCORING_WEIGHTS,
} from '../config/coaching-weights';
import type {
  CoachingInsight,
  CoachingRating,
  FightContext,
  FightContextClaim,
} from '../types/coaching.types';

const HEAVY_DAMAGE_THRESHOLD = 60;
// Minimum gap between the first heavy hit and the decisive event for a "reset" to
// have been physically possible. Below this the player was bursted down with no
// realistic window to break line of sight and heal, so it is not a missed reset.
const MIN_RESET_WINDOW_SECONDS = 4;
const PATTERN_MIN_COUNT = 2;
const MAX_INSIGHTS_PER_PLAYER = 3;
const TRADE_RANGE_METERS = 60;
const STACKED_ANGLE_DEGREES = 25;
const MATERIAL_BLUE_ZONE_DAMAGE = 25;

export class CoachingDecisionEngineService {
  public constructor(
    private readonly weights: CoachingScoringWeights = DEFAULT_COACHING_SCORING_WEIGHTS
  ) {}

  public createInsights(contexts: FightContext[]): CoachingInsight[] {
    return [...this.groupContextsByPlayer(contexts).values()].flatMap((playerContexts) => {
      const decisive = this.createDecisiveInsight(playerContexts);
      const pattern = this.createPatternInsight(playerContexts);
      const fingerprint = this.createFingerprintInsight(playerContexts);
      return [decisive, pattern, fingerprint]
        .filter((insight): insight is CoachingInsight => Boolean(insight))
        .slice(0, MAX_INSIGHTS_PER_PLAYER);
    });
  }

  private groupContextsByPlayer(contexts: FightContext[]): Map<string, FightContext[]> {
    const grouped = new Map<string, FightContext[]>();
    for (const context of contexts) {
      const playerContexts = grouped.get(context.playerName) ?? [];
      playerContexts.push(context);
      grouped.set(context.playerName, playerContexts);
    }
    return grouped;
  }

  private createDecisiveInsight(contexts: FightContext[]): CoachingInsight | null {
    const ranked = contexts
      .map((context) => ({ context, score: this.scoreContext(context) }))
      .filter((entry) => entry.score > 0)
      .sort((left, right) => right.score - left.score);

    const selected = ranked[0]?.context;
    if (!selected) {
      return null;
    }

    const claims = this.buildClaims(selected);
    if (claims.length === 0) {
      return null;
    }

    const hasZonePressure = this.hasMaterialZonePressure(selected);

    return {
      playerName: selected.playerName,
      category: 'decisive-mistake',
      kind: 'decisive-mistake',
      title: 'Decisive mistake',
      timestamp: selected.timestamp,
      matchTimeSeconds: selected.matchTimeSeconds,
      severity: 'high',
      confidence: this.lowestClaimConfidence(claims),
      evidence: claims.map((claim) => claim.text),
      recommendation: hasZonePressure
        ? 'Rotate earlier, break line of sight, heal, then re-engage from a new angle or with teammate pressure.'
        : 'Break line of sight, heal, then re-engage from a new angle or with teammate pressure.',
      betterPlay: [
        ...(hasZonePressure ? ['rotate earlier before taking optional fights'] : []),
        'break line of sight',
        'heal before re-engaging',
        'wait for teammate trade pressure or force a new angle',
      ],
      claims,
    };
  }

  private createPatternInsight(contexts: FightContext[]): CoachingInsight | null {
    const badResetContexts = contexts.filter((context) => this.isBadReset(context));
    if (badResetContexts.length < PATTERN_MIN_COUNT) {
      return null;
    }

    const latest = badResetContexts.sort(
      (left, right) => right.matchTimeSeconds - left.matchTimeSeconds
    )[0];

    return {
      playerName: latest.playerName,
      category: 'pattern',
      kind: 'pattern',
      title: 'Pattern to fix',
      timestamp: latest.timestamp,
      matchTimeSeconds: latest.matchTimeSeconds,
      severity: 'medium',
      confidence: 'high',
      evidence: [
        `Repeated ${badResetContexts.length} fights where heavy damage was followed by no reset.`,
      ],
      recommendation:
        'Stop giving the same enemy a second clean fight after you are already damaged.',
      betterPlay: [
        'break line of sight',
        'heal before re-engaging',
        'wait for teammate trade pressure or force a new angle',
      ],
      claims: [
        {
          text: `Repeated ${badResetContexts.length} fights where heavy damage was followed by no reset.`,
          confidence: 'high',
          evidence: badResetContexts.map(
            (context) => `${context.playerName} at ${context.matchTimeSeconds}s`
          ),
        },
      ],
    };
  }

  private createFingerprintInsight(contexts: FightContext[]): CoachingInsight | null {
    const reviewedFightCount = contexts.length;
    if (reviewedFightCount === 0) {
      return null;
    }

    const badResetCount = contexts.filter((context) => this.isBadReset(context)).length;
    const zonePressureCount = contexts.filter((context) =>
      this.hasMaterialZonePressure(context)
    ).length;
    const isolatedTradeCount = contexts.filter((context) => this.hasIsolatedTrade(context)).length;
    const lowDamageConversionCount = contexts.filter((context) =>
      this.hasLowDamageConversion(context)
    ).length;

    const profile = [
      {
        name: 'Aggressive re-peeker',
        count: badResetCount,
        minimumCount: 2,
        recommendation:
          'Treat first damage as a reset trigger: break line of sight, heal, then force a new angle.',
        betterPlay: ['break line of sight', 'heal before re-engaging', 'force a new angle'],
      },
      {
        name: 'Late-rotate fighter',
        count: zonePressureCount,
        minimumCount: 1,
        recommendation:
          'Choose the next position earlier and move before blue-zone damage turns the fight into a forced duel.',
        betterPlay: ['rotate earlier before taking optional fights', 'move before blue-zone damage'],
      },
      {
        name: 'Isolated entry',
        count: isolatedTradeCount,
        minimumCount: 2,
        recommendation:
          'Start fights where the nearest teammate can trade damage, not merely stand nearby.',
        betterPlay: ['wait for teammate trade pressure', 'force a crossfire angle'],
      },
      {
        name: 'Low-conversion trader',
        count: lowDamageConversionCount,
        minimumCount: 2,
        recommendation:
          'Do not extend damage-negative trades; reset or reposition when return damage is not landing.',
        betterPlay: ['stop damage-negative trades', 'reposition before re-engaging'],
      },
    ]
      .filter((entry) => entry.count >= entry.minimumCount)
      .sort((left, right) => right.count - left.count)[0];

    if (!profile) {
      return null;
    }

    const latest = [...contexts].sort(
      (left, right) => right.matchTimeSeconds - left.matchTimeSeconds
    )[0];

    return {
      playerName: latest.playerName,
      category: 'player-fingerprint',
      kind: 'player-fingerprint',
      title: 'Player fingerprint',
      timestamp: latest.timestamp,
      matchTimeSeconds: latest.matchTimeSeconds,
      severity: 'medium',
      confidence: profile.count >= 2 ? 'high' : 'medium',
      evidence: [
        `${profile.name}: ${profile.count} of ${reviewedFightCount} reviewed fights matched this telemetry pattern.`,
      ],
      recommendation: profile.recommendation,
      betterPlay: profile.betterPlay,
      claims: [
        {
          text: `${profile.name}: ${profile.count} of ${reviewedFightCount} reviewed fights matched this telemetry pattern.`,
          confidence: profile.count >= 2 ? 'high' : 'medium',
          evidence: contexts
            .filter((context) => this.contextMatchesProfile(context, profile.name))
            .map((context) => `${context.playerName} at ${context.matchTimeSeconds}s`),
        },
      ],
    };
  }

  private buildClaims(context: FightContext): FightContextClaim[] {
    const claims: FightContextClaim[] = [];
    const heavyDamage = this.getHeavyDamage(context);
    const seconds = this.getResetWindowSeconds(context);

    if (
      context.repeatedSameEnemy &&
      heavyDamage &&
      context.enemyName &&
      seconds !== undefined &&
      seconds >= MIN_RESET_WINDOW_SECONDS
    ) {
      claims.push({
        text: `${context.enemyName} hit you for ${heavyDamage.damage} damage, then ${seconds}s later you ${context.outcome === 'death' ? 'died' : 'got knocked'} to the same player before creating a reset.`,
        confidence: 'high',
        evidence: [
          `Took ${heavyDamage.damage} damage from ${context.enemyName}`,
          `${context.outcome === 'death' ? 'Died' : 'Got knocked'} ${seconds}s later`,
        ],
      });
    }

    if (
      context.tradeRangeConfidence !== 'low' &&
      context.closestTeammateName &&
      context.closestTeammateDistanceMeters !== undefined &&
      context.closestTeammateDistanceMeters > TRADE_RANGE_METERS
    ) {
      claims.push({
        text: `Your nearest tracked teammate appears to have been too far to trade at ${Math.round(context.closestTeammateDistanceMeters)}m away.`,
        confidence: context.tradeRangeConfidence,
        evidence: [`Closest tracked teammate: ${context.closestTeammateName}`],
      });
    }

    if (
      context.tradeRangeConfidence !== 'low' &&
      context.closestTeammateName &&
      context.closestTeammateDistanceMeters !== undefined &&
      context.closestTeammateDistanceMeters <= TRADE_RANGE_METERS &&
      context.enemyName &&
      context.closestTeammateDamageToEnemy.length === 0
    ) {
      claims.push({
        text: `${context.closestTeammateName} was ${Math.round(context.closestTeammateDistanceMeters)}m from you, but telemetry shows no damage from them to ${context.enemyName} in the 10s before you went down.`,
        confidence: context.tradeRangeConfidence,
        evidence: [
          `Closest tracked teammate: ${context.closestTeammateName}`,
          `Enemy distance: ${context.enemyDistanceMeters ? `${Math.round(context.enemyDistanceMeters)}m` : 'unknown'}`,
        ],
      });
    }

    if (
      context.tradeRangeConfidence !== 'low' &&
      context.closestTeammateName &&
      context.enemyName &&
      context.teammateAngleFromPlayerToEnemyDegrees !== undefined &&
      context.teammateAngleFromPlayerToEnemyDegrees <= STACKED_ANGLE_DEGREES
    ) {
      claims.push({
        text: `${context.closestTeammateName} was only ${context.teammateAngleFromPlayerToEnemyDegrees} degrees off your logged line to ${context.enemyName}; the positions were close together, not a separate angle.`,
        confidence: context.tradeRangeConfidence,
        evidence: [
          `Teammate angle from player-to-enemy line: ${context.teammateAngleFromPlayerToEnemyDegrees} degrees`,
        ],
      });
    }

    if (
      context.heightConfidence !== 'low' &&
      context.heightDeltaMeters !== undefined &&
      context.heightDeltaMeters > 0
    ) {
      claims.push({
        text: `${context.enemyName ?? 'The enemy'} appears to have had a ${Math.round(context.heightDeltaMeters)}m height advantage.`,
        confidence: context.heightConfidence,
        evidence: ['Enemy z-position was higher than player z-position'],
      });
    }

    const zonePressureClaim = this.buildZonePressureClaim(context);
    if (zonePressureClaim) {
      claims.push(zonePressureClaim);
    }

    return claims;
  }

  private buildZonePressureClaim(context: FightContext): FightContextClaim | null {
    if (!this.hasMaterialZonePressure(context)) {
      return null;
    }

    const damage = Math.round(context.blueZoneDamage.damage);
    return {
      text: `You took ${damage} blue-zone damage in the ${context.blueZoneDamage.windowSeconds}s before this fight, so the rotate was already costing health before the duel.`,
      confidence: 'high',
      evidence: [`Blue-zone damage before decisive event: ${damage}`],
    };
  }

  private scoreContext(context: FightContext): number {
    let score = context.outcome === 'death' ? this.weights.deathOutcome : this.weights.knockOutcome;
    if (this.isBadReset(context)) score += this.weights.badReset;
    if (context.tradeRangeConfidence !== 'low') score += this.weights.tradeRangeKnown;
    if (context.closestTeammateDamageToEnemy.length === 0) score += this.weights.noTeammateDamage;
    if (context.heightConfidence !== 'low') score += this.weights.heightKnown;
    return score;
  }

  private isBadReset(context: FightContext): boolean {
    const heavyDamage = this.getHeavyDamage(context);
    const resetWindow = this.getResetWindowSeconds(context);
    const hadTimeToReset = resetWindow !== undefined && resetWindow >= MIN_RESET_WINDOW_SECONDS;
    const noMeaningfulReposition =
      context.repositionDistanceMeters === undefined || context.repositionDistanceMeters < 15;
    return Boolean(
      heavyDamage && hadTimeToReset && context.repeatedSameEnemy && noMeaningfulReposition
    );
  }

  private getResetWindowSeconds(context: FightContext): number | undefined {
    const heavyDamage = this.getHeavyDamage(context);
    return heavyDamage ? context.matchTimeSeconds - heavyDamage.matchTimeSeconds : undefined;
  }

  private hasIsolatedTrade(context: FightContext): boolean {
    return (
      context.tradeRangeConfidence !== 'low' &&
      context.closestTeammateName !== undefined &&
      context.closestTeammateDamageToEnemy.length === 0
    );
  }

  private hasLowDamageConversion(context: FightContext): boolean {
    const damageTaken = context.damageTaken.reduce((sum, event) => sum + event.damage, 0);
    const damageDealt = context.damageDealt.reduce((sum, event) => sum + event.damage, 0);
    return damageTaken >= HEAVY_DAMAGE_THRESHOLD && damageDealt < damageTaken / 2;
  }

  private contextMatchesProfile(context: FightContext, profileName: string): boolean {
    if (profileName === 'Aggressive re-peeker') return this.isBadReset(context);
    if (profileName === 'Late-rotate fighter') return this.hasMaterialZonePressure(context);
    if (profileName === 'Isolated entry') return this.hasIsolatedTrade(context);
    if (profileName === 'Low-conversion trader') return this.hasLowDamageConversion(context);
    return false;
  }

  private hasMaterialZonePressure(context: FightContext): boolean {
    return context.blueZoneDamage.damage >= MATERIAL_BLUE_ZONE_DAMAGE;
  }

  private getHeavyDamage(context: FightContext) {
    return context.damageTaken.find((event) => event.damage >= HEAVY_DAMAGE_THRESHOLD);
  }

  private lowestClaimConfidence(claims: FightContextClaim[]): CoachingRating {
    if (claims.some((claim) => claim.confidence === 'low')) return 'low';
    if (claims.some((claim) => claim.confidence === 'medium')) return 'medium';
    return 'high';
  }
}
