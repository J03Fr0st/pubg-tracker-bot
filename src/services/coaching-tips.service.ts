import { TelemetryAnalysisResult, CriticalMistake, StrategyRecommendation } from '../types/pubg-telemetry.types';

export interface CoachingTip {
  category: 'IMMEDIATE' | 'SHORT_TERM' | 'LONG_TERM';
  priority: 'HIGH' | 'MEDIUM' | 'LOW';
  title: string;
  description: string;
  actionSteps: string[];
  expectedTimeframe: string;
  difficulty: 'EASY' | 'MEDIUM' | 'HARD';
}

export class CoachingTipsService {
  /**
   * Generates personalized coaching tips based on telemetry analysis
   */
  public generateCoachingTips(analysis: TelemetryAnalysisResult): CoachingTip[] {
    const tips: CoachingTip[] = [];

    // Generate tips based on critical mistakes
    tips.push(...this.generateMistakeBasedTips(analysis.criticalMistakes));

    // Generate tips based on performance scores
    tips.push(...this.generatePerformanceBasedTips(analysis));

    // Generate tips based on team rank
    tips.push(...this.generateRankBasedTips(analysis.teamRank));

    // Generate tips based on specific weaknesses
    tips.push(...this.generateWeaknessBasedTips(analysis.overallRating.strengthsAndWeaknesses.weaknesses));

    return tips.sort((a, b) => {
      const priorityOrder = { HIGH: 3, MEDIUM: 2, LOW: 1 };
      const categoryOrder = { IMMEDIATE: 3, SHORT_TERM: 2, LONG_TERM: 1 };
      
      if (priorityOrder[a.priority] !== priorityOrder[b.priority]) {
        return priorityOrder[b.priority] - priorityOrder[a.priority];
      }
      
      return categoryOrder[b.category] - categoryOrder[a.category];
    }).slice(0, 10); // Return top 10 tips
  }

  /**
   * Generates tips based on critical mistakes
   */
  private generateMistakeBasedTips(mistakes: CriticalMistake[]): CoachingTip[] {
    const tips: CoachingTip[] = [];

    const zoneManagementMistakes = mistakes.filter(m => m.type === 'ZONE_MANAGEMENT');
    if (zoneManagementMistakes.length > 0) {
      tips.push({
        category: 'IMMEDIATE',
        priority: 'HIGH',
        title: 'Master Zone Rotation Timing',
        description: 'Your team is taking too much blue zone damage and rotating too late',
        actionSteps: [
          'Start rotating when zone timer shows 60% remaining time',
          'Always secure a vehicle early game for faster rotations',
          'Memorize common vehicle spawn locations on each map',
          'Practice identifying safe rotation routes during fights'
        ],
        expectedTimeframe: '1-2 games',
        difficulty: 'EASY'
      });
    }

    const engagementMistakes = mistakes.filter(m => m.type === 'ENGAGEMENT');
    if (engagementMistakes.length > 0) {
      tips.push({
        category: 'SHORT_TERM',
        priority: 'HIGH',
        title: 'Improve Fight Selection and Positioning',
        description: 'Taking unfavorable engagements and losing winnable fights',
        actionSteps: [
          'Only engage when you have positional advantage (high ground, cover)',
          'Match your weapon to the engagement range (SMG <50m, AR 50-200m, DMR >200m)',
          'Always have an escape plan before starting a fight',
          'Disengage immediately if third-partied - use smoke grenades'
        ],
        expectedTimeframe: '3-5 games',
        difficulty: 'MEDIUM'
      });
    }

    const teamCoordMistakes = mistakes.filter(m => m.type === 'TEAM_COORDINATION');
    if (teamCoordMistakes.length > 0) {
      tips.push({
        category: 'SHORT_TERM',
        priority: 'MEDIUM',
        title: 'Enhance Team Communication',
        description: 'Team members are dying without proper support',
        actionSteps: [
          'Always call out enemy positions with precise directions',
          'Prioritize reviving teammates - provide cover during revives',
          'Maintain 50-100m spacing between teammates',
          'Practice focus fire - all shoot the same target'
        ],
        expectedTimeframe: '2-3 games',
        difficulty: 'MEDIUM'
      });
    }

    return tips;
  }

  /**
   * Generates tips based on overall performance scores
   */
  private generatePerformanceBasedTips(analysis: TelemetryAnalysisResult): CoachingTip[] {
    const tips: CoachingTip[] = [];
    const scores = analysis.overallRating.categoryScores;

    if (scores.positioning < 60) {
      tips.push({
        category: 'LONG_TERM',
        priority: 'HIGH',
        title: 'Master Map Positioning and Rotations',
        description: 'Poor positioning is limiting your team\'s potential',
        actionSteps: [
          'Study final circle patterns on each map',
          'Learn common compound positions and their advantages',
          'Practice edge-of-zone rotations to avoid other teams',
          'Watch professional player streams to learn positioning'
        ],
        expectedTimeframe: '1-2 weeks',
        difficulty: 'HARD'
      });
    }

    if (scores.engagement < 60) {
      tips.push({
        category: 'LONG_TERM',
        priority: 'HIGH',
        title: 'Develop Combat Fundamentals',
        description: 'Low engagement scores indicate mechanical skill issues',
        actionSteps: [
          'Spend 30 minutes daily in training mode practicing recoil control',
          'Learn spray patterns for your main weapons (M416, AKM)',
          'Practice peeking techniques and pre-aiming common angles',
          'Work on crosshair placement - keep it at head level'
        ],
        expectedTimeframe: '2-3 weeks',
        difficulty: 'HARD'
      });
    }

    if (scores.teamwork < 60) {
      tips.push({
        category: 'SHORT_TERM',
        priority: 'MEDIUM',
        title: 'Develop Team Synergy',
        description: 'Individual play is holding back team potential',
        actionSteps: [
          'Assign specific roles: IGL, fragger, support, scout',
          'Practice coordinated pushes in training mode',
          'Develop callout system for each map',
          'Review gameplay together and discuss mistakes'
        ],
        expectedTimeframe: '1 week',
        difficulty: 'MEDIUM'
      });
    }

    return tips;
  }

  /**
   * Generates tips based on team rank
   */
  private generateRankBasedTips(teamRank: number): CoachingTip[] {
    const tips: CoachingTip[] = [];

    if (teamRank > 50) {
      tips.push({
        category: 'IMMEDIATE',
        priority: 'HIGH',
        title: 'Focus on Survival Over Kills',
        description: 'Early elimination is preventing skill development',
        actionSteps: [
          'Land in medium-populated areas, not hot drops',
          'Avoid unnecessary fights in early/mid game',
          'Prioritize positioning over chasing kills',
          'Play for top 10 consistently before aggressive plays'
        ],
        expectedTimeframe: 'Next game',
        difficulty: 'EASY'
      });
    } else if (teamRank > 20) {
      tips.push({
        category: 'SHORT_TERM',
        priority: 'HIGH',
        title: 'Master Late Game Scenarios',
        description: 'Good early game but struggling in final circles',
        actionSteps: [
          'Practice final circle positioning in custom games',
          'Learn to read zone movements and anticipate next circles',
          'Master utility usage (smokes, grenades) for late game',
          'Develop patience - let other teams fight first'
        ],
        expectedTimeframe: '5-7 games',
        difficulty: 'MEDIUM'
      });
    } else if (teamRank > 10) {
      tips.push({
        category: 'LONG_TERM',
        priority: 'MEDIUM',
        title: 'Optimize for Victory Conditions',
        description: 'Consistent top 10 performance, ready for advanced tactics',
        actionSteps: [
          'Study zone probability patterns for each map',
          'Learn advanced movement techniques (wall jumps, crouch jumping)',
          'Practice vehicle plays and rotations',
          'Analyze professional team strategies'
        ],
        expectedTimeframe: '2-3 weeks',
        difficulty: 'HARD'
      });
    }

    return tips;
  }

  /**
   * Generates tips based on identified weaknesses
   */
  private generateWeaknessBasedTips(weaknesses: string[]): CoachingTip[] {
    const tips: CoachingTip[] = [];

    weaknesses.forEach(weakness => {
      switch (weakness.toLowerCase()) {
        case 'decision making':
          tips.push({
            category: 'LONG_TERM',
            priority: 'HIGH',
            title: 'Improve Strategic Decision Making',
            description: 'Poor decision making is costing games',
            actionSteps: [
              'Always ask "What do we gain vs what do we risk?" before decisions',
              'Designate an In-Game Leader (IGL) to make final calls',
              'Practice scenario-based decision making in custom games',
              'Review VODs to identify decision points and alternatives'
            ],
            expectedTimeframe: '2-3 weeks',
            difficulty: 'HARD'
          });
          break;

        case 'positioning':
          tips.push({
            category: 'SHORT_TERM',
            priority: 'HIGH',
            title: 'Master Strategic Positioning',
            description: 'Poor positioning is leading to unfavorable fights',
            actionSteps: [
              'Always fight from high ground when possible',
              'Control building edges and avoid open field fights',
              'Use natural cover (trees, rocks) during rotations',
              'Practice compound clearing and defensive positioning'
            ],
            expectedTimeframe: '1 week',
            difficulty: 'MEDIUM'
          });
          break;

        case 'engagement':
          tips.push({
            category: 'IMMEDIATE',
            priority: 'HIGH',
            title: 'Optimize Combat Engagement Rules',
            description: 'Taking fights at wrong times and ranges',
            actionSteps: [
              'Only engage within your weapon\'s optimal range',
              'Always have cover within 5 meters before peeking',
              'Count enemies before engaging - avoid 1v2+ situations',
              'Disengage if you don\'t knock someone in first 10 seconds'
            ],
            expectedTimeframe: 'Next game',
            difficulty: 'EASY'
          });
          break;

        case 'looting':
          tips.push({
            category: 'IMMEDIATE',
            priority: 'MEDIUM',
            title: 'Optimize Looting Efficiency',
            description: 'Spending too much time looting instead of positioning',
            actionSteps: [
              'Set a 5-minute timer for initial looting phase',
              'Prioritize: weapon > armor > healing > attachments',
              'Share surplus items with teammates immediately',
              'Avoid looting in open areas - move to cover first'
            ],
            expectedTimeframe: 'Next game',
            difficulty: 'EASY'
          });
          break;

        case 'teamwork':
          tips.push({
            category: 'SHORT_TERM',
            priority: 'MEDIUM',
            title: 'Build Team Coordination',
            description: 'Lack of coordination is reducing team effectiveness',
            actionSteps: [
              'Practice synchronized peeks and pushes',
              'Develop standard callouts for common positions',
              'Always trade teammates - don\'t let them fight alone',
              'Use voice activation for faster communication'
            ],
            expectedTimeframe: '3-5 games',
            difficulty: 'MEDIUM'
          });
          break;
      }
    });

    return tips;
  }
} 