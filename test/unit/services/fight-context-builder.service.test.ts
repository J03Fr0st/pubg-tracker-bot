import type { LogHeal, LogItemUse, LogPlayerKillV2, LogPlayerTakeDamage } from '@j03fr0st/pubg-ts';
import { FightContextBuilderService } from '../../../src/services/fight-context-builder.service';
import type { MatchAnalysis, PlayerAnalysis } from '../../../src/types/analytics-results.types';
import type { MatchPlayerIdentity } from '../../../src/types/match.types';

const monitoredPlayer: MatchPlayerIdentity = {
  pubgId: 'account.test-player',
  name: 'TestPlayer',
  rosterId: 'roster-1',
};
const sameRosterTeammate: MatchPlayerIdentity = {
  pubgId: 'account.same-roster',
  name: 'TeamMate',
  rosterId: 'roster-1',
};
const crossRosterPlayer: MatchPlayerIdentity = {
  pubgId: 'account.cross-roster',
  name: 'CrossRoster',
  rosterId: 'roster-2',
};

function makeAnalysis(overrides: Partial<PlayerAnalysis>): PlayerAnalysis {
  return {
    pubgId: 'account.test-player',
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
    playerAnalyses: new Map(analyses.map((analysis) => [analysis.pubgId, analysis])),
    processingTimeMs: 1,
    totalEventsProcessed: 1,
  };
}

function makeDamage(overrides: Record<string, unknown>): LogPlayerTakeDamage {
  return {
    _D: '2024-01-01T10:18:36.000Z',
    _T: 'LogPlayerTakeDamage',
    attacker: {
      accountId: 'account.enemy-one',
      name: 'EnemyOne',
      location: { x: 1000, y: 0, z: 1200 },
    },
    victim: {
      accountId: 'account.test-player',
      name: 'TestPlayer',
      location: { x: 0, y: 0, z: 0 },
    },
    damage: 83,
    ...overrides,
  } as LogPlayerTakeDamage;
}

function makeDeath(overrides: Record<string, unknown>): LogPlayerKillV2 {
  return {
    _D: '2024-01-01T10:18:42.000Z',
    _T: 'LogPlayerKillV2',
    killer: {
      accountId: 'account.enemy-one',
      name: 'EnemyOne',
      location: { x: 1000, y: 0, z: 1200 },
    },
    victim: {
      accountId: 'account.test-player',
      name: 'TestPlayer',
      location: { x: 100, y: 0, z: 0 },
    },
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
      [monitoredPlayer],
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
      pubgId: 'account.same-roster',
      playerName: 'TeamMate',
      deathEvents: [
        makeDeath({
          victim: {
            accountId: 'account.same-roster',
            name: 'TeamMate',
            location: { x: 9000, y: 0, z: 0 },
          },
          killer: {
            accountId: 'account.other-enemy',
            name: 'OtherEnemy',
            location: { x: 9100, y: 0, z: 0 },
          },
        }),
      ],
    });
    const service = new FightContextBuilderService();

    const contexts = service.buildFightContexts(
      makeMatchAnalysis([makeAnalysis({ deathEvents: [death] }), teammate]),
      [monitoredPlayer, sameRosterTeammate],
      [damage]
    );

    expect(contexts[0].closestTeammateName).toBe('TeamMate');
    expect(contexts[0].closestTeammateDistanceMeters).toBeGreaterThan(60);
    expect(contexts[0].tradeRangeConfidence).toBe('medium');
  });

  it('uses recent teammate damage positions for distance, angle, and trade damage', () => {
    const damage = makeDamage({});
    const death = makeDeath({});
    const teammateDamage = makeDamage({
      _D: '2024-01-01T10:18:40.000Z',
      attacker: {
        accountId: 'account.same-roster',
        name: 'TeamMate',
        location: { x: 500, y: 0, z: 0 },
      },
      victim: {
        accountId: 'account.enemy-one',
        name: 'EnemyOne',
        location: { x: 1000, y: 0, z: 1200 },
      },
      damage: 24,
    });
    const teammate = makeAnalysis({
      pubgId: 'account.same-roster',
      playerName: 'TeamMate',
    });
    const service = new FightContextBuilderService();

    const contexts = service.buildFightContexts(
      makeMatchAnalysis([makeAnalysis({ deathEvents: [death] }), teammate]),
      [monitoredPlayer, sameRosterTeammate],
      [damage, teammateDamage]
    );

    expect(contexts[0].closestTeammateName).toBe('TeamMate');
    expect(contexts[0].closestTeammateDistanceMeters).toBe(4);
    expect(contexts[0].closestTeammateToEnemyDistanceMeters).toBe(5);
    expect(contexts[0].teammateAngleFromPlayerToEnemyDegrees).toBe(0);
    expect(contexts[0].enemyDistanceMeters).toBe(9);
    expect(contexts[0].closestTeammateDamageToEnemy[0]).toMatchObject({
      attackerName: 'TeamMate',
      victimName: 'EnemyOne',
      damage: 24,
    });
    expect(contexts[0].tradeRangeConfidence).toBe('high');
  });

  it('detects no meaningful reposition when the player barely moves after heavy damage', () => {
    const damage = makeDamage({
      victim: {
        accountId: 'account.test-player',
        name: 'TestPlayer',
        location: { x: 0, y: 0, z: 0 },
      },
    });
    const death = makeDeath({
      victim: {
        accountId: 'account.test-player',
        name: 'TestPlayer',
        location: { x: 100, y: 0, z: 0 },
      },
    });
    const service = new FightContextBuilderService();

    const contexts = service.buildFightContexts(
      makeMatchAnalysis([makeAnalysis({ deathEvents: [death] })]),
      [monitoredPlayer],
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
      [monitoredPlayer],
      [damage]
    );

    expect(contexts[0].heightDeltaMeters).toBeGreaterThan(10);
    expect(contexts[0].heightConfidence).toBe('medium');
  });

  it('omits geometry confidence when position data is missing', () => {
    const damage = makeDamage({
      attacker: { accountId: 'account.enemy-one', name: 'EnemyOne' },
      victim: { accountId: 'account.test-player', name: 'TestPlayer' },
    });
    const death = makeDeath({
      killer: { accountId: 'account.enemy-one', name: 'EnemyOne' },
      victim: { accountId: 'account.test-player', name: 'TestPlayer' },
    });
    const service = new FightContextBuilderService();

    const contexts = service.buildFightContexts(
      makeMatchAnalysis([makeAnalysis({ deathEvents: [death] })]),
      [monitoredPlayer],
      [damage]
    );

    expect(contexts[0].closestTeammateDistanceMeters).toBeUndefined();
    expect(contexts[0].repositionDistanceMeters).toBeUndefined();
    expect(contexts[0].heightDeltaMeters).toBeUndefined();
    expect(contexts[0].heightConfidence).toBe('low');
  });

  it('adds decisive event source, recent reset events, and blue-zone damage evidence', () => {
    const gunDamage = makeDamage({
      _D: '2024-01-01T10:18:20.000Z',
      damage: 67,
      damageCauserName: 'WeapHK416_C',
      damageTypeCategory: 'Damage_Gun',
      damageReason: 'TorsoShot',
    });
    const blueZoneDamage = makeDamage({
      _D: '2024-01-01T10:18:10.000Z',
      attacker: { accountId: 'account.test-player', name: 'TestPlayer' },
      victim: {
        accountId: 'account.test-player',
        name: 'TestPlayer',
        location: { x: 25, y: 0, z: 0 },
      },
      damage: 31,
      damageCauserName: 'TslGameModeBase_BattleRoyaleBP_C',
      damageTypeCategory: 'Damage_BlueZone',
      damageReason: 'NonSpecific',
    });
    const heal = {
      _D: '2024-01-01T10:18:30.000Z',
      _T: 'LogHeal',
      character: { accountId: 'account.test-player', name: 'TestPlayer' },
      item: { itemId: 'Item_Heal_FirstAid_C' },
      healAmount: 40,
    } as LogHeal;
    const itemUse = {
      _D: '2024-01-01T10:18:34.000Z',
      _T: 'LogItemUse',
      character: { accountId: 'account.test-player', name: 'TestPlayer' },
      item: { itemId: 'Item_Boost_EnergyDrink_C' },
    } as LogItemUse;
    const death = makeDeath({
      killer: {
        accountId: 'account.enemy-one',
        name: 'EnemyOne',
        location: { x: 1000, y: 0, z: 1200 },
      },
      finisher: {
        accountId: 'account.enemy-one',
        name: 'EnemyOne',
        location: { x: 1000, y: 0, z: 1200 },
      },
      finishDamageInfo: {
        damageCauserName: 'WeapHK416_C',
        damageTypeCategory: 'Damage_Gun',
        damageReason: 'TorsoShot',
      },
    });
    const service = new FightContextBuilderService();

    const contexts = service.buildFightContexts(
      makeMatchAnalysis([makeAnalysis({ deathEvents: [death] })]),
      [monitoredPlayer],
      [gunDamage, blueZoneDamage],
      [heal, itemUse]
    );

    expect(contexts[0]).toMatchObject({
      decisiveWeapon: 'WeapHK416_C',
      decisiveDamageTypeCategory: 'Damage_Gun',
      decisiveDamageReason: 'TorsoShot',
      killerName: 'EnemyOne',
      finisherName: 'EnemyOne',
    });
    expect(contexts[0].resetEvents).toEqual([
      expect.objectContaining({
        itemId: 'Item_Heal_FirstAid_C',
        healAmount: 40,
      }),
      expect.objectContaining({
        itemId: 'Item_Boost_EnergyDrink_C',
      }),
    ]);
    expect(contexts[0].blueZoneDamage).toMatchObject({
      damage: 31,
      windowSeconds: 60,
    });
    expect(contexts[0].blueZoneDamage.events[0]).toMatchObject({
      damage: 31,
      attackerName: 'TestPlayer',
      victimName: 'TestPlayer',
    });
  });

  it('uses a different monitored account on the same non-null roster as teammate evidence', () => {
    const death = makeDeath({});
    const teammateDamage = makeDamage({
      _D: '2024-01-01T10:18:40.000Z',
      attacker: {
        accountId: 'account.same-roster',
        name: 'TeamMate',
        location: { x: 500, y: 0, z: 0 },
      },
      victim: {
        accountId: 'account.enemy-one',
        name: 'EnemyOne',
        location: { x: 1000, y: 0, z: 1200 },
      },
      damage: 24,
    });
    const service = new FightContextBuilderService();

    const contexts = service.buildFightContexts(
      makeMatchAnalysis([
        makeAnalysis({ pubgId: 'account.test-player', deathEvents: [death] }),
        makeAnalysis({ pubgId: 'account.same-roster', playerName: 'TeamMate' }),
      ]),
      [monitoredPlayer, sameRosterTeammate],
      [makeDamage({}), teammateDamage]
    );

    expect(contexts[0].closestTeammateName).toBe('TeamMate');
    expect(contexts[0].closestTeammateDistanceMeters).toBe(4);
    expect(contexts[0].closestTeammateDamageToEnemy).toEqual([
      expect.objectContaining({
        attackerName: 'TeamMate',
        victimName: 'EnemyOne',
        damage: 24,
      }),
    ]);
  });

  it('excludes a monitored player on another roster from teammate evidence', () => {
    const death = makeDeath({});
    const crossRosterDamage = makeDamage({
      _D: '2024-01-01T10:18:40.000Z',
      attacker: {
        accountId: 'account.cross-roster',
        name: 'CrossRoster',
        location: { x: 500, y: 0, z: 0 },
      },
      victim: {
        accountId: 'account.enemy-one',
        name: 'EnemyOne',
        location: { x: 1000, y: 0, z: 1200 },
      },
      damage: 50,
    });
    const service = new FightContextBuilderService();

    const contexts = service.buildFightContexts(
      makeMatchAnalysis([
        makeAnalysis({ pubgId: 'account.test-player', deathEvents: [death] }),
        makeAnalysis({ pubgId: 'account.cross-roster', playerName: 'CrossRoster' }),
      ]),
      [monitoredPlayer, crossRosterPlayer],
      [makeDamage({}), crossRosterDamage]
    );

    expect(contexts[0].closestTeammateName).toBeUndefined();
    expect(contexts[0].closestTeammateDistanceMeters).toBeUndefined();
    expect(contexts[0].closestTeammateDamageToEnemy).toEqual([]);
    expect(contexts[0].tradeRangeConfidence).toBe('low');
  });

  it('does not infer teammates when both monitored roster IDs are null', () => {
    const unrosteredPlayer = { ...monitoredPlayer, rosterId: null };
    const unrosteredOther = { ...sameRosterTeammate, rosterId: null };
    const service = new FightContextBuilderService();

    const contexts = service.buildFightContexts(
      makeMatchAnalysis([
        makeAnalysis({ pubgId: 'account.test-player', deathEvents: [makeDeath({})] }),
        makeAnalysis({ pubgId: 'account.same-roster', playerName: 'TeamMate' }),
      ]),
      [unrosteredPlayer, unrosteredOther],
      [makeDamage({})]
    );

    expect(contexts[0].closestTeammateName).toBeUndefined();
  });

  it('uses account identity for analysis and combat evidence when display names are stale', () => {
    const currentIdentity = { ...monitoredPlayer, name: 'CurrentPlayerName' };
    const death = makeDeath({
      killer: {
        accountId: 'account.decisive-enemy',
        name: 'DecisiveEnemyDisplay',
        location: { x: 1000, y: 0, z: 0 },
      },
      victim: {
        accountId: 'account.test-player',
        name: 'TelemetryPlayerName',
        location: { x: 100, y: 0, z: 0 },
      },
    });
    const accountMatchedDamageTaken = makeDamage({
      attacker: { accountId: 'account.prior-enemy', name: 'PriorEnemyDisplay' },
      victim: { accountId: 'account.test-player', name: 'StalePlayerName' },
      damage: 31,
    });
    const nameMatchedWrongVictim = makeDamage({
      attacker: { accountId: 'account.decoy-enemy', name: 'DecoyEnemyDisplay' },
      victim: { accountId: 'account.other-player', name: 'CurrentPlayerName' },
      damage: 99,
    });
    const accountMatchedDamageDealt = makeDamage({
      attacker: { accountId: 'account.test-player', name: 'StalePlayerName' },
      victim: { accountId: 'account.target', name: 'TargetDisplay' },
      damage: 17,
    });
    const nameMatchedWrongAttacker = makeDamage({
      attacker: { accountId: 'account.other-player', name: 'CurrentPlayerName' },
      victim: { accountId: 'account.other-target', name: 'OtherTargetDisplay' },
      damage: 88,
    });
    const service = new FightContextBuilderService();

    const contexts = service.buildFightContexts(
      makeMatchAnalysis([
        makeAnalysis({
          pubgId: 'account.test-player',
          playerName: 'AnalysisPlayerDisplay',
          deathEvents: [death],
        }),
      ]),
      [currentIdentity],
      [
        accountMatchedDamageTaken,
        nameMatchedWrongVictim,
        accountMatchedDamageDealt,
        nameMatchedWrongAttacker,
      ]
    );

    expect(contexts).toHaveLength(1);
    expect(contexts[0].playerName).toBe('AnalysisPlayerDisplay');
    expect(contexts[0].enemyName).toBe('DecisiveEnemyDisplay');
    expect(contexts[0].damageTaken).toEqual([
      expect.objectContaining({
        attackerName: 'PriorEnemyDisplay',
        victimName: 'StalePlayerName',
        damage: 31,
      }),
    ]);
    expect(contexts[0].damageDealt).toEqual([
      expect.objectContaining({
        attackerName: 'StalePlayerName',
        victimName: 'TargetDisplay',
        damage: 17,
      }),
    ]);
  });

  it('uses account identity for reset events when display names are stale or duplicated', () => {
    const currentIdentity = { ...monitoredPlayer, name: 'CurrentPlayerName' };
    const accountMatchedReset = {
      _D: '2024-01-01T10:18:30.000Z',
      _T: 'LogHeal',
      character: { accountId: 'account.test-player', name: 'StalePlayerName' },
      item: { itemId: 'Item_Heal_FirstAid_C' },
      healAmount: 40,
    } as LogHeal;
    const nameMatchedDecoyReset = {
      _D: '2024-01-01T10:18:31.000Z',
      _T: 'LogItemUse',
      character: { accountId: 'account.other-player', name: 'CurrentPlayerName' },
      item: { itemId: 'Item_Heal_MedKit_C' },
    } as LogItemUse;
    const service = new FightContextBuilderService();

    const contexts = service.buildFightContexts(
      makeMatchAnalysis([
        makeAnalysis({
          pubgId: 'account.test-player',
          playerName: 'AnalysisPlayerDisplay',
          deathEvents: [makeDeath({})],
        }),
      ]),
      [currentIdentity],
      [],
      [accountMatchedReset, nameMatchedDecoyReset]
    );

    expect(contexts[0].resetEvents).toEqual([
      expect.objectContaining({
        itemId: 'Item_Heal_FirstAid_C',
        healAmount: 40,
      }),
    ]);
  });

  it('uses account identity for blue-zone damage when display names are stale or duplicated', () => {
    const currentIdentity = { ...monitoredPlayer, name: 'CurrentPlayerName' };
    const accountMatchedBlueZoneDamage = makeDamage({
      _D: '2024-01-01T10:18:20.000Z',
      attacker: { accountId: 'account.test-player', name: 'StalePlayerName' },
      victim: { accountId: 'account.test-player', name: 'StalePlayerName' },
      damage: 13,
      damageTypeCategory: 'Damage_BlueZone',
    });
    const nameMatchedDecoyBlueZoneDamage = makeDamage({
      _D: '2024-01-01T10:18:21.000Z',
      attacker: { accountId: 'account.other-player', name: 'CurrentPlayerName' },
      victim: { accountId: 'account.other-player', name: 'CurrentPlayerName' },
      damage: 87,
      damageTypeCategory: 'Damage_BlueZone',
    });
    const service = new FightContextBuilderService();

    const contexts = service.buildFightContexts(
      makeMatchAnalysis([
        makeAnalysis({
          pubgId: 'account.test-player',
          playerName: 'AnalysisPlayerDisplay',
          deathEvents: [makeDeath({})],
        }),
      ]),
      [currentIdentity],
      [accountMatchedBlueZoneDamage, nameMatchedDecoyBlueZoneDamage]
    );

    expect(contexts[0].blueZoneDamage).toMatchObject({
      damage: 13,
      events: [
        expect.objectContaining({
          attackerName: 'StalePlayerName',
          victimName: 'StalePlayerName',
          damage: 13,
        }),
      ],
    });
  });

  it('does not merge repeated-enemy evidence for accounts sharing a display name', () => {
    const duplicateEnemyName = 'DuplicateEnemyDisplay';
    const death = makeDeath({
      killer: {
        accountId: 'account.decisive-enemy',
        name: duplicateEnemyName,
        location: { x: 1000, y: 0, z: 0 },
      },
    });
    const lookalikeEnemyDamage = makeDamage({
      attacker: {
        accountId: 'account.lookalike-enemy',
        name: duplicateEnemyName,
      },
      victim: {
        accountId: 'account.test-player',
        name: 'TelemetryPlayerName',
      },
      damage: 42,
    });
    const service = new FightContextBuilderService();

    const contexts = service.buildFightContexts(
      makeMatchAnalysis([makeAnalysis({ deathEvents: [death] })]),
      [monitoredPlayer],
      [lookalikeEnemyDamage]
    );

    expect(contexts[0].enemyName).toBe(duplicateEnemyName);
    expect(contexts[0].damageTaken[0].attackerName).toBe(duplicateEnemyName);
    expect(contexts[0].repeatedSameEnemy).toBe(false);
  });

  it('resolves same-roster teammate evidence by account when telemetry names are stale', () => {
    const currentTeammate = { ...sameRosterTeammate, name: 'CurrentTeammateName' };
    const death = makeDeath({
      killer: {
        accountId: 'account.enemy-one',
        name: 'CurrentEnemyName',
        location: { x: 1000, y: 0, z: 1200 },
      },
    });
    const accountMatchedTeammateDamage = makeDamage({
      _D: '2024-01-01T10:18:40.000Z',
      attacker: {
        accountId: 'account.same-roster',
        name: 'FormerTeammateName',
        location: { x: 500, y: 0, z: 0 },
      },
      victim: {
        accountId: 'account.enemy-one',
        name: 'FormerEnemyName',
        location: { x: 1000, y: 0, z: 1200 },
      },
      damage: 24,
    });
    const nameMatchedWrongTeammate = makeDamage({
      _D: '2024-01-01T10:18:41.000Z',
      attacker: {
        accountId: 'account.teammate-decoy',
        name: 'CurrentTeammateName',
        location: { x: 9000, y: 0, z: 0 },
      },
      victim: {
        accountId: 'account.enemy-one',
        name: 'CurrentEnemyName',
        location: { x: 1000, y: 0, z: 1200 },
      },
      damage: 99,
    });
    const service = new FightContextBuilderService();

    const contexts = service.buildFightContexts(
      makeMatchAnalysis([
        makeAnalysis({ pubgId: 'account.test-player', deathEvents: [death] }),
        makeAnalysis({
          pubgId: 'account.same-roster',
          playerName: 'AnalysisTeammateName',
        }),
      ]),
      [monitoredPlayer, currentTeammate],
      [makeDamage({}), accountMatchedTeammateDamage, nameMatchedWrongTeammate]
    );

    expect(contexts[0].closestTeammateName).toBe('CurrentTeammateName');
    expect(contexts[0].closestTeammateDistanceMeters).toBe(4);
    expect(contexts[0].closestTeammateDamageToEnemy).toEqual([
      expect.objectContaining({
        attackerName: 'FormerTeammateName',
        victimName: 'FormerEnemyName',
        damage: 24,
      }),
    ]);
  });
});
