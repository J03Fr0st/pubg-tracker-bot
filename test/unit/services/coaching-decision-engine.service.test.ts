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
      're-peeked EnemyOne 6s after taking 83 damage'
    );
    expect(insights[0].evidence.join(' ')).toContain(
      'appears to have been too far to trade'
    );
    expect(insights[0].recommendation).toContain('Break line of sight');
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
