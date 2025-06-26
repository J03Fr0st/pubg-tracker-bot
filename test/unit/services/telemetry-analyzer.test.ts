import { TelemetryAnalyzerService } from '../../../src/services/telemetry-analyzer.service';
import { CoachingTipsService } from '../../../src/services/coaching-tips.service';
import { TelemetryAnalysisResult } from '../../../src/types/pubg-telemetry.types';

describe('TelemetryAnalyzerService', () => {
  let telemetryAnalyzer: TelemetryAnalyzerService;
  let coachingTipsService: CoachingTipsService;

  beforeEach(() => {
    telemetryAnalyzer = new TelemetryAnalyzerService();
    coachingTipsService = new CoachingTipsService();
  });

  describe('analyzeTelemetryData', () => {
    it('should return comprehensive analysis for valid telemetry data', async () => {
      const mockTelemetryUrl = 'https://telemetry-cdn.pubg.com/bluehole-pubg/pc-2021/01/01/0/0/sample.json';
      const teamPlayers = ['TestPlayer1', 'TestPlayer2', 'TestPlayer3', 'TestPlayer4'];
      const matchId = 'test-match-123';
      const teamRank = 15;

      // Mock axios to return sample telemetry data
      const mockTelemetryData = [
        {
          _D: '2024-01-01T10:00:00.000Z',
          _T: 'LogPlayerKillV2',
          killer: { name: 'TestPlayer1', location: { x: 100, y: 100, z: 0 } },
          victim: { name: 'EnemyPlayer1', location: { x: 150, y: 150, z: 0 } },
          killerDamageInfo: { damageCauserName: 'WeapM416_C', distance: 75 }
        },
        {
          _D: '2024-01-01T10:05:00.000Z',
          _T: 'LogPlayerTakeDamage',
          victim: { name: 'TestPlayer2' },
          damageReason: 'BluezoneFinish',
          damage: 25
        },
        {
          _D: '2024-01-01T10:10:00.000Z',
          _T: 'LogZoneUpdate',
          zoneState: 1,
          safetyZonePosition: { x: 200, y: 200, z: 0 },
          safetyZoneRadius: 500
        }
      ];

      // Mock the fetchTelemetryData method
      jest.spyOn(telemetryAnalyzer as any, 'fetchTelemetryData').mockResolvedValue(mockTelemetryData);

      const result = await telemetryAnalyzer.analyzeTelemetryData(
        mockTelemetryUrl,
        teamPlayers,
        matchId,
        teamRank
      );

      expect(result).toMatchObject({
        matchId,
        teamPlayers,
        teamRank,
        analysisTimestamp: expect.any(String),
        criticalMistakes: expect.any(Array),
        strategicRecommendations: expect.any(Array),
        engagementAnalysis: expect.objectContaining({
          totalEngagements: expect.any(Number),
          wonEngagements: expect.any(Number),
          lostEngagements: expect.any(Number)
        }),
        positioningAnalysis: expect.objectContaining({
          zoneManagement: expect.any(Object),
          rotationEfficiency: expect.any(Object)
        }),
        overallRating: expect.objectContaining({
          overallScore: expect.any(Number),
          categoryScores: expect.any(Object)
        })
      });
    });

    it('should handle telemetry fetch errors gracefully', async () => {
      const mockTelemetryUrl = 'https://invalid-url.com/telemetry.json';
      const teamPlayers = ['TestPlayer1'];
      const matchId = 'test-match-123';
      const teamRank = 50;

      // Mock the fetchTelemetryData method to throw an error
      jest.spyOn(telemetryAnalyzer as any, 'fetchTelemetryData').mockRejectedValue(new Error('Network error'));

      await expect(telemetryAnalyzer.analyzeTelemetryData(
        mockTelemetryUrl,
        teamPlayers,
        matchId,
        teamRank
      )).rejects.toThrow('Failed to analyze telemetry data');
    });
  });

  describe('CoachingTipsService', () => {
    it('should generate appropriate coaching tips based on analysis', () => {
      const mockAnalysis: TelemetryAnalysisResult = {
        matchId: 'test-match-123',
        teamPlayers: ['TestPlayer1', 'TestPlayer2'],
        teamRank: 45,
        analysisTimestamp: new Date().toISOString(),
        criticalMistakes: [
          {
            type: 'ZONE_MANAGEMENT',
            timestamp: new Date().toISOString(),
            player: 'TestPlayer1',
            description: 'Team took 150 damage from blue zone',
            impact: 'HIGH',
            recommendation: 'Rotate earlier to avoid blue zone damage'
          }
        ],
        strategicRecommendations: [],
        engagementAnalysis: {
          totalEngagements: 3,
          wonEngagements: 1,
          lostEngagements: 2,
          averageEngagementDistance: 100,
          weaponEffectiveness: [],
          engagementPositioning: {
            highGroundAdvantage: 0,
            coverUsage: 1,
            overExtensions: 2,
            recommendation: 'Maintain high ground'
          },
          thirdPartySituations: 1
        },
        positioningAnalysis: {
          zoneManagement: {
            lateRotations: 3,
            blueZoneDamage: 150,
            earlyRotations: 0,
            rotationTiming: 'POOR',
            recommendation: 'Start rotating earlier'
          },
          rotationEfficiency: {
            averageRotationTime: 180,
            routeEfficiency: 50,
            vehicleUsage: 1,
            recommendation: 'Use vehicles more frequently'
          },
          compoundHolding: {
            compoundsHeld: 1,
            averageHoldTime: 300,
            defensiveEffectiveness: 40,
            recommendation: 'Hold compounds longer'
          },
          finalCirclePositioning: {
            finalCircleRank: 45,
            centerControl: false,
            edgePlay: true,
            recommendation: 'Focus on center control'
          }
        },
        lootingAnalysis: {
          lootingEfficiency: {
            earlyGameLootTime: 400,
            midGameUpgrades: 2,
            lateGameOptimization: 1,
            recommendation: 'Optimize looting speed'
          },
          weaponChoices: {
            primaryWeapon: 'M416',
            secondaryWeapon: 'Kar98k',
            weaponSynergy: 75,
            attachmentOptimization: 60,
            recommendation: 'Good weapon synergy'
          },
          healingManagement: {
            healingItemsUsed: 8,
            healingEfficiency: 70,
            lowHealthSituations: 3,
            recommendation: 'Use healing more proactively'
          },
          throwableUsage: {
            grenadesUsed: 2,
            smokeUsage: 1,
            flashbangUsage: 0,
            effectiveness: 50,
            recommendation: 'Increase utility usage'
          }
        },
        teamCoordinationAnalysis: {
          reviveEfficiency: {
            totalRevives: 2,
            successfulRevives: 1,
            averageReviveTime: 8,
            recommendation: 'Improve revive positioning'
          },
          teamSpreading: {
            averageTeamDistance: 120,
            optimalSpreadMaintained: 60,
            overExtensions: 3,
            recommendation: 'Maintain better team spacing'
          },
          communicationEffectiveness: {
            coordinatedEngagements: 1,
            simultaneousKnocks: 0,
            focusFireEfficiency: 30,
            recommendation: 'Improve communication'
          },
          roleDistribution: {
            pointMan: 'TestPlayer1',
            support: 'TestPlayer2',
            fragger: 'TestPlayer1',
            igl: 'TestPlayer2',
            roleEffectiveness: 60,
            recommendation: 'Define clearer roles'
          }
        },
        overallRating: {
          overallScore: 45,
          categoryScores: {
            positioning: 40,
            engagement: 35,
            looting: 65,
            teamwork: 50,
            decision_making: 30
          },
          improvementPotential: 55,
          strengthsAndWeaknesses: {
            strengths: ['looting'],
            weaknesses: ['decision making', 'engagement', 'positioning'],
            priorityImprovements: ['positioning', 'engagement', 'decision making']
          }
        }
      };

      const coachingTips = coachingTipsService.generateCoachingTips(mockAnalysis);

      expect(coachingTips).toBeDefined();
      expect(coachingTips.length).toBeGreaterThan(0);
      
      // Should include zone management tip due to critical mistake
      const zoneManagementTip = coachingTips.find(tip => 
        tip.title.includes('Zone') || tip.description.includes('zone')
      );
      expect(zoneManagementTip).toBeDefined();
      expect(zoneManagementTip?.category).toBe('IMMEDIATE');
      expect(zoneManagementTip?.priority).toBe('HIGH');

      // Should include late game tip due to mid-range rank (rank 45)
      const lateGameTip = coachingTips.find(tip => 
        tip.title.includes('Late Game') || tip.description.includes('late game')
      );
      expect(lateGameTip).toBeDefined();

      // Should include positioning tip due to low positioning score
      const positioningTip = coachingTips.find(tip => 
        tip.title.includes('Position') || tip.description.includes('position')
      );
      expect(positioningTip).toBeDefined();

      // All tips should have required properties
      coachingTips.forEach(tip => {
        expect(tip).toMatchObject({
          category: expect.stringMatching(/IMMEDIATE|SHORT_TERM|LONG_TERM/),
          priority: expect.stringMatching(/HIGH|MEDIUM|LOW/),
          title: expect.any(String),
          description: expect.any(String),
          actionSteps: expect.any(Array),
          expectedTimeframe: expect.any(String),
          difficulty: expect.stringMatching(/EASY|MEDIUM|HARD/)
        });
        expect(tip.actionSteps.length).toBeGreaterThan(0);
      });
    });

    it('should prioritize tips correctly', () => {
      const mockAnalysis: TelemetryAnalysisResult = {
        matchId: 'test-match-123',
        teamPlayers: ['TestPlayer1'],
        teamRank: 80,
        analysisTimestamp: new Date().toISOString(),
        criticalMistakes: [
          {
            type: 'ENGAGEMENT',
            timestamp: new Date().toISOString(),
            player: 'TestPlayer1',
            description: 'Low engagement win rate: 20%',
            impact: 'HIGH',
            recommendation: 'Pick fights more carefully'
          }
        ],
        strategicRecommendations: [],
        engagementAnalysis: {
          totalEngagements: 5,
          wonEngagements: 1,
          lostEngagements: 4,
          averageEngagementDistance: 80,
          weaponEffectiveness: [],
          engagementPositioning: {
            highGroundAdvantage: 0,
            coverUsage: 1,
            overExtensions: 3,
            recommendation: 'Take high ground'
          },
          thirdPartySituations: 2
        },
        positioningAnalysis: {
          zoneManagement: {
            lateRotations: 0,
            blueZoneDamage: 10,
            earlyRotations: 2,
            rotationTiming: 'GOOD',
            recommendation: 'Continue current strategy'
          },
          rotationEfficiency: {
            averageRotationTime: 120,
            routeEfficiency: 80,
            vehicleUsage: 3,
            recommendation: 'Good efficiency'
          },
          compoundHolding: {
            compoundsHeld: 2,
            averageHoldTime: 600,
            defensiveEffectiveness: 70,
            recommendation: 'Maintain current approach'
          },
          finalCirclePositioning: {
            finalCircleRank: 80,
            centerControl: false,
            edgePlay: true,
            recommendation: 'Try center control'
          }
        },
        lootingAnalysis: {
          lootingEfficiency: {
            earlyGameLootTime: 300,
            midGameUpgrades: 3,
            lateGameOptimization: 2,
            recommendation: 'Good efficiency'
          },
          weaponChoices: {
            primaryWeapon: 'M416',
            secondaryWeapon: 'Kar98k',
            weaponSynergy: 85,
            attachmentOptimization: 80,
            recommendation: 'Excellent choices'
          },
          healingManagement: {
            healingItemsUsed: 10,
            healingEfficiency: 85,
            lowHealthSituations: 1,
            recommendation: 'Good management'
          },
          throwableUsage: {
            grenadesUsed: 3,
            smokeUsage: 2,
            flashbangUsage: 1,
            effectiveness: 80,
            recommendation: 'Good usage'
          }
        },
        teamCoordinationAnalysis: {
          reviveEfficiency: {
            totalRevives: 0,
            successfulRevives: 0,
            averageReviveTime: 0,
            recommendation: 'N/A'
          },
          teamSpreading: {
            averageTeamDistance: 80,
            optimalSpreadMaintained: 80,
            overExtensions: 1,
            recommendation: 'Good spacing'
          },
          communicationEffectiveness: {
            coordinatedEngagements: 2,
            simultaneousKnocks: 1,
            focusFireEfficiency: 70,
            recommendation: 'Good coordination'
          },
          roleDistribution: {
            pointMan: 'TestPlayer1',
            support: 'TestPlayer1',
            fragger: 'TestPlayer1',
            igl: 'TestPlayer1',
            roleEffectiveness: 70,
            recommendation: 'Solo player'
          }
        },
        overallRating: {
          overallScore: 60,
          categoryScores: {
            positioning: 75,
            engagement: 30, // Low engagement score
            looting: 85,
            teamwork: 70,
            decision_making: 65
          },
          improvementPotential: 40,
          strengthsAndWeaknesses: {
            strengths: ['looting'],
            weaknesses: ['engagement'],
            priorityImprovements: ['engagement']
          }
        }
      };

      const coachingTips = coachingTipsService.generateCoachingTips(mockAnalysis);

      // First tip should be high priority
      expect(coachingTips[0].priority).toBe('HIGH');
      
      // Should include engagement-focused tips due to low engagement score
      const engagementTips = coachingTips.filter(tip => 
        tip.title.includes('Combat') || 
        tip.title.includes('Engagement') || 
        tip.description.includes('engagement')
      );
      expect(engagementTips.length).toBeGreaterThan(0);

      // Tips should be sorted by priority (HIGH > MEDIUM > LOW)
      let lastPriorityValue = 4; // Higher than HIGH (3)
      const priorityOrder = { HIGH: 3, MEDIUM: 2, LOW: 1 };
      
      coachingTips.forEach(tip => {
        const currentPriorityValue = priorityOrder[tip.priority];
        expect(currentPriorityValue).toBeLessThanOrEqual(lastPriorityValue);
        lastPriorityValue = currentPriorityValue;
      });
    });
  });
});

// Mock axios for telemetry data fetching
jest.mock('axios', () => ({
  get: jest.fn(() => Promise.resolve({
    data: [
      {
        _D: '2024-01-01T10:00:00.000Z',
        _T: 'LogPlayerKillV2',
        killer: { name: 'TestPlayer1' },
        victim: { name: 'EnemyPlayer1' }
      }
    ]
  }))
})); 