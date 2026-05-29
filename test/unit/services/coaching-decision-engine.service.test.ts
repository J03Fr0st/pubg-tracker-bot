import {
  type CoachingScoringWeights,
  DEFAULT_COACHING_SCORING_WEIGHTS,
} from '../../../src/config/coaching-weights';
import { CoachingDecisionEngineService } from '../../../src/services/coaching-decision-engine.service';
import type { FightContext } from '../../../src/types/coaching.types';

function makeContext(overrides: Partial<FightContext>): FightContext {
  return {
    playerName: 'TestPlayer',
    enemyName: 'EnemyOne',
    outcome: 'death',
    timestamp: new Date('2024-01-01T10:18:42.000Z'),
    matchTimeSeconds: 1122,
    damageTaken: [
      {
        timestamp: new Date('2024-01-01T10:18:36.000Z'),
        matchTimeSeconds: 1116,
        attackerName: 'EnemyOne',
        victimName: 'TestPlayer',
        damage: 83,
      },
    ],
    damageDealt: [],
    closestTeammateName: 'TeamMate',
    closestTeammateDistanceMeters: 78,
    closestTeammateDamageToEnemy: [],
    tradeRangeConfidence: 'medium',
    repositionDistanceMeters: 4,
    repositionConfidence: 'high',
    heightDeltaMeters: 12,
    heightConfidence: 'medium',
    repeatedSameEnemy: true,
    claims: [],
    ...overrides,
  };
}

describe('CoachingDecisionEngineService', () => {
  it('creates a strict decisive mistake insight from a bad reset context', () => {
    const service = new CoachingDecisionEngineService();
    const insights = service.createInsights([makeContext({})]);

    expect(insights).toHaveLength(1);
    expect(insights[0]).toMatchObject({
      playerName: 'TestPlayer',
      category: 'decisive-mistake',
      kind: 'decisive-mistake',
      title: 'Decisive mistake',
      severity: 'high',
      confidence: 'medium',
    });
    expect(insights[0].evidence.join(' ')).toContain(
      'EnemyOne hit you for 83 damage, then 6s later you died to the same player before creating a reset'
    );
    expect(insights[0].evidence.join(' ')).toContain('appears to have been too far to trade');
    expect(insights[0].recommendation).toContain('Break line of sight');
  });

  it('calls out close spacing that does not become trade damage', () => {
    const service = new CoachingDecisionEngineService();
    const insights = service.createInsights([
      makeContext({
        closestTeammateDistanceMeters: 22,
        enemyDistanceMeters: 31,
      }),
    ]);

    expect(insights[0].evidence.join(' ')).toContain(
      'TeamMate was 22m from you, but telemetry shows no damage from them to EnemyOne'
    );
  });

  it('describes stacked logged geometry without claiming line of sight', () => {
    const service = new CoachingDecisionEngineService();
    const insights = service.createInsights([
      makeContext({
        closestTeammateDistanceMeters: 22,
        enemyDistanceMeters: 31,
        teammateAngleFromPlayerToEnemyDegrees: 12,
      }),
    ]);

    expect(insights[0].evidence.join(' ')).toContain(
      'TeamMate was only 12 degrees off your logged line to EnemyOne'
    );
    expect(insights[0].evidence.join(' ')).not.toContain('line of sight');
  });

  it('does not call close spacing a missed trade when teammate damaged the enemy', () => {
    const service = new CoachingDecisionEngineService();
    const insights = service.createInsights([
      makeContext({
        closestTeammateDistanceMeters: 22,
        closestTeammateDamageToEnemy: [
          {
            timestamp: new Date('2024-01-01T10:18:40.000Z'),
            matchTimeSeconds: 1120,
            attackerName: 'TeamMate',
            victimName: 'EnemyOne',
            damage: 24,
          },
        ],
      }),
    ]);

    expect(insights[0].evidence.join(' ')).not.toContain('no damage from them to EnemyOne');
  });

  it('omits low-confidence geometry claims', () => {
    const service = new CoachingDecisionEngineService();
    const insights = service.createInsights([
      makeContext({
        closestTeammateDistanceMeters: undefined,
        closestTeammateName: undefined,
        tradeRangeConfidence: 'low',
        heightDeltaMeters: undefined,
        heightConfidence: 'low',
      }),
    ]);

    expect(insights[0].evidence.join(' ')).not.toContain('teammate');
    expect(insights[0].evidence.join(' ')).not.toContain('height');
  });

  it('adds a pattern insight only when repeated evidence exists', () => {
    const service = new CoachingDecisionEngineService();
    const insights = service.createInsights([
      makeContext({ timestamp: new Date('2024-01-01T10:10:00.000Z'), matchTimeSeconds: 600 }),
      makeContext({ timestamp: new Date('2024-01-01T10:18:42.000Z'), matchTimeSeconds: 1122 }),
    ]);

    expect(insights).toHaveLength(2);
    expect(insights[1]).toMatchObject({
      category: 'pattern',
      kind: 'pattern',
      title: 'Pattern to fix',
    });
    expect(insights[1].recommendation).toContain('Stop giving the same enemy');
  });

  it('returns at most two insights', () => {
    const service = new CoachingDecisionEngineService();
    const insights = service.createInsights([
      makeContext({ playerName: 'Alpha', matchTimeSeconds: 600 }),
      makeContext({ playerName: 'Bravo', matchTimeSeconds: 700 }),
      makeContext({ playerName: 'Charlie', matchTimeSeconds: 800 }),
    ]);

    expect(insights).toHaveLength(2);
  });
});

describe('CoachingDecisionEngineService — scoring weights', () => {
  it('exposes default weights matching legacy magic numbers', () => {
    expect(DEFAULT_COACHING_SCORING_WEIGHTS).toEqual<CoachingScoringWeights>({
      deathOutcome: 50,
      knockOutcome: 40,
      badReset: 30,
      tradeRangeKnown: 10,
      noTeammateDamage: 5,
      heightKnown: 5,
    });
  });

  it('accepts injected weights and uses them in scoring', () => {
    const deathCtx = makeContext({ playerName: 'DeathPlayer', outcome: 'death' });
    const knockCtx = makeContext({
      playerName: 'KnockPlayer',
      outcome: 'knock',
      closestTeammateDistanceMeters: undefined,
      closestTeammateName: undefined,
      tradeRangeConfidence: 'low',
      heightDeltaMeters: undefined,
      heightConfidence: 'low',
    });
    const engine = new CoachingDecisionEngineService({
      ...DEFAULT_COACHING_SCORING_WEIGHTS,
      deathOutcome: 1000,
      knockOutcome: 0,
      badReset: 0,
      tradeRangeKnown: 0,
      noTeammateDamage: 0,
      heightKnown: 0,
    });

    expect(engine.createInsights([deathCtx, knockCtx])[0].playerName).toBe(deathCtx.playerName);
  });
});
