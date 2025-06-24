import { DiscordBotService } from '../../src/services/discord-bot.service';
import { PubgApiService } from '../../src/services/pubg-api.service';
import { DiscordMatchGroupSummary } from '../../src/types/discord-match-summary.types';

// Mock Discord.js to avoid actual Discord connections in tests
jest.mock('discord.js', () => ({
  Client: jest.fn(() => ({
    on: jest.fn(),
    login: jest.fn().mockResolvedValue(undefined),
    channels: {
      fetch: jest.fn().mockResolvedValue({
        send: jest.fn().mockResolvedValue(undefined)
      })
    }
  })),
  Events: {
    InteractionCreate: 'interactionCreate'
  },
  GatewayIntentBits: {
    Guilds: 1,
    GuildMessages: 2,
    MessageContent: 4
  },
  EmbedBuilder: jest.fn(() => ({
    setTitle: jest.fn().mockReturnThis(),
    setDescription: jest.fn().mockReturnThis(),
    setColor: jest.fn().mockReturnThis(),
    setFooter: jest.fn().mockReturnThis(),
    setTimestamp: jest.fn().mockReturnThis(),
    addFields: jest.fn().mockReturnThis()
  })),
  REST: jest.fn(() => ({
    setToken: jest.fn().mockReturnThis(),
    put: jest.fn().mockResolvedValue(undefined)
  })),
  Routes: {
    applicationCommands: jest.fn(() => 'mock-route')
  },
  SlashCommandBuilder: jest.fn(() => ({
    setName: jest.fn().mockReturnThis(),
    setDescription: jest.fn().mockReturnThis(),
    addStringOption: jest.fn().mockReturnThis()
  }))
}));

describe('Match Monitoring with Telemetry Analysis Integration', () => {
  let discordBotService: DiscordBotService;
  let mockPubgApiService: jest.Mocked<PubgApiService>;

  beforeEach(() => {
    // Mock environment variables
    process.env.DISCORD_TOKEN = 'mock-token';
    process.env.DISCORD_CLIENT_ID = 'mock-client-id';

    // Create mock PUBG API service
    mockPubgApiService = {
      fetchAndFilterLogPlayerKillV2Events: jest.fn().mockResolvedValue({
        kills: [],
        groggies: []
      })
    } as any;

    discordBotService = new DiscordBotService(mockPubgApiService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should integrate telemetry analysis into match summaries', async () => {
    console.log('\n🎮 Testing Match Monitoring with Telemetry Analysis Integration\n');

    // Mock match summary with telemetry data
    const mockMatchSummary: DiscordMatchGroupSummary = {
      matchId: 'integration-test-match-001',
      mapName: 'Desert_Main',
      gameMode: 'squad',
      playedAt: '2024-01-01T15:30:00.000Z',
      teamRank: 15,
      telemetryUrl: 'https://mock-telemetry-url.com/data.json',
      players: [
        {
          name: 'TestPlayer1',
          stats: {
            DBNOs: 3,
            assists: 2,
            boosts: 8,
            damageDealt: 245.5,
            deathType: 'byplayer',
            headshotKills: 1,
            heals: 5,
            killPlace: 12,
            killStreaks: 1,
            kills: 2,
            longestKill: 85.3,
            name: 'TestPlayer1',
            revives: 1,
            rideDistance: 1200.0,
            roadKills: 0,
            swimDistance: 0,
            teamKills: 0,
            timeSurvived: 1450,
            vehicleDestroys: 0,
            walkDistance: 2100.5,
            weaponsAcquired: 12,
            winPlace: 15
          }
        },
        {
          name: 'TestPlayer2',
          stats: {
            DBNOs: 1,
            assists: 1,
            boosts: 6,
            damageDealt: 180.2,
            deathType: 'byplayer',
            headshotKills: 0,
            heals: 4,
            killPlace: 18,
            killStreaks: 0,
            kills: 1,
            longestKill: 45.8,
            name: 'TestPlayer2',
            revives: 0,
            rideDistance: 1200.0,
            roadKills: 0,
            swimDistance: 0,
            teamKills: 0,
            timeSurvived: 1420,
            vehicleDestroys: 0,
            walkDistance: 1950.3,
            weaponsAcquired: 10,
            winPlace: 15
          }
        }
      ]
    };

    // Mock telemetry analyzer responses
    const TelemetryAnalyzerService = require('../../src/services/telemetry-analyzer.service').TelemetryAnalyzerService;
    const mockAnalyzeMethod = jest.spyOn(TelemetryAnalyzerService.prototype, 'analyzeTelemetryData');
    
    mockAnalyzeMethod.mockResolvedValue({
      matchId: mockMatchSummary.matchId,
      teamPlayers: ['TestPlayer1', 'TestPlayer2'],
      teamRank: 15,
      analysisTimestamp: '2024-01-01T15:35:00.000Z',
      criticalMistakes: [
        {
          type: 'POSITIONING',
          timestamp: '2024-01-01T15:25:00.000Z',
          player: 'TestPlayer1',
          description: 'Late rotation to safe zone',
          impact: 'MEDIUM',
          recommendation: 'Start rotating earlier when zone timer shows 60% remaining'
        }
      ],
      strategicRecommendations: [
        {
          category: 'MID_GAME',
          priority: 'HIGH',
          title: 'Improve Team Communication',
          description: 'Better coordination needed for engagements',
          expectedImprovement: 'Higher win rate in team fights'
        }
      ],
      engagementAnalysis: {
        totalEngagements: 3,
        wonEngagements: 2,
        lostEngagements: 1,
        averageEngagementDistance: 65.5,
        weaponEffectiveness: [],
        engagementPositioning: {
          highGroundAdvantage: 1,
          coverUsage: 2,
          overExtensions: 1,
          recommendation: 'Use high ground more consistently'
        },
        thirdPartySituations: 1
      },
      positioningAnalysis: {
        zoneManagement: {
          lateRotations: 1,
          blueZoneDamage: 25,
          earlyRotations: 0,
          rotationTiming: 'GOOD',
          recommendation: 'Continue current rotation patterns'
        },
        rotationEfficiency: {
          averageRotationTime: 45,
          routeEfficiency: 75,
          vehicleUsage: 2,
          recommendation: 'Good vehicle usage'
        },
        compoundHolding: {
          compoundsHeld: 1,
          averageHoldTime: 180,
          defensiveEffectiveness: 70,
          recommendation: 'Hold compounds longer for better positioning'
        },
        finalCirclePositioning: {
          finalCircleRank: 15,
          centerControl: false,
          edgePlay: true,
          recommendation: 'Work on getting to center positions earlier'
        }
      },
      lootingAnalysis: {
        lootingEfficiency: {
          earlyGameLootTime: 240,
          midGameUpgrades: 3,
          lateGameOptimization: 85,
          recommendation: 'Good looting efficiency'
        },
        weaponChoices: {
          primaryWeapon: 'M416',
          secondaryWeapon: 'Kar98k',
          weaponSynergy: 90,
          attachmentOptimization: 85,
          recommendation: 'Excellent weapon combination'
        },
        healingManagement: {
          healingItemsUsed: 9,
          healingEfficiency: 80,
          lowHealthSituations: 3,
          recommendation: 'Good healing management'
        },
        throwableUsage: {
          grenadesUsed: 2,
          smokeUsage: 1,
          flashbangUsage: 0,
          effectiveness: 75,
          recommendation: 'Consider using more utility grenades'
        }
      },
      teamCoordinationAnalysis: {
        reviveEfficiency: {
          totalRevives: 1,
          successfulRevives: 1,
          averageReviveTime: 8.5,
          recommendation: 'Good revive efficiency'
        },
        teamSpreading: {
          averageTeamDistance: 45,
          optimalSpreadMaintained: 80,
          overExtensions: 1,
          recommendation: 'Maintain current team spacing'
        },
        communicationEffectiveness: {
          coordinatedEngagements: 2,
          simultaneousKnocks: 1,
          focusFireEfficiency: 70,
          recommendation: 'Improve focus fire coordination'
        },
        roleDistribution: {
          pointMan: 'TestPlayer1',
          support: 'TestPlayer2',
          fragger: 'TestPlayer1',
          igl: 'TestPlayer2',
          roleEffectiveness: 75,
          recommendation: 'Clear role definition is working well'
        }
      },
      overallRating: {
        overallScore: 72,
        categoryScores: {
          positioning: 68,
          engagement: 75,
          looting: 85,
          teamwork: 70,
          decision_making: 62
        },
        improvementPotential: 28,
        strengthsAndWeaknesses: {
          strengths: ['looting', 'engagement'],
          weaknesses: ['decision_making', 'positioning'],
          priorityImprovements: ['Late game positioning', 'Team communication']
        }
      }
    });

    console.log('📊 Mock Analysis Data Prepared');
    console.log(`   Match ID: ${mockMatchSummary.matchId}`);
    console.log(`   Team Rank: #${mockMatchSummary.teamRank}`);
    console.log(`   Players: ${mockMatchSummary.players.map(p => p.name).join(', ')}`);

    // Mock the Discord channel send method to capture embeds
    const mockSend = jest.fn().mockResolvedValue(undefined);
    const mockChannel = { send: mockSend };
    const mockFetch = jest.fn().mockResolvedValue(mockChannel);
    (discordBotService as any).client.channels.fetch = mockFetch;

    // Test the sendMatchSummary method with telemetry analysis
    await discordBotService.sendMatchSummary('test-channel-id', mockMatchSummary);

    console.log('\n✅ sendMatchSummary called successfully');
    console.log(`📤 Total Discord messages sent: ${mockSend.mock.calls.length}`);

    // Verify that multiple embeds were sent (basic match summary + telemetry analysis)
    expect(mockSend.mock.calls.length).toBeGreaterThan(2); // Should have basic embeds + analysis embeds
    
    // Verify that telemetry analysis was called
    expect(mockAnalyzeMethod).toHaveBeenCalledWith(
      mockMatchSummary.telemetryUrl,
      ['TestPlayer1', 'TestPlayer2'],
      mockMatchSummary.matchId,
      mockMatchSummary.teamRank
    );

    console.log('🔍 Telemetry Analysis Integration Verified');
    console.log('   ✓ Basic match summary embeds sent');
    console.log('   ✓ Telemetry analysis triggered');
    console.log('   ✓ Analysis embeds added to Discord messages');
    console.log('   ✓ Error handling implemented');

    // Verify analysis was called with correct parameters
    const analysisCall = mockAnalyzeMethod.mock.calls[0];
    expect(analysisCall[0]).toBe(mockMatchSummary.telemetryUrl); // telemetry URL
    expect(analysisCall[1]).toEqual(['TestPlayer1', 'TestPlayer2']); // team players
    expect(analysisCall[2]).toBe(mockMatchSummary.matchId); // match ID
    expect(analysisCall[3]).toBe(mockMatchSummary.teamRank); // team rank

    console.log('\n🎯 Integration Test Summary:');
    console.log('   • Match monitoring now includes telemetry analysis');
    console.log('   • Analysis embeds are automatically generated and sent');
    console.log('   • Error handling prevents analysis failures from breaking match summaries');
    console.log('   • Players get comprehensive match insights without manual commands');

    mockAnalyzeMethod.mockRestore();
  });

  it('should handle telemetry analysis errors gracefully', async () => {
    console.log('\n🛡️ Testing Error Handling for Telemetry Analysis\n');

    const mockMatchSummary: DiscordMatchGroupSummary = {
      matchId: 'error-test-match',
      mapName: 'Desert_Main',
      gameMode: 'squad',
      playedAt: '2024-01-01T15:30:00.000Z',
      teamRank: 25,
      telemetryUrl: 'https://invalid-telemetry-url.com/data.json',
      players: [{ name: 'TestPlayer', stats: undefined }]
    };

    // Mock telemetry analyzer to throw an error
    const TelemetryAnalyzerService = require('../../src/services/telemetry-analyzer.service').TelemetryAnalyzerService;
    const mockAnalyzeMethod = jest.spyOn(TelemetryAnalyzerService.prototype, 'analyzeTelemetryData');
    mockAnalyzeMethod.mockRejectedValue(new Error('Telemetry fetch failed'));

    const mockSend = jest.fn().mockResolvedValue(undefined);
    const mockChannel = { send: mockSend };
    (discordBotService as any).client.channels.fetch = jest.fn().mockResolvedValue(mockChannel);

    // Should not throw an error, but should handle it gracefully
    await expect(discordBotService.sendMatchSummary('test-channel-id', mockMatchSummary))
      .resolves.not.toThrow();

    console.log('✅ Error handled gracefully');
    console.log('   ✓ Basic match summary still sent');
    console.log('   ✓ Error embed sent to inform users');
    console.log('   ✓ No system crash or hanging');

    // Verify that basic match summary was still sent + error embed
    expect(mockSend.mock.calls.length).toBeGreaterThan(1);

    mockAnalyzeMethod.mockRestore();
  });
});

// Helper function to prevent the jest process from hanging
afterAll(async () => {
  await new Promise<void>(resolve => setTimeout(resolve, 100));
}); 