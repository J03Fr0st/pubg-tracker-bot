import type { LogPlayerKillV2, LogPlayerTakeDamage } from '@j03fr0st/pubg-ts';
import { FightContextBuilderService } from '../../../src/services/fight-context-builder.service';
import type { MatchAnalysis, PlayerAnalysis } from '../../../src/types/analytics-results.types';

function makeAnalysis(overrides: Partial<PlayerAnalysis>): PlayerAnalysis {
  return {
    playerName: 'TestPlayer',
    matchStartTime: new Date('2024-01-01T10:00:00.000Z'),
    killEvents: [],
    knockdownEvents: [],
    damageEvents: [],
    reviveEvents: [],
    deathEvents: [],
    knockedDownEvents: [],
    weaponStats: [],
    killChains: [],
    calculatedAssists: [],
    totalDamageDealt: 0,
    totalDamageTaken: 0,
    kdRatio: 0,
    avgKillDistance: 0,
    headshotPercentage: 0,
    killsPerMinute: 0,
    ...overrides,
  };
}

function makeMatchAnalysis(analyses: PlayerAnalysis[]): MatchAnalysis {
  return {
    matchId: 'match-123',
    playerAnalyses: new Map(analyses.map((analysis) => [analysis.playerName, analysis])),
    processingTimeMs: 1,
    totalEventsProcessed: 1,
  };
}

function makeDamage(overrides: Record<string, unknown>): LogPlayerTakeDamage {
  return {
    _D: '2024-01-01T10:18:36.000Z',
    _T: 'LogPlayerTakeDamage',
    attacker: { name: 'EnemyOne', location: { x: 1000, y: 0, z: 1200 } },
    victim: { name: 'TestPlayer', location: { x: 0, y: 0, z: 0 } },
    damage: 83,
    ...overrides,
  } as LogPlayerTakeDamage;
}

function makeDeath(overrides: Record<string, unknown>): LogPlayerKillV2 {
  return {
    _D: '2024-01-01T10:18:42.000Z',
    _T: 'LogPlayerKillV2',
    killer: { name: 'EnemyOne', location: { x: 1000, y: 0, z: 1200 } },
    victim: { name: 'TestPlayer', location: { x: 100, y: 0, z: 0 } },
    ...overrides,
  } as LogPlayerKillV2;
}

describe('FightContextBuilderService', () => {
  it('builds a decisive fight context for a same-enemy failed reset death', () => {
    const damage = makeDamage({});
    const death = makeDeath({});
    const service = new FightContextBuilderService();

    const contexts = service.buildFightContexts(
      makeMatchAnalysis([makeAnalysis({ deathEvents: [death] })]),
      ['TestPlayer'],
      [damage]
    );

    expect(contexts).toHaveLength(1);
    expect(contexts[0]).toMatchObject({
      playerName: 'TestPlayer',
      enemyName: 'EnemyOne',
      outcome: 'death',
      matchTimeSeconds: 1122,
      repeatedSameEnemy: true,
    });
    expect(contexts[0].damageTaken[0]).toMatchObject({
      attackerName: 'EnemyOne',
      victimName: 'TestPlayer',
      damage: 83,
    });
  });

  it('marks teammate trade range as medium confidence when the nearest tracked teammate is far away', () => {
    const damage = makeDamage({});
    const death = makeDeath({});
    const teammate = makeAnalysis({
      playerName: 'TeamMate',
      deathEvents: [
        makeDeath({
          victim: { name: 'TeamMate', location: { x: 9000, y: 0, z: 0 } },
          killer: { name: 'OtherEnemy', location: { x: 9100, y: 0, z: 0 } },
        }),
      ],
    });
    const service = new FightContextBuilderService();

    const contexts = service.buildFightContexts(
      makeMatchAnalysis([makeAnalysis({ deathEvents: [death] }), teammate]),
      ['TestPlayer', 'TeamMate'],
      [damage]
    );

    expect(contexts[0].closestTeammateName).toBe('TeamMate');
    expect(contexts[0].closestTeammateDistanceMeters).toBeGreaterThan(60);
    expect(contexts[0].tradeRangeConfidence).toBe('medium');
  });

  it('detects no meaningful reposition when the player barely moves after heavy damage', () => {
    const damage = makeDamage({
      victim: { name: 'TestPlayer', location: { x: 0, y: 0, z: 0 } },
    });
    const death = makeDeath({
      victim: { name: 'TestPlayer', location: { x: 100, y: 0, z: 0 } },
    });
    const service = new FightContextBuilderService();

    const contexts = service.buildFightContexts(
      makeMatchAnalysis([makeAnalysis({ deathEvents: [death] })]),
      ['TestPlayer'],
      [damage]
    );

    expect(contexts[0].repositionDistanceMeters).toBeLessThan(15);
    expect(contexts[0].repositionConfidence).toBe('high');
  });

  it('detects height disadvantage when enemy z position is meaningfully higher', () => {
    const damage = makeDamage({});
    const death = makeDeath({});
    const service = new FightContextBuilderService();

    const contexts = service.buildFightContexts(
      makeMatchAnalysis([makeAnalysis({ deathEvents: [death] })]),
      ['TestPlayer'],
      [damage]
    );

    expect(contexts[0].heightDeltaMeters).toBeGreaterThan(10);
    expect(contexts[0].heightConfidence).toBe('medium');
  });

  it('omits geometry confidence when position data is missing', () => {
    const damage = makeDamage({
      attacker: { name: 'EnemyOne' },
      victim: { name: 'TestPlayer' },
    });
    const death = makeDeath({
      killer: { name: 'EnemyOne' },
      victim: { name: 'TestPlayer' },
    });
    const service = new FightContextBuilderService();

    const contexts = service.buildFightContexts(
      makeMatchAnalysis([makeAnalysis({ deathEvents: [death] })]),
      ['TestPlayer'],
      [damage]
    );

    expect(contexts[0].closestTeammateDistanceMeters).toBeUndefined();
    expect(contexts[0].repositionDistanceMeters).toBeUndefined();
    expect(contexts[0].heightDeltaMeters).toBeUndefined();
    expect(contexts[0].heightConfidence).toBe('low');
  });
});
