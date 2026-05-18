import type { LogPlayerKillV2, LogPlayerTakeDamage } from '@j03fr0st/pubg-ts';
import { MatchCoachingService } from '../../../src/services/match-coaching.service';
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

function makeMatchAnalysis(analysis: PlayerAnalysis): MatchAnalysis {
  return {
    matchId: 'match-123',
    playerAnalyses: new Map([[analysis.playerName, analysis]]),
    processingTimeMs: 1,
    totalEventsProcessed: 3,
  };
}

describe('MatchCoachingService', () => {
  it('emits a high-confidence fight-reset insight when the same attacker punishes a re-peek', () => {
    const damage = {
      _D: '2024-01-01T10:18:36.000Z',
      _T: 'LogPlayerTakeDamage',
      attacker: { name: 'EnemyOne' },
      victim: { name: 'TestPlayer' },
      damage: 83,
      damageCauserName: 'WeapBerylM762_C',
    } as LogPlayerTakeDamage;

    const death = {
      _D: '2024-01-01T10:18:42.000Z',
      _T: 'LogPlayerKillV2',
      killer: { name: 'EnemyOne' },
      victim: { name: 'TestPlayer' },
      damageCauserName: 'WeapBerylM762_C',
      distance: 4200,
    } as LogPlayerKillV2;

    const service = new MatchCoachingService();
    const insights = service.analyzeMatch(
      makeMatchAnalysis(
        makeAnalysis({
          deathEvents: [death],
          damageEvents: [],
          knockedDownEvents: [],
          totalDamageTaken: 83,
        })
      ),
      ['TestPlayer'],
      [damage]
    );

    expect(insights).toHaveLength(1);
    expect(insights[0]).toMatchObject({
      playerName: 'TestPlayer',
      category: 'decisive-mistake',
      kind: 'decisive-mistake',
      title: 'Decisive mistake',
      severity: 'high',
      matchTimeSeconds: 1122,
    });
    expect(insights[0].evidence.join(' ')).toContain('EnemyOne');
    expect(insights[0].evidence.join(' ')).toContain('83 damage');
    expect(insights[0].recommendation).toContain('Break line of sight');
  });

  it('does not emit a re-peek insight when the attacker is different', () => {
    const damage = {
      _D: '2024-01-01T10:18:36.000Z',
      _T: 'LogPlayerTakeDamage',
      attacker: { name: 'EnemyOne' },
      victim: { name: 'TestPlayer' },
      damage: 83,
    } as LogPlayerTakeDamage;

    const death = {
      _D: '2024-01-01T10:18:42.000Z',
      _T: 'LogPlayerKillV2',
      killer: { name: 'EnemyTwo' },
      victim: { name: 'TestPlayer' },
    } as LogPlayerKillV2;

    const service = new MatchCoachingService();
    const insights = service.analyzeMatch(
      makeMatchAnalysis(makeAnalysis({ deathEvents: [death] })),
      ['TestPlayer'],
      [damage]
    );

    expect(insights).toHaveLength(0);
  });

  it('returns at most two hybrid coaching insights', () => {
    const service = new MatchCoachingService();
    const matchStartTime = new Date('2024-01-01T10:00:00.000Z');

    const analyses = new Map<string, PlayerAnalysis>();
    const damageEvents: LogPlayerTakeDamage[] = [];

    for (const [index, name] of ['Alpha', 'Bravo', 'Charlie', 'Delta'].entries()) {
      const damage = {
        _D: `2024-01-01T10:10:0${index}.000Z`,
        _T: 'LogPlayerTakeDamage',
        attacker: { name: `Enemy${index}` },
        victim: { name },
        damage: 90 - index,
      } as LogPlayerTakeDamage;
      const death = {
        _D: `2024-01-01T10:10:1${index}.000Z`,
        _T: 'LogPlayerKillV2',
        killer: { name: `Enemy${index}` },
        victim: { name },
      } as LogPlayerKillV2;

      damageEvents.push(damage);
      analyses.set(name, makeAnalysis({ playerName: name, matchStartTime, deathEvents: [death] }));
    }

    const insights = service.analyzeMatch(
      {
        matchId: 'match-123',
        playerAnalyses: analyses,
        processingTimeMs: 1,
        totalEventsProcessed: 8,
      },
      ['Alpha', 'Bravo', 'Charlie', 'Delta'],
      damageEvents
    );

    expect(insights.length).toBeLessThanOrEqual(2);
    expect(insights[0].kind).toBe('decisive-mistake');
  });
});
