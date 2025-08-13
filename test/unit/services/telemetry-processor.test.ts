import { TelemetryProcessorService } from '../../../src/services/telemetry-processor.service';
import {
  LogPlayerKillV2,
  LogPlayerMakeGroggy,
  LogPlayerTakeDamage,
  LogPlayerAttack,
  LogPlayerRevive,
  LogWeaponFireCount,
  TelemetryEvent,
} from '@j03fr0st/pubg-ts';

describe('TelemetryProcessorService', () => {
  let telemetryProcessor: TelemetryProcessorService;

  beforeEach(() => {
    telemetryProcessor = new TelemetryProcessorService();
  });

  describe('processMatchTelemetry', () => {
    it('should process basic telemetry data successfully', async () => {
      const mockKillEvent = {
        _D: '2024-01-01T10:00:00.000Z',
        _T: 'LogPlayerKillV2',
        killer: { name: 'TestPlayer1' },
        victim: { name: 'EnemyPlayer1' },
        damageCauserName: 'WeapAK47_C',
        distance: 15000, // 150m in cm
        damageReason: 'HeadShot',
      } as LogPlayerKillV2;

      const mockDamageEvent = {
        _D: '2024-01-01T09:59:55.000Z',
        _T: 'LogPlayerTakeDamage',
        attacker: { name: 'TestPlayer1' },
        victim: { name: 'EnemyPlayer1' },
        damageCauserName: 'WeapAK47_C',
        damage: 50,
      } as LogPlayerTakeDamage;

      const telemetryData: TelemetryEvent[] = [mockKillEvent, mockDamageEvent];
      const matchStartTime = new Date('2024-01-01T09:30:00.000Z');
      const trackedPlayers = ['TestPlayer1'];

      const result = await telemetryProcessor.processMatchTelemetry(
        telemetryData,
        'test-match-123',
        matchStartTime,
        trackedPlayers
      );

      expect(result.matchId).toBe('test-match-123');
      expect(result.playerAnalyses.size).toBe(1);
      expect(result.totalEventsProcessed).toBe(2);
      expect(result.processingTimeMs).toBeGreaterThanOrEqual(0);

      const playerAnalysis = result.playerAnalyses.get('TestPlayer1');
      expect(playerAnalysis).toBeDefined();
      expect(playerAnalysis!.killEvents).toHaveLength(1);
      expect(playerAnalysis!.damageEvents).toHaveLength(1);
      expect(playerAnalysis!.deathEvents).toHaveLength(0); // No deaths in test data
      expect(playerAnalysis!.knockedDownEvents).toHaveLength(0); // No knockdowns in test data
      expect(playerAnalysis!.totalDamageDealt).toBe(50);
      expect(playerAnalysis!.avgKillDistance).toBe(150); // 15000cm / 100
    });

    it('should handle empty telemetry data', async () => {
      const result = await telemetryProcessor.processMatchTelemetry([], 'empty-match', new Date(), [
        'TestPlayer1',
      ]);

      expect(result.matchId).toBe('empty-match');
      expect(result.playerAnalyses.size).toBe(1);
      expect(result.totalEventsProcessed).toBe(0);

      const playerAnalysis = result.playerAnalyses.get('TestPlayer1');
      expect(playerAnalysis!.killEvents).toHaveLength(0);
      expect(playerAnalysis!.weaponStats).toHaveLength(0);
      expect(playerAnalysis!.killChains).toHaveLength(0);
    });

    it('should filter events by tracked players only', async () => {
      const mockKillEvent = {
        _D: '2024-01-01T10:00:00.000Z',
        _T: 'LogPlayerKillV2',
        killer: { name: 'UntrackedPlayer' },
        victim: { name: 'TestPlayer1' },
        damageCauserName: 'WeapM416_C',
        distance: 10000,
        damageReason: 'NonSpecific',
      } as LogPlayerKillV2;

      const result = await telemetryProcessor.processMatchTelemetry(
        [mockKillEvent],
        'filtered-match',
        new Date(),
        ['TestPlayer1'] // Only tracking TestPlayer1, not UntrackedPlayer
      );

      const playerAnalysis = result.playerAnalyses.get('TestPlayer1');
      expect(playerAnalysis!.killEvents).toHaveLength(0); // No kills by TestPlayer1
      expect(playerAnalysis!.totalDamageDealt).toBe(0);
    });
  });

  describe('weapon statistics calculation', () => {
    it('should calculate weapon stats from multiple event types', async () => {
      const killEvent = {
        _D: '2024-01-01T10:00:00.000Z',
        _T: 'LogPlayerKillV2',
        killer: { name: 'TestPlayer1' },
        victim: { name: 'Enemy1' },
        damageCauserName: 'WeapAK47_C',
        distance: 20000, // 200m
      } as LogPlayerKillV2;

      const knockdownEvent = {
        _D: '2024-01-01T10:00:05.000Z',
        _T: 'LogPlayerMakeGroggy',
        attacker: { name: 'TestPlayer1' },
        victim: { name: 'Enemy2' },
        damageCauserName: 'WeapAK47_C',
        distance: 15000, // 150m
      } as LogPlayerMakeGroggy;

      const damageEvent = {
        _D: '2024-01-01T10:00:03.000Z',
        _T: 'LogPlayerTakeDamage',
        attacker: { name: 'TestPlayer1' },
        victim: { name: 'Enemy1' },
        damageCauserName: 'WeapAK47_C',
        damage: 75,
      } as LogPlayerTakeDamage;

      const fireCountEvent = {
        _D: '2024-01-01T10:00:01.000Z',
        _T: 'LogWeaponFireCount',
        character: { name: 'TestPlayer1' },
        weaponId: 'WeapAK47_C',
        fireCount: 10,
      } as LogWeaponFireCount;

      const result = await telemetryProcessor.processMatchTelemetry(
        [killEvent, knockdownEvent, damageEvent, fireCountEvent],
        'weapon-stats-match',
        new Date(),
        ['TestPlayer1']
      );

      const playerAnalysis = result.playerAnalyses.get('TestPlayer1');
      expect(playerAnalysis!.weaponStats).toHaveLength(1);

      const ak47Stats = playerAnalysis!.weaponStats[0];
      expect(ak47Stats.weaponName).toBe('AKM'); // Should be readable name from DAMAGE_CAUSER_NAME
      expect(ak47Stats.kills).toBe(1);
      expect(ak47Stats.knockdowns).toBe(1);
      expect(ak47Stats.damageDealt).toBe(75);
      expect(ak47Stats.shotsFired).toBe(10);
      expect(ak47Stats.hits).toBe(1);
      expect(ak47Stats.longestKill).toBe(200); // 20000cm / 100
      expect(ak47Stats.accuracy).toBe(10); // 1 hit / 10 shots * 100
      expect(ak47Stats.efficiency).toBe(10); // 1 kill / 10 shots * 100
    });
  });

  describe('kill chain analysis', () => {
    it('should identify kill chains within time window', async () => {
      const kill1 = {
        _D: '2024-01-01T10:00:00.000Z',
        _T: 'LogPlayerKillV2',
        killer: { name: 'TestPlayer1' },
        victim: { name: 'Enemy1' },
        damageCauserName: 'WeapM416_C',
        distance: 10000,
      } as LogPlayerKillV2;

      const kill2 = {
        _D: '2024-01-01T10:00:15.000Z', // 15 seconds later
        _T: 'LogPlayerKillV2',
        killer: { name: 'TestPlayer1' },
        victim: { name: 'Enemy2' },
        damageCauserName: 'WeapM416_C',
        distance: 12000,
      } as LogPlayerKillV2;

      const kill3 = {
        _D: '2024-01-01T10:00:25.000Z', // 10 seconds after kill2
        _T: 'LogPlayerKillV2',
        killer: { name: 'TestPlayer1' },
        victim: { name: 'Enemy3' },
        damageCauserName: 'WeapAK47_C',
        distance: 8000,
      } as LogPlayerKillV2;

      const result = await telemetryProcessor.processMatchTelemetry(
        [kill1, kill2, kill3],
        'kill-chain-match',
        new Date(),
        ['TestPlayer1']
      );

      const playerAnalysis = result.playerAnalyses.get('TestPlayer1');
      expect(playerAnalysis!.killChains).toHaveLength(1);

      const killChain = playerAnalysis!.killChains[0];
      expect(killChain.kills).toHaveLength(3);
      expect(killChain.duration).toBe(25); // 25 seconds
      expect(killChain.weaponsUsed).toEqual(['M416', 'AKM']);
    });

    it('should break chains when time window exceeded', async () => {
      const kill1 = {
        _D: '2024-01-01T10:00:00.000Z',
        _T: 'LogPlayerKillV2',
        killer: { name: 'TestPlayer1' },
        victim: { name: 'Enemy1' },
        damageCauserName: 'WeapM416_C',
        distance: 10000,
      } as LogPlayerKillV2;

      const kill2 = {
        _D: '2024-01-01T10:00:35.000Z', // 35 seconds later (exceeds 30s window)
        _T: 'LogPlayerKillV2',
        killer: { name: 'TestPlayer1' },
        victim: { name: 'Enemy2' },
        damageCauserName: 'WeapM416_C',
        distance: 12000,
      } as LogPlayerKillV2;

      const result = await telemetryProcessor.processMatchTelemetry(
        [kill1, kill2],
        'broken-chain-match',
        new Date(),
        ['TestPlayer1']
      );

      const playerAnalysis = result.playerAnalyses.get('TestPlayer1');
      expect(playerAnalysis!.killChains).toHaveLength(0); // No chains with 2+ kills
    });
  });

  describe('assist calculation', () => {
    it('should calculate damage-based assists', async () => {
      const damageEvent = {
        _D: '2024-01-01T10:00:00.000Z',
        _T: 'LogPlayerTakeDamage',
        attacker: { name: 'TestPlayer1' },
        victim: { name: 'Enemy1' },
        damageCauserName: 'WeapM416_C',
        damage: 50,
      } as LogPlayerTakeDamage;

      const killEvent = {
        _D: '2024-01-01T10:00:08.000Z', // 8 seconds later (within 10s window)
        _T: 'LogPlayerKillV2',
        killer: { name: 'Teammate1' },
        victim: { name: 'Enemy1' },
        damageCauserName: 'WeapAK47_C',
        distance: 15000,
      } as LogPlayerKillV2;

      const result = await telemetryProcessor.processMatchTelemetry(
        [damageEvent, killEvent],
        'assist-match',
        new Date(),
        ['TestPlayer1']
      );

      const playerAnalysis = result.playerAnalyses.get('TestPlayer1');
      expect(playerAnalysis!.calculatedAssists).toHaveLength(1);

      const assist = playerAnalysis!.calculatedAssists[0];
      expect(assist.assistingPlayer).toBe('TestPlayer1');
      expect(assist.killedPlayer).toBe('Enemy1');
      expect(assist.damageDealt).toBe(50);
      expect(assist.assistType).toBe('damage');
      expect(assist.weapon).toBe('M416');
    });

    it('should calculate knockdown-based assists', async () => {
      const knockdownEvent = {
        _D: '2024-01-01T10:00:00.000Z',
        _T: 'LogPlayerMakeGroggy',
        attacker: { name: 'TestPlayer1' },
        victim: { name: 'Enemy1' },
        damageCauserName: 'WeapSCAR_C',
        distance: 12000,
      } as LogPlayerMakeGroggy;

      const killEvent = {
        _D: '2024-01-01T10:00:05.000Z', // 5 seconds later
        _T: 'LogPlayerKillV2',
        killer: { name: 'Teammate1' },
        victim: { name: 'Enemy1' },
        damageCauserName: 'WeapAK47_C',
        distance: 15000,
      } as LogPlayerKillV2;

      const result = await telemetryProcessor.processMatchTelemetry(
        [knockdownEvent, killEvent],
        'knockdown-assist-match',
        new Date(),
        ['TestPlayer1']
      );

      const playerAnalysis = result.playerAnalyses.get('TestPlayer1');
      expect(playerAnalysis!.calculatedAssists).toHaveLength(1);

      const assist = playerAnalysis!.calculatedAssists[0];
      expect(assist.assistType).toBe('knockdown');
      expect(assist.weapon).toBe('SCAR');
    });

    it('should not count assists outside time window', async () => {
      const damageEvent = {
        _D: '2024-01-01T10:00:00.000Z',
        _T: 'LogPlayerTakeDamage',
        attacker: { name: 'TestPlayer1' },
        victim: { name: 'Enemy1' },
        damageCauserName: 'WeapM416_C',
        damage: 50,
      } as LogPlayerTakeDamage;

      const killEvent = {
        _D: '2024-01-01T10:00:15.000Z', // 15 seconds later (exceeds 10s window)
        _T: 'LogPlayerKillV2',
        killer: { name: 'Teammate1' },
        victim: { name: 'Enemy1' },
        damageCauserName: 'WeapAK47_C',
        distance: 15000,
      } as LogPlayerKillV2;

      const result = await telemetryProcessor.processMatchTelemetry(
        [damageEvent, killEvent],
        'no-assist-match',
        new Date(),
        ['TestPlayer1']
      );

      const playerAnalysis = result.playerAnalyses.get('TestPlayer1');
      expect(playerAnalysis!.calculatedAssists).toHaveLength(0);
    });

    it('should not count assists below damage threshold', async () => {
      const damageEvent = {
        _D: '2024-01-01T10:00:00.000Z',
        _T: 'LogPlayerTakeDamage',
        attacker: { name: 'TestPlayer1' },
        victim: { name: 'Enemy1' },
        damageCauserName: 'WeapM416_C',
        damage: 15, // Below 20 damage threshold
      } as LogPlayerTakeDamage;

      const killEvent = {
        _D: '2024-01-01T10:00:05.000Z',
        _T: 'LogPlayerKillV2',
        killer: { name: 'Teammate1' },
        victim: { name: 'Enemy1' },
        damageCauserName: 'WeapAK47_C',
        distance: 15000,
      } as LogPlayerKillV2;

      const result = await telemetryProcessor.processMatchTelemetry(
        [damageEvent, killEvent],
        'low-damage-match',
        new Date(),
        ['TestPlayer1']
      );

      const playerAnalysis = result.playerAnalyses.get('TestPlayer1');
      expect(playerAnalysis!.calculatedAssists).toHaveLength(0);
    });
  });

  describe('statistical calculations', () => {
    it('should calculate K/D ratio correctly', async () => {
      const killEvent = {
        _D: '2024-01-01T10:00:00.000Z',
        _T: 'LogPlayerKillV2',
        killer: { name: 'TestPlayer1' },
        victim: { name: 'Enemy1' },
        damageCauserName: 'WeapAK47_C',
        distance: 15000,
      } as LogPlayerKillV2;

      const deathEvent = {
        _D: '2024-01-01T10:00:30.000Z',
        _T: 'LogPlayerKillV2',
        killer: { name: 'Enemy2' },
        victim: { name: 'TestPlayer1' },
        damageCauserName: 'WeapM416_C',
        distance: 12000,
      } as LogPlayerKillV2;

      const result = await telemetryProcessor.processMatchTelemetry(
        [killEvent, deathEvent],
        'kd-match',
        new Date(),
        ['TestPlayer1']
      );

      const playerAnalysis = result.playerAnalyses.get('TestPlayer1');
      expect(playerAnalysis!.kdRatio).toBe(1.0); // 1 kill, 1 death = 1.0 K/D
    });

    it('should calculate headshot percentage', async () => {
      const headshotKill = {
        _D: '2024-01-01T10:00:00.000Z',
        _T: 'LogPlayerKillV2',
        killer: { name: 'TestPlayer1' },
        victim: { name: 'Enemy1' },
        damageCauserName: 'WeapAK47_C',
        damageReason: 'HeadShot',
        distance: 15000,
      } as LogPlayerKillV2;

      const bodyKill = {
        _D: '2024-01-01T10:00:15.000Z',
        _T: 'LogPlayerKillV2',
        killer: { name: 'TestPlayer1' },
        victim: { name: 'Enemy2' },
        damageCauserName: 'WeapAK47_C',
        damageReason: 'NonSpecific',
        distance: 12000,
      } as LogPlayerKillV2;

      const result = await telemetryProcessor.processMatchTelemetry(
        [headshotKill, bodyKill],
        'headshot-match',
        new Date(),
        ['TestPlayer1']
      );

      const playerAnalysis = result.playerAnalyses.get('TestPlayer1');
      expect(playerAnalysis!.headshotPercentage).toBe(50); // 1 out of 2 kills = 50%
    });
  });

  describe('edge cases', () => {
    it('should handle player with no events', async () => {
      const result = await telemetryProcessor.processMatchTelemetry(
        [],
        'empty-player-match',
        new Date(),
        ['SilentPlayer']
      );

      const playerAnalysis = result.playerAnalyses.get('SilentPlayer');
      expect(playerAnalysis).toBeDefined();
      expect(playerAnalysis!.killEvents).toHaveLength(0);
      expect(playerAnalysis!.weaponStats).toHaveLength(0);
      expect(playerAnalysis!.calculatedAssists).toHaveLength(0);
      expect(playerAnalysis!.totalDamageDealt).toBe(0);
      expect(playerAnalysis!.kdRatio).toBe(0);
    });

    it('should handle multiple tracked players', async () => {
      const killEvent1 = {
        _D: '2024-01-01T10:00:00.000Z',
        _T: 'LogPlayerKillV2',
        killer: { name: 'Player1' },
        victim: { name: 'Enemy1' },
        damageCauserName: 'WeapAK47_C',
        distance: 15000,
      } as LogPlayerKillV2;

      const killEvent2 = {
        _D: '2024-01-01T10:00:05.000Z',
        _T: 'LogPlayerKillV2',
        killer: { name: 'Player2' },
        victim: { name: 'Enemy2' },
        damageCauserName: 'WeapM416_C',
        distance: 12000,
      } as LogPlayerKillV2;

      const result = await telemetryProcessor.processMatchTelemetry(
        [killEvent1, killEvent2],
        'multi-player-match',
        new Date(),
        ['Player1', 'Player2']
      );

      expect(result.playerAnalyses.size).toBe(2);

      const player1Analysis = result.playerAnalyses.get('Player1');
      const player2Analysis = result.playerAnalyses.get('Player2');

      expect(player1Analysis!.killEvents).toHaveLength(1);
      expect(player2Analysis!.killEvents).toHaveLength(1);
      expect(player1Analysis!.avgKillDistance).toBe(150);
      expect(player2Analysis!.avgKillDistance).toBe(120);
    });
  });
});
