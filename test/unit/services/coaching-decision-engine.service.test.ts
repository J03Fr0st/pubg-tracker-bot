import type {
  LogHeal,
  LogPlayerKillV2,
  LogPlayerTakeDamage,
  TelemetryEvent,
} from '@j03fr0st/pubg-ts';
import { CoachingDecisionEngineService } from '../../../src/services/coaching-decision-engine.service';
import type { PlayerAnalysis } from '../../../src/types/analytics-results.types';
import type { CoachingAnalysisInput } from '../../../src/types/coaching.types';
import type { MatchPlayerIdentity } from '../../../src/types/match.types';

const MATCH_START = new Date('2024-01-01T10:00:00.000Z');

type TestPosition = { x: number; y: number; z?: number };
type TestActor = { name: string; accountId?: string; location?: TestPosition };

function actor(name: string, accountId: string, location?: TestPosition): TestActor {
  return { name, accountId, location };
}

function at(seconds: number): string {
  return new Date(MATCH_START.getTime() + seconds * 1000).toISOString();
}

function makeDamage(
  overrides: {
    seconds?: number;
    attacker?: TestActor;
    victim?: TestActor;
    damage?: number;
    damageTypeCategory?: string;
  } = {}
): LogPlayerTakeDamage {
  return {
    _D: at(overrides.seconds ?? 1116),
    _T: 'LogPlayerTakeDamage',
    common: { isGame: 1 },
    attacker: overrides.attacker ?? actor('EnemyOne', 'account.enemy', { x: 1000, y: 0, z: 1200 }),
    victim: overrides.victim ?? actor('TestPlayer', 'account.player', { x: 0, y: 0, z: 0 }),
    damage: overrides.damage ?? 83,
    damageTypeCategory: overrides.damageTypeCategory ?? 'Damage_Gun',
    damageReason: 'TorsoShot',
    damageCauserName: 'WeapM416_C',
    damageCauserAdditionalInfo: [],
    victimWeapon: 'WeapBerylM762_C',
    victimWeaponAdditionalInfo: [],
    attackId: 1,
    distance: 1000,
    isAttackerInVehicle: false,
  } as unknown as LogPlayerTakeDamage;
}

function makeDeath(
  overrides: { seconds?: number; killer?: TestActor; victim?: TestActor } = {}
): LogPlayerKillV2 {
  return {
    _D: at(overrides.seconds ?? 1122),
    _T: 'LogPlayerKillV2',
    common: { isGame: 1 },
    killer: overrides.killer ?? actor('EnemyOne', 'account.enemy', { x: 1000, y: 0, z: 1200 }),
    victim: overrides.victim ?? actor('TestPlayer', 'account.player', { x: 100, y: 0, z: 0 }),
    assists: [],
    teamKillers: [],
    attackId: 1,
    dBNOId: 0,
    damageTypeCategory: 'Damage_Gun',
    damageReason: 'TorsoShot',
    damageCauserName: 'WeapM416_C',
    damageCauserAdditionalInfo: [],
    victimWeapon: 'WeapBerylM762_C',
    victimWeaponAdditionalInfo: [],
    distance: 900,
    isSuicide: false,
    isTeamKill: false,
    killerDamageInfo: null,
  } as unknown as LogPlayerKillV2;
}

function makeHeal(seconds: number, character = actor('TestPlayer', 'account.player')): LogHeal {
  return {
    _D: at(seconds),
    _T: 'LogHeal',
    common: { isGame: 1 },
    character,
    item: {
      itemId: 'Item_Heal_FirstAid_C',
      stackCount: 1,
      category: 'Use',
      subCategory: 'Heal',
      attachedItems: [],
    },
    healAmount: 40,
  } as unknown as LogHeal;
}

function identity(
  pubgId: string,
  name: string,
  rosterId: string | null = 'roster-1'
): MatchPlayerIdentity {
  return { pubgId, name, rosterId };
}

function makeAnalysis(
  player: MatchPlayerIdentity,
  overrides: Partial<PlayerAnalysis> = {}
): PlayerAnalysis {
  return {
    pubgId: player.pubgId,
    playerName: player.name,
    matchStartTime: MATCH_START,
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

function makeInput(
  options: {
    monitoredPlayers?: MatchPlayerIdentity[];
    analyses?: PlayerAnalysis[];
    telemetryEvents?: TelemetryEvent[];
  } = {}
): CoachingAnalysisInput {
  const monitoredPlayers = options.monitoredPlayers ?? [identity('account.player', 'TestPlayer')];
  const analyses = options.analyses ?? [
    makeAnalysis(monitoredPlayers[0], { deathEvents: [makeDeath()] }),
  ];
  return {
    matchAnalysis: {
      matchId: 'match-123',
      playerAnalyses: new Map(analyses.map((analysis) => [analysis.pubgId, analysis])),
      processingTimeMs: 1,
      totalEventsProcessed: options.telemetryEvents?.length ?? 0,
    },
    monitoredPlayers,
    telemetryEvents: options.telemetryEvents ?? [makeDamage()],
  };
}

describe('CoachingDecisionEngineService', () => {
  it('creates the current decisive claims directly from representative raw telemetry', () => {
    const player = identity('account.player', 'TestPlayer');
    const teammate = identity('account.teammate', 'TeamMate');
    const teammateDeath = makeDeath({
      seconds: 1000,
      killer: actor('OtherEnemy', 'account.other', { x: 9100, y: 0, z: 0 }),
      victim: actor('TeamMate', 'account.teammate', { x: 9000, y: 0, z: 0 }),
    });
    const blueZoneDamage = makeDamage({
      seconds: 1090,
      attacker: actor('TestPlayer', 'account.player'),
      victim: actor('TestPlayer', 'account.player', { x: 25, y: 0, z: 0 }),
      damage: 31,
      damageTypeCategory: 'Damage_BlueZone',
    });

    const insights = new CoachingDecisionEngineService().createInsights(
      makeInput({
        monitoredPlayers: [player, teammate],
        analyses: [
          makeAnalysis(player, { deathEvents: [makeDeath()] }),
          makeAnalysis(teammate, { deathEvents: [teammateDeath] }),
        ],
        telemetryEvents: [makeDamage(), blueZoneDamage],
      })
    );

    expect(insights[0]).toMatchObject({
      playerName: 'TestPlayer',
      kind: 'decisive-mistake',
      title: 'Decisive mistake',
      severity: 'high',
      confidence: 'medium',
    });
    expect(insights[0].evidence.join(' ')).toContain(
      'EnemyOne hit you for 83 damage, then 6s later you died to the same player before creating a reset'
    );
    expect(insights[0].evidence.join(' ')).toContain('appears to have been too far to trade');
    expect(insights[0].evidence.join(' ')).toContain('31 blue-zone damage');
    expect(insights[0].evidence.join(' ')).toContain('height advantage');
  });

  it('does not call an instant burst a missed reset', () => {
    const death = makeDeath({ seconds: 1116 });
    const input = makeInput({
      analyses: [makeAnalysis(identity('account.player', 'TestPlayer'), { deathEvents: [death] })],
      telemetryEvents: [makeDamage({ seconds: 1116 })],
    });

    const evidence = new CoachingDecisionEngineService()
      .createInsights(input)
      .flatMap((insight) => insight.evidence)
      .join(' ');

    expect(evidence).not.toContain('before creating a reset');
    expect(evidence).not.toContain('0s later');
  });

  it('creates pattern and fingerprint insights only from repeated raw evidence', () => {
    const player = identity('account.player', 'TestPlayer');
    const firstDeath = makeDeath({ seconds: 600 });
    const secondDeath = makeDeath({ seconds: 700 });
    const insights = new CoachingDecisionEngineService().createInsights(
      makeInput({
        analyses: [makeAnalysis(player, { deathEvents: [firstDeath, secondDeath] })],
        telemetryEvents: [makeDamage({ seconds: 594 }), makeDamage({ seconds: 694 })],
      })
    );

    expect(insights.map((insight) => insight.kind)).toEqual([
      'decisive-mistake',
      'pattern',
      'player-fingerprint',
    ]);
    expect(insights[1].evidence[0]).toContain('Repeated 2 fights');
    expect(insights[2].evidence[0]).toContain('Aggressive re-peeker');
  });

  it('uses teammate raw damage to avoid a false missed-trade claim', () => {
    const player = identity('account.player', 'TestPlayer');
    const teammate = identity('account.teammate', 'TeamMate');
    const teammateDamage = makeDamage({
      seconds: 1120,
      attacker: actor('TeamMate', 'account.teammate', { x: 500, y: 0, z: 0 }),
      victim: actor('EnemyOne', 'account.enemy', { x: 1000, y: 0, z: 1200 }),
      damage: 24,
    });

    const evidence = new CoachingDecisionEngineService()
      .createInsights(
        makeInput({
          monitoredPlayers: [player, teammate],
          analyses: [makeAnalysis(player, { deathEvents: [makeDeath()] }), makeAnalysis(teammate)],
          telemetryEvents: [makeDamage(), teammateDamage],
        })
      )
      .flatMap((insight) => insight.evidence)
      .join(' ');

    expect(evidence).not.toContain('no damage from them to EnemyOne');
  });
});

// biome-ignore lint/suspicious/noExportsInTest: Follow-up regressions reuse these telemetry builders.
export { actor, at, identity, makeAnalysis, makeDamage, makeDeath, makeHeal, makeInput };
