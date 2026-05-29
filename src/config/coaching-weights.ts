export interface CoachingScoringWeights {
  /** Points added when the player died (vs. only being knocked). Larger = death cases dominate ranking. */
  deathOutcome: number;
  /** Points added when the player was only knocked. Keep below deathOutcome so deaths rank first. */
  knockOutcome: number;
  /** Bonus when the fight matches the "bad reset" pattern (heavy damage + same enemy + no reposition). */
  badReset: number;
  /** Bonus when telemetry trade-range confidence is known (i.e. teammate positions are usable). */
  tradeRangeKnown: number;
  /** Bonus when the closest teammate did not damage the enemy in the trade window. */
  noTeammateDamage: number;
  /** Bonus when height advantage is observable from telemetry. */
  heightKnown: number;
}

export const DEFAULT_COACHING_SCORING_WEIGHTS: CoachingScoringWeights = {
  deathOutcome: 50,
  knockOutcome: 40,
  badReset: 30,
  tradeRangeKnown: 10,
  noTeammateDamage: 5,
  heightKnown: 5,
};
