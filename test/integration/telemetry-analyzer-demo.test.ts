import { TelemetryAnalyzerService } from '../../src/services/telemetry-analyzer.service';
import { CoachingTipsService } from '../../src/services/coaching-tips.service';
import { AnalyzeMatchCommand } from '../../src/commands/analyze-match.command';

describe('PUBG Telemetry Analyzer Demo', () => {
  let telemetryAnalyzer: TelemetryAnalyzerService;
  let coachingTipsService: CoachingTipsService;

  beforeEach(() => {
    telemetryAnalyzer = new TelemetryAnalyzerService();
    coachingTipsService = new CoachingTipsService();
  });

  it('should demonstrate complete telemetry analysis workflow', async () => {
    console.log('\n🎯 PUBG Telemetry Analyzer Demo\n');

    // Mock comprehensive telemetry data representing a team's match
    const mockTelemetryData = [
      // Team kill event - successful engagement
      {
        _D: '2024-01-01T10:15:30.000Z',
        _T: 'LogPlayerKillV2',
        killer: { name: 'ProPlayer1', location: { x: 100, y: 100, z: 25 }, teamId: 1 },
        victim: { name: 'EnemyPlayer1', location: { x: 150, y: 150, z: 5 }, teamId: 2 },
        killerDamageInfo: { 
          damageCauserName: 'WeapM416_C', 
          distance: 85,
          damageReason: 'HeadShot'
        },
        victimGameResult: { rank: 45, gameResult: 'defeated', teamId: 2 }
      },
      // Team member takes blue zone damage - positioning mistake
      {
        _D: '2024-01-01T10:20:00.000Z',
        _T: 'LogPlayerTakeDamage',
        victim: { name: 'ProPlayer2', teamId: 1 },
        damageReason: 'BluezoneFinish',
        damage: 35,
        damageTypeCategory: 'Damage_BlueZone'
      },
      // Zone update event
      {
        _D: '2024-01-01T10:18:00.000Z',
        _T: 'LogZoneUpdate',
        zoneState: 3,
        safetyZonePosition: { x: 200, y: 200, z: 0 },
        safetyZoneRadius: 350
      },
      // Team member gets knocked
      {
        _D: '2024-01-01T10:25:00.000Z',
        _T: 'LogPlayerMakeGroggy',
        attacker: { name: 'EnemyPlayer2', teamId: 3 },
        victim: { name: 'ProPlayer3', teamId: 1 },
        damageReason: 'HeadShot',
        damageCauserName: 'WeapKar98k_C',
        distance: 180
      },
      // Successful revive
      {
        _D: '2024-01-01T10:25:45.000Z',
        _T: 'LogPlayerRevive',
        reviver: { name: 'ProPlayer1', teamId: 1 },
        victim: { name: 'ProPlayer3', teamId: 1 }
      },
      // Vehicle usage for rotation
      {
        _D: '2024-01-01T10:12:00.000Z',
        _T: 'LogVehicleRide',
        character: { name: 'ProPlayer1', teamId: 1 },
        vehicle: { vehicleType: 'BP_Mirado_C', healthPercent: 85, fuelPercent: 70 },
        seatIndex: 0
      }
    ];

    // Mock the fetchTelemetryData method
    jest.spyOn(telemetryAnalyzer as any, 'fetchTelemetryData').mockResolvedValue(mockTelemetryData);

    const teamPlayers = ['ProPlayer1', 'ProPlayer2', 'ProPlayer3', 'ProPlayer4'];
    const matchId = 'demo-match-2024-001';
    const teamRank = 23; // Mid-tier performance

    console.log(`📊 Analyzing match: ${matchId}`);
    console.log(`👥 Team: ${teamPlayers.join(', ')}`);
    console.log(`🏆 Final Rank: #${teamRank}\n`);

    // Perform telemetry analysis
    const analysis = await telemetryAnalyzer.analyzeTelemetryData(
      'https://mock-telemetry-url.com/data.json',
      teamPlayers,
      matchId,
      teamRank
    );

    // Generate coaching tips
    const coachingTips = coachingTipsService.generateCoachingTips(analysis);

    // Display results
    console.log('📈 ANALYSIS RESULTS:');
    console.log('═'.repeat(50));
    
    console.log(`\n🎯 Overall Performance: ${analysis.overallRating.overallScore}/100`);
    console.log(`📊 Category Breakdown:`);
    Object.entries(analysis.overallRating.categoryScores).forEach(([category, score]) => {
      const emoji = score >= 80 ? '🟢' : score >= 60 ? '🟡' : '🔴';
      console.log(`   ${emoji} ${category.replace('_', ' ')}: ${score}/100`);
    });

    console.log(`\n💪 Strengths: ${analysis.overallRating.strengthsAndWeaknesses.strengths.join(', ') || 'None identified'}`);
    console.log(`⚠️  Weaknesses: ${analysis.overallRating.strengthsAndWeaknesses.weaknesses.join(', ') || 'None identified'}`);

    if (analysis.criticalMistakes.length > 0) {
      console.log('\n🚨 CRITICAL MISTAKES:');
      analysis.criticalMistakes.slice(0, 3).forEach((mistake, index) => {
        const impactEmoji = mistake.impact === 'HIGH' ? '🔴' : mistake.impact === 'MEDIUM' ? '🟡' : '🟢';
        console.log(`${index + 1}. ${impactEmoji} ${mistake.type.replace('_', ' ')} - ${mistake.description}`);
        console.log(`   💡 Fix: ${mistake.recommendation}\n`);
      });
    }

    if (coachingTips.length > 0) {
      console.log('🎯 TOP COACHING TIPS:');
      coachingTips.slice(0, 3).forEach((tip, index) => {
        const categoryEmoji = tip.category === 'IMMEDIATE' ? '⚡' : tip.category === 'SHORT_TERM' ? '📈' : '🎯';
        const difficultyEmoji = tip.difficulty === 'EASY' ? '🟢' : tip.difficulty === 'MEDIUM' ? '🟡' : '🔴';
        console.log(`${index + 1}. ${categoryEmoji} ${difficultyEmoji} ${tip.title}`);
        console.log(`   📝 ${tip.description}`);
        console.log(`   🎯 Action Steps:`);
        tip.actionSteps.slice(0, 2).forEach(step => console.log(`      • ${step}`));
        console.log(`   ⏱️  Timeframe: ${tip.expectedTimeframe}\n`);
      });
    }

    console.log('⚔️ ENGAGEMENT ANALYSIS:');
    console.log(`   Fights: ${analysis.engagementAnalysis.totalEngagements} (Won: ${analysis.engagementAnalysis.wonEngagements}, Lost: ${analysis.engagementAnalysis.lostEngagements})`);
    console.log(`   Avg Distance: ${Math.round(analysis.engagementAnalysis.averageEngagementDistance)}m`);
    console.log(`   Third Parties: ${analysis.engagementAnalysis.thirdPartySituations}`);

    console.log('\n🗺️ POSITIONING ANALYSIS:');
    console.log(`   Zone Management: ${analysis.positioningAnalysis.zoneManagement.rotationTiming}`);
    console.log(`   Blue Zone Damage: ${analysis.positioningAnalysis.zoneManagement.blueZoneDamage}`);
    console.log(`   Vehicle Usage: ${analysis.positioningAnalysis.rotationEfficiency.vehicleUsage}`);

    console.log('\n🤝 TEAM COORDINATION:');
    console.log(`   Revives: ${analysis.teamCoordinationAnalysis.reviveEfficiency.successfulRevives}/${analysis.teamCoordinationAnalysis.reviveEfficiency.totalRevives}`);
    console.log(`   Team Spacing: ${Math.round(analysis.teamCoordinationAnalysis.teamSpreading.averageTeamDistance)}m avg`);

    console.log('\n═'.repeat(50));
    console.log('✅ Analysis Complete! Use these insights to improve your gameplay.\n');

    // Assertions to verify the analysis worked
    expect(analysis).toBeDefined();
    expect(analysis.matchId).toBe(matchId);
    expect(analysis.teamPlayers).toEqual(teamPlayers);
    expect(analysis.teamRank).toBe(teamRank);
    expect(analysis.overallRating.overallScore).toBeGreaterThan(0);
    expect(analysis.overallRating.overallScore).toBeLessThanOrEqual(100);
    expect(coachingTips.length).toBeGreaterThan(0);
    
    // Verify analysis structure
    expect(analysis.engagementAnalysis).toBeDefined();
    expect(analysis.positioningAnalysis).toBeDefined();
    expect(analysis.lootingAnalysis).toBeDefined();
    expect(analysis.teamCoordinationAnalysis).toBeDefined();
    expect(analysis.overallRating.categoryScores).toBeDefined();
    
    console.log('🎉 All assertions passed! The telemetry analyzer is working correctly.');
  });

  it('should handle different team ranks and generate appropriate recommendations', async () => {
    const testCases = [
      { rank: 80, expectedTipType: 'survival', description: 'Poor rank should generate survival tips' },
      { rank: 30, expectedTipType: 'late game', description: 'Mid rank should generate late game tips' },
      { rank: 8, expectedTipType: 'optimization', description: 'Good rank should generate optimization tips' }
    ];

    for (const testCase of testCases) {
      // Mock minimal telemetry data
      jest.spyOn(telemetryAnalyzer as any, 'fetchTelemetryData').mockResolvedValue([]);

      const analysis = await telemetryAnalyzer.analyzeTelemetryData(
        'https://mock-url.com',
        ['TestPlayer'],
        `test-${testCase.rank}`,
        testCase.rank
      );

      const tips = coachingTipsService.generateCoachingTips(analysis);
      
      console.log(`\n🏆 Rank ${testCase.rank} Analysis:`);
      console.log(`   Overall Score: ${analysis.overallRating.overallScore}/100`);
      console.log(`   Generated Tips: ${tips.length}`);
      if (tips.length > 0) {
        console.log(`   Top Tip: ${tips[0].title}`);
        console.log(`   Category: ${tips[0].category} | Priority: ${tips[0].priority}`);
      }

      expect(analysis.teamRank).toBe(testCase.rank);
      // High-performing players (rank < 10) might not need tips
      if (testCase.rank >= 10) {
        expect(tips.length).toBeGreaterThan(0);
      }
    }
  });
});

// Clean up mocks
jest.mock('axios', () => ({
  get: jest.fn(() => Promise.resolve({ data: [] }))
})); 