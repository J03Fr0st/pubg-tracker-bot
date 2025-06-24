import { SlashCommandBuilder, EmbedBuilder, ChatInputCommandInteraction } from 'discord.js';
import { TelemetryAnalyzerService } from '../services/telemetry-analyzer.service';
import { PubgApiService } from '../services/pubg-api.service';
import { PubgStorageService } from '../services/pubg-storage.service';
import { CoachingTipsService, CoachingTip } from '../services/coaching-tips.service';
import { TelemetryAnalysisResult, CriticalMistake, StrategyRecommendation } from '../types/pubg-telemetry.types';
import { MatchColorUtil } from '../utils/match-colors.util';
import { error, info } from '../utils/logger';

export class AnalyzeMatchCommand {
  private readonly telemetryAnalyzer: TelemetryAnalyzerService;
  private readonly pubgApiService: PubgApiService;
  private readonly storageService: PubgStorageService;
  private readonly coachingTipsService: CoachingTipsService;

  constructor() {
    this.telemetryAnalyzer = new TelemetryAnalyzerService();
    this.storageService = new PubgStorageService();
    this.coachingTipsService = new CoachingTipsService();
    this.pubgApiService = new PubgApiService(
      process.env.PUBG_API_KEY || '',
      'steam',
      this.storageService
    );
  }

  public readonly data = new SlashCommandBuilder()
    .setName('analyze-match')
    .setDescription('Analyzes a PUBG match and provides strategic recommendations')
    .addStringOption(option =>
      option
        .setName('match-id')
        .setDescription('The PUBG match ID to analyze')
        .setRequired(true)
    )
    .addStringOption(option =>
      option
        .setName('players')
        .setDescription('Comma-separated list of player names in your team')
        .setRequired(true)
    );

  public async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    try {
      await interaction.deferReply();

      const matchId = interaction.options.getString('match-id', true);
      const playerNames = interaction.options.getString('players', true)
        .split(',')
        .map(name => name.trim())
        .filter(name => name.length > 0);

      if (playerNames.length === 0) {
        await interaction.editReply('❌ Please provide at least one player name.');
        return;
      }

      info(`Analyzing match ${matchId} for players: ${playerNames.join(', ')}`);

      // Get match details and telemetry URL
      const matchDetails = await this.pubgApiService.getMatchDetails(matchId);
      
      if (!matchDetails.telemetryUrl) {
        await interaction.editReply('❌ Could not retrieve telemetry data for this match.');
        return;
      }

      // Find team rank from match data
      const participants = matchDetails.included.filter(item => item.type === 'participant');
      const teamRank = this.getTeamRank(participants, playerNames);

      // Analyze telemetry data
      const analysis = await this.telemetryAnalyzer.analyzeTelemetryData(
        matchDetails.telemetryUrl,
        playerNames,
        matchId,
        teamRank
      );

      // Generate coaching tips
      const coachingTips = this.coachingTipsService.generateCoachingTips(analysis);

      // Create Discord embeds for the analysis
      const embeds = this.createAnalysisEmbeds(analysis, matchDetails, coachingTips);

      await interaction.editReply({ embeds });

    } catch (analysisError) {
      error('Error in analyze-match command:', analysisError as Error);
      await interaction.editReply('❌ Failed to analyze match. Please check the match ID and try again.');
    }
  }

  /**
   * Determines team rank from match participants
   */
  private getTeamRank(participants: any[], playerNames: string[]): number {
    for (const participant of participants) {
      if (participant.attributes?.stats?.name && 
          playerNames.includes(participant.attributes.stats.name)) {
        return participant.attributes.stats.winPlace || 100;
      }
    }
    return 100; // Default to last place if not found
  }

  /**
   * Creates Discord embeds for the analysis results
   */
  private createAnalysisEmbeds(analysis: TelemetryAnalysisResult, matchDetails: any, coachingTips: CoachingTip[]): EmbedBuilder[] {
    const embeds: EmbedBuilder[] = [];

    // Use consistent match color for all embeds
    const matchColor = MatchColorUtil.generateMatchColor(analysis.matchId);

    // Main analysis overview
    const overviewEmbed = new EmbedBuilder()
      .setTitle('🎯 PUBG Match Analysis')
      .setDescription(`**Match:** ${analysis.matchId}\n**Team:** ${analysis.teamPlayers.join(', ')}\n**Rank:** #${analysis.teamRank}`)
      .setColor(matchColor)
      .addFields(
        {
          name: '📊 Overall Performance',
          value: `**Score:** ${analysis.overallRating.overallScore}/100\n**Improvement Potential:** ${analysis.overallRating.improvementPotential}%`,
          inline: true
        },
        {
          name: '📈 Category Scores',
          value: this.formatCategoryScores(analysis.overallRating.categoryScores),
          inline: true
        },
        {
          name: '🎯 Key Areas',
          value: `**Strengths:** ${analysis.overallRating.strengthsAndWeaknesses.strengths.join(', ') || 'None identified'}\n**Weaknesses:** ${analysis.overallRating.strengthsAndWeaknesses.weaknesses.join(', ') || 'None identified'}`,
          inline: false
        }
      )
      .setTimestamp();

    embeds.push(overviewEmbed);

    // Critical mistakes embed
    if (analysis.criticalMistakes.length > 0) {
      const mistakesEmbed = new EmbedBuilder()
        .setTitle('⚠️ Critical Mistakes')
        .setColor(matchColor)
        .setDescription('These mistakes significantly impacted your team\'s performance:');

      analysis.criticalMistakes.slice(0, 5).forEach((mistake, index) => {
        mistakesEmbed.addFields({
          name: `${this.getImpactEmoji(mistake.impact)} ${mistake.type.replace('_', ' ')}`,
          value: `**Player:** ${mistake.player}\n**Issue:** ${mistake.description}\n**Fix:** ${mistake.recommendation}`,
          inline: false
        });
      });

      embeds.push(mistakesEmbed);
    }

    // Strategic recommendations embed
    if (analysis.strategicRecommendations.length > 0) {
      const recommendationsEmbed = new EmbedBuilder()
        .setTitle('💡 Strategic Recommendations')
        .setColor(matchColor)
        .setDescription('Focus on these areas to improve your gameplay:');

      analysis.strategicRecommendations.slice(0, 5).forEach((rec, index) => {
        recommendationsEmbed.addFields({
          name: `${this.getPriorityEmoji(rec.priority)} ${rec.title}`,
          value: `**Category:** ${rec.category.replace('_', ' ')}\n**Description:** ${rec.description}\n**Expected Improvement:** ${rec.expectedImprovement}`,
          inline: false
        });
      });

      embeds.push(recommendationsEmbed);
    }

    // Engagement analysis embed
    const engagementEmbed = new EmbedBuilder()
      .setTitle('⚔️ Engagement Analysis')
      .setColor(matchColor)
      .addFields(
        {
          name: '🎯 Fight Summary',
          value: `**Total Engagements:** ${analysis.engagementAnalysis.totalEngagements}\n**Won:** ${analysis.engagementAnalysis.wonEngagements}\n**Lost:** ${analysis.engagementAnalysis.lostEngagements}\n**Win Rate:** ${this.calculateWinRate(analysis.engagementAnalysis)}%`,
          inline: true
        },
        {
          name: '📏 Combat Stats',
          value: `**Avg Distance:** ${Math.round(analysis.engagementAnalysis.averageEngagementDistance)}m\n**Third Parties:** ${analysis.engagementAnalysis.thirdPartySituations}`,
          inline: true
        },
        {
          name: '💭 Positioning Advice',
          value: analysis.engagementAnalysis.engagementPositioning.recommendation,
          inline: false
        }
      );

    embeds.push(engagementEmbed);

    // Positioning analysis embed
    const positioningEmbed = new EmbedBuilder()
      .setTitle('🗺️ Positioning & Rotation Analysis')
      .setColor(matchColor)
      .addFields(
        {
          name: '🌀 Zone Management',
          value: `**Status:** ${analysis.positioningAnalysis.zoneManagement.rotationTiming}\n**Late Rotations:** ${analysis.positioningAnalysis.zoneManagement.lateRotations}\n**Blue Zone Damage:** ${analysis.positioningAnalysis.zoneManagement.blueZoneDamage}`,
          inline: true
        },
        {
          name: '🚗 Rotation Efficiency',
          value: `**Vehicle Usage:** ${analysis.positioningAnalysis.rotationEfficiency.vehicleUsage}\n**Route Efficiency:** ${analysis.positioningAnalysis.rotationEfficiency.routeEfficiency}%`,
          inline: true
        },
        {
          name: '🏰 Final Circle',
          value: `**Final Rank:** #${analysis.positioningAnalysis.finalCirclePositioning.finalCircleRank}\n**Center Control:** ${analysis.positioningAnalysis.finalCirclePositioning.centerControl ? 'Yes' : 'No'}\n**Edge Play:** ${analysis.positioningAnalysis.finalCirclePositioning.edgePlay ? 'Yes' : 'No'}`,
          inline: false
        },
        {
          name: '💡 Zone Recommendation',
          value: analysis.positioningAnalysis.zoneManagement.recommendation,
          inline: false
        }
      );

    embeds.push(positioningEmbed);

    // Team coordination embed
    const teamworkEmbed = new EmbedBuilder()
      .setTitle('🤝 Team Coordination Analysis')
      .setColor(matchColor)
      .addFields(
        {
          name: '🚑 Revive Efficiency',
          value: `**Total Revives:** ${analysis.teamCoordinationAnalysis.reviveEfficiency.totalRevives}\n**Successful:** ${analysis.teamCoordinationAnalysis.reviveEfficiency.successfulRevives}\n**Success Rate:** ${this.calculateReviveRate(analysis.teamCoordinationAnalysis.reviveEfficiency)}%`,
          inline: true
        },
        {
          name: '📏 Team Spacing',
          value: `**Avg Distance:** ${Math.round(analysis.teamCoordinationAnalysis.teamSpreading.averageTeamDistance)}m\n**Over-extensions:** ${analysis.teamCoordinationAnalysis.teamSpreading.overExtensions}`,
          inline: true
        },
        {
          name: '👥 Role Distribution',
          value: `**Point:** ${analysis.teamCoordinationAnalysis.roleDistribution.pointMan}\n**Support:** ${analysis.teamCoordinationAnalysis.roleDistribution.support}\n**Fragger:** ${analysis.teamCoordinationAnalysis.roleDistribution.fragger}\n**IGL:** ${analysis.teamCoordinationAnalysis.roleDistribution.igl}`,
          inline: false
        },
        {
          name: '💬 Communication Tip',
          value: analysis.teamCoordinationAnalysis.communicationEffectiveness.recommendation,
          inline: false
        }
      );

    embeds.push(teamworkEmbed);

    // Coaching tips embed
    if (coachingTips.length > 0) {
      const coachingEmbed = new EmbedBuilder()
        .setTitle('🎯 Personalized Coaching Tips')
        .setColor(matchColor)
        .setDescription('Focus on these specific areas to improve your gameplay:');

      coachingTips.slice(0, 5).forEach((tip, index) => {
        const difficultyEmoji = this.getDifficultyEmoji(tip.difficulty);
        const categoryEmoji = this.getCategoryEmoji(tip.category);
        
        coachingEmbed.addFields({
          name: `${categoryEmoji} ${difficultyEmoji} ${tip.title}`,
          value: `**${tip.description}**\n\n**Action Steps:**\n${tip.actionSteps.slice(0, 3).map(step => `• ${step}`).join('\n')}\n\n**⏱️ Timeframe:** ${tip.expectedTimeframe} | **📊 Difficulty:** ${tip.difficulty}`,
          inline: false
        });
      });

      embeds.push(coachingEmbed);
    }

    return embeds;
  }



  /**
   * Formats category scores for display
   */
  private formatCategoryScores(scores: any): string {
    return Object.entries(scores)
      .map(([category, score]) => `${category.replace('_', ' ')}: ${score}/100`)
      .join('\n');
  }

  /**
   * Gets emoji based on mistake impact
   */
  private getImpactEmoji(impact: string): string {
    switch (impact) {
      case 'HIGH': return '🔴';
      case 'MEDIUM': return '🟡';
      case 'LOW': return '🟢';
      default: return '⚪';
    }
  }

  /**
   * Gets emoji based on recommendation priority
   */
  private getPriorityEmoji(priority: string): string {
    switch (priority) {
      case 'HIGH': return '🔥';
      case 'MEDIUM': return '⭐';
      case 'LOW': return '💡';
      default: return '💭';
    }
  }

  /**
   * Calculates engagement win rate
   */
  private calculateWinRate(engagement: any): number {
    const total = engagement.totalEngagements;
    if (total === 0) return 0;
    return Math.round((engagement.wonEngagements / total) * 100);
  }

  /**
   * Calculates revive success rate
   */
  private calculateReviveRate(reviveData: any): number {
    const total = reviveData.totalRevives;
    if (total === 0) return 0;
    return Math.round((reviveData.successfulRevives / total) * 100);
  }

  /**
   * Gets emoji based on coaching tip difficulty
   */
  private getDifficultyEmoji(difficulty: string): string {
    switch (difficulty) {
      case 'EASY': return '🟢';
      case 'MEDIUM': return '🟡';
      case 'HARD': return '🔴';
      default: return '⚪';
    }
  }

  /**
   * Gets emoji based on coaching tip category
   */
  private getCategoryEmoji(category: string): string {
    switch (category) {
      case 'IMMEDIATE': return '⚡';
      case 'SHORT_TERM': return '📈';
      case 'LONG_TERM': return '🎯';
      default: return '💡';
    }
  }
} 