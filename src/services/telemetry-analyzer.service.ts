import axios from 'axios';
import {
  TelemetryAnalysisResult,
  CriticalMistake,
  StrategyRecommendation,
  EngagementAnalysis,
  PositioningAnalysis,
  LootingAnalysis,
  TeamCoordinationAnalysis,
  OverallPerformanceRating,
  LogPlayerKillV2,
  LogPlayerMakeGroggy,
  LogPlayerPosition,
  LogPlayerTakeDamage,
  LogGameStatePeriodic,
  LogZoneUpdate,
  LogPlayerUseItem,
  LogItemPickup,
  LogPlayerRevive,
  LogVehicleRide,
  LogWeaponFireCount,
  Character,
  Location,
  WeaponEffectiveness,
  EngagementPositioning,
  ZoneManagement,
  RotationEfficiency,
  CompoundHolding,
  FinalCirclePositioning,
  LootingEfficiency,
  WeaponChoices,
  HealingManagement,
  ThrowableUsage,
  ReviveEfficiency,
  TeamSpreading,
  CommunicationEffectiveness,
  RoleDistribution,
  CategoryScores,
  StrengthsAndWeaknesses
} from '../types/pubg-telemetry.types';
import { error, info, warn } from '../utils/logger';
import { EngagementAnalyzerService } from './analyzers/engagement-analyzer.service';
import { PositioningAnalyzerService } from './analyzers/positioning-analyzer.service';

export class TelemetryAnalyzerService {
  private readonly engagementAnalyzer: EngagementAnalyzerService;
  private readonly positioningAnalyzer: PositioningAnalyzerService;

  constructor() {
    this.engagementAnalyzer = new EngagementAnalyzerService();
    this.positioningAnalyzer = new PositioningAnalyzerService();
  }

  private readonly WEAPON_CATEGORIES = {
    AR: ['AK47', 'M416', 'SCAR-L', 'M16A4', 'QBZ95', 'G36C', 'AUG', 'Beryl M762', 'Mk47 Mutant'],
    SMG: ['UMP9', 'Vector', 'Bizon', 'Tommy Gun', 'Uzi', 'MP5K', 'Skorpion', 'MP9'],
    SR: ['Kar98k', 'M24', 'AWM', 'Win94', 'SLR', 'SKS', 'Mini 14', 'Mk14 EBR', 'QBU88'],
    LMG: ['M249', 'DP-27', 'MG3'],
    Shotgun: ['S686', 'S1897', 'S12K', 'DBS'],
    Pistol: ['P92', 'P1911', 'P18C', 'Rhino', 'Deagle', 'Flare Gun'],
    DMR: ['SLR', 'SKS', 'Mini 14', 'Mk14 EBR', 'QBU88', 'VSS']
  };

  private readonly ZONE_PHASES = [
    { phase: 1, duration: 300, damagePerSecond: 0.4 },
    { phase: 2, duration: 180, damagePerSecond: 0.6 },
    { phase: 3, duration: 150, damagePerSecond: 1.5 },
    { phase: 4, duration: 120, damagePerSecond: 2.6 },
    { phase: 5, duration: 90, damagePerSecond: 4.2 },
    { phase: 6, duration: 60, damagePerSecond: 6.0 },
    { phase: 7, duration: 30, damagePerSecond: 8.5 },
    { phase: 8, duration: 30, damagePerSecond: 11.0 }
  ];

  /**
   * Analyzes telemetry for strategic recommendations
   */
  public async analyzeTelemetryData(
    telemetryUrl: string,
    teamPlayers: string[],
    matchId: string,
    teamRank: number
  ): Promise<TelemetryAnalysisResult> {
    try {
      info(`Starting telemetry analysis for match ${matchId}`);
      
      const telemetryData = await this.fetchTelemetryData(telemetryUrl);
      const analysis = this.performAnalysis(telemetryData, teamPlayers, matchId, teamRank);
      
      return analysis;
    } catch (err) {
      error(`Error analyzing telemetry data for match ${matchId}:`, err as Error);
      throw new Error(`Failed to analyze telemetry data: ${(err as Error).message}`);
    }
  }

  private async fetchTelemetryData(telemetryUrl: string): Promise<any[]> {
    try {
      const response = await axios.get(telemetryUrl, { timeout: 30000 });
      return response.data;
    } catch (err) {
      error('Failed to fetch telemetry:', err as Error);
      throw new Error('Telemetry fetch failed');
    }
  }

  private performAnalysis(
    telemetryData: any[],
    teamPlayers: string[],
    matchId: string,
    teamRank: number
  ): TelemetryAnalysisResult {
    // Filter relevant events for the team
    const filteredEvents = this.filterRelevantEvents(telemetryData, teamPlayers);

    // Use specialized analyzers
    const engagementResult = this.engagementAnalyzer.analyzeEngagements(filteredEvents, teamPlayers);
    const positioningResult = this.positioningAnalyzer.analyzePositioning(filteredEvents, teamPlayers);

    // Collect all critical mistakes
    const criticalMistakes = [
      ...engagementResult.mistakes,
      ...positioningResult.mistakes,
      ...this.analyzeTeamCoordinationMistakes(filteredEvents, teamPlayers)
    ].sort((a, b) => {
      const impactOrder = { HIGH: 3, MEDIUM: 2, LOW: 1 };
      return impactOrder[b.impact] - impactOrder[a.impact];
    });

    // Generate strategic recommendations
    const strategicRecommendations = this.generateStrategicRecommendations(filteredEvents, teamPlayers, teamRank);

    // Analyze other aspects
    const lootingAnalysis = this.analyzeLooting(filteredEvents, teamPlayers);
    const teamCoordinationAnalysis = this.analyzeTeamCoordination(filteredEvents, teamPlayers);
    const overallRating = this.calculateOverallRating(filteredEvents, teamPlayers, teamRank);

    return {
      matchId,
      teamPlayers,
      teamRank,
      analysisTimestamp: new Date().toISOString(),
      criticalMistakes,
      strategicRecommendations,
      engagementAnalysis: engagementResult.analysis,
      positioningAnalysis: positioningResult.analysis,
      lootingAnalysis,
      teamCoordinationAnalysis,
      overallRating
    };
  }

  private filterRelevantEvents(telemetryData: any[], teamPlayers: string[]): any[] {
    const relevantEventTypes = [
      'LogPlayerKillV2',
      'LogPlayerMakeGroggy',
      'LogPlayerPosition',
      'LogPlayerTakeDamage',
      'LogGameStatePeriodic',
      'LogZoneUpdate',
      'LogPlayerUseItem',
      'LogItemPickup',
      'LogPlayerRevive',
      'LogVehicleRide',
      'LogWeaponFireCount'
    ];

    return telemetryData.filter(event => {
      if (!relevantEventTypes.includes(event._T)) return false;

      // Check if event involves team members
      const eventPlayers = this.extractPlayerNamesFromEvent(event);
      return eventPlayers.some(player => teamPlayers.includes(player));
    });
  }

  private extractPlayerNamesFromEvent(event: any): string[] {
    const players: string[] = [];
    
    if (event.character?.name) players.push(event.character.name);
    if (event.victim?.name) players.push(event.victim.name);
    if (event.killer?.name) players.push(event.killer.name);
    if (event.attacker?.name) players.push(event.attacker.name);
    if (event.reviver?.name) players.push(event.reviver.name);
    if (event.dBNOMaker?.name) players.push(event.dBNOMaker.name);
    if (event.finisher?.name) players.push(event.finisher.name);

    return [...new Set(players)];
  }

  private identifyCriticalMistakes(events: any[], teamPlayers: string[]): CriticalMistake[] {
    const mistakes: CriticalMistake[] = [];

    // Analyze zone management mistakes
    mistakes.push(...this.analyzeZoneManagementMistakes(events, teamPlayers));
    
    // Analyze engagement mistakes
    mistakes.push(...this.analyzeEngagementMistakes(events, teamPlayers));
    
    // Analyze positioning mistakes
    mistakes.push(...this.analyzePositioningMistakes(events, teamPlayers));
    
    // Analyze team coordination mistakes
    mistakes.push(...this.analyzeTeamCoordinationMistakes(events, teamPlayers));

    return mistakes.sort((a, b) => {
      const impactOrder = { HIGH: 3, MEDIUM: 2, LOW: 1 };
      return impactOrder[b.impact] - impactOrder[a.impact];
    });
  }

  private analyzeZoneManagementMistakes(events: any[], teamPlayers: string[]): CriticalMistake[] {
    const mistakes: CriticalMistake[] = [];
    const zoneEvents = events.filter(e => e._T === 'LogZoneUpdate');
    const damageEvents = events.filter(e => e._T === 'LogPlayerTakeDamage' && e.damageReason === 'BluezoneFinish');

    // Check for excessive blue zone damage
    const blueZoneDamage = damageEvents
      .filter(e => teamPlayers.includes(e.victim?.name))
      .reduce((total, e) => total + (e.damage || 0), 0);

    if (blueZoneDamage > 50) {
      mistakes.push({
        type: 'ZONE_MANAGEMENT',
        timestamp: damageEvents[0]?._D || new Date().toISOString(),
        player: damageEvents[0]?.victim?.name || 'Team',
        description: `Team took ${Math.round(blueZoneDamage)} damage from blue zone`,
        impact: blueZoneDamage > 150 ? 'HIGH' : 'MEDIUM',
        recommendation: 'Rotate earlier to avoid blue zone damage. Start moving when zone timer reaches 50% remaining time.'
      });
    }

    // Check for late rotations
    const lateRotations = this.detectLateRotations(events, teamPlayers);
    if (lateRotations > 0) {
      mistakes.push({
        type: 'ZONE_MANAGEMENT',
        timestamp: new Date().toISOString(),
        player: 'Team',
        description: `${lateRotations} late rotations detected`,
        impact: lateRotations > 2 ? 'HIGH' : 'MEDIUM',
        recommendation: 'Plan rotations earlier and secure vehicles for faster movement.'
      });
    }

    return mistakes;
  }

  private analyzeEngagementMistakes(events: any[], teamPlayers: string[]): CriticalMistake[] {
    const mistakes: CriticalMistake[] = [];
    const killEvents = events.filter(e => e._T === 'LogPlayerKillV2');
    const damageEvents = events.filter(e => e._T === 'LogPlayerTakeDamage');

    // Analyze unfavorable engagements
    const teamDeaths = killEvents.filter(e => teamPlayers.includes(e.victim?.name));
    const disadvantageousEngagements = teamDeaths.filter(e => {
      const distance = e.killerDamageInfo?.distance || 0;
      const weapon = e.killerDamageInfo?.damageCauserName || '';
      
      // Long range deaths with short range weapons indicate poor positioning
      return distance > 100 && this.isShortRangeWeapon(weapon);
    });

    if (disadvantageousEngagements.length > 0) {
      mistakes.push({
        type: 'ENGAGEMENT',
        timestamp: disadvantageousEngagements[0]._D,
        player: disadvantageousEngagements[0].victim?.name || 'Team',
        description: 'Taking long-range fights with short-range weapons',
        impact: 'HIGH',
        recommendation: 'Disengage from unfavorable range fights and reposition for better angles.'
      });
    }

    // Check for third-party situations
    const thirdPartyDeaths = this.detectThirdPartySituations(events, teamPlayers);
    if (thirdPartyDeaths > 0) {
      mistakes.push({
        type: 'ENGAGEMENT',
        timestamp: new Date().toISOString(),
        player: 'Team',
        description: `${thirdPartyDeaths} deaths to third-party situations`,
        impact: 'MEDIUM',
        recommendation: 'Disengage quickly after fights and reposition to avoid third parties.'
      });
    }

    return mistakes;
  }

  private analyzePositioningMistakes(events: any[], teamPlayers: string[]): CriticalMistake[] {
    const mistakes: CriticalMistake[] = [];
    const positionEvents = events.filter(e => e._T === 'LogPlayerPosition');

    // Analyze team spreading
    const overExtensions = this.detectOverExtensions(positionEvents, teamPlayers);
    if (overExtensions > 2) {
      mistakes.push({
        type: 'POSITIONING',
        timestamp: new Date().toISOString(),
        player: 'Team',
        description: 'Team spreading too far apart, vulnerable to isolation',
        impact: 'HIGH',
        recommendation: 'Maintain 50-100m distance between teammates for mutual support.'
      });
    }

    return mistakes;
  }

  private analyzeTeamCoordinationMistakes(events: any[], teamPlayers: string[]): CriticalMistake[] {
    const mistakes: CriticalMistake[] = [];
    const reviveEvents = events.filter(e => e._T === 'LogPlayerRevive');
    const groggyEvents = events.filter(e => e._T === 'LogPlayerMakeGroggy');

    // Check for failed revives
    const teamGroggyEvents = groggyEvents.filter(e => teamPlayers.includes(e.victim?.name));
    const teamReviveEvents = reviveEvents.filter(e => teamPlayers.includes(e.victim?.name));

    const failedRevives = teamGroggyEvents.length - teamReviveEvents.length;
    if (failedRevives > 0) {
      mistakes.push({
        type: 'TEAM_COORDINATION',
        timestamp: teamGroggyEvents[0]?._D || new Date().toISOString(),
        player: 'Team',
        description: `${failedRevives} teammates died without being revived`,
        impact: 'HIGH',
        recommendation: 'Prioritize teammate revivals and provide cover during revive attempts.'
      });
    }

    return mistakes;
  }

  private generateStrategicRecommendations(
    events: any[],
    teamPlayers: string[],
    teamRank: number
  ): StrategyRecommendation[] {
    const recommendations: StrategyRecommendation[] = [];

    // Early game recommendations
    recommendations.push(...this.generateEarlyGameRecommendations(events, teamPlayers));
    
    // Mid game recommendations
    recommendations.push(...this.generateMidGameRecommendations(events, teamPlayers));
    
    // Late game recommendations
    recommendations.push(...this.generateLateGameRecommendations(events, teamPlayers, teamRank));

    // General recommendations
    recommendations.push(...this.generateGeneralRecommendations(events, teamPlayers, teamRank));

    return recommendations.sort((a, b) => {
      const priorityOrder = { HIGH: 3, MEDIUM: 2, LOW: 1 };
      return priorityOrder[b.priority] - priorityOrder[a.priority];
    });
  }

  private generateEarlyGameRecommendations(events: any[], teamPlayers: string[]): StrategyRecommendation[] {
    const recommendations: StrategyRecommendation[] = [];
    const lootEvents = events.filter(e => e._T === 'LogItemPickup');
    const firstZoneEvents = events.filter(e => e._T === 'LogZoneUpdate' && e.zoneState === 0);

    // Analyze looting efficiency
    const earlyLootTime = this.calculateEarlyLootTime(lootEvents, teamPlayers);
    if (earlyLootTime > 300) { // 5 minutes
      recommendations.push({
        category: 'EARLY_GAME',
        priority: 'HIGH',
        title: 'Improve Early Game Looting Speed',
        description: 'Team spent too much time looting in early game, missing optimal rotations',
        expectedImprovement: 'Faster rotations and better positioning for mid-game'
      });
    }

    return recommendations;
  }

  private generateMidGameRecommendations(events: any[], teamPlayers: string[]): StrategyRecommendation[] {
    const recommendations: StrategyRecommendation[] = [];
    const engagementEvents = events.filter(e => e._T === 'LogPlayerKillV2' || e._T === 'LogPlayerMakeGroggy');

    // Analyze engagement patterns
    const midGameEngagements = engagementEvents.filter(e => {
      const timestamp = new Date(e._D);
      const matchStart = new Date(events[0]._D);
      const elapsed = (timestamp.getTime() - matchStart.getTime()) / 1000;
      return elapsed > 600 && elapsed < 1800; // 10-30 minutes
    });

    if (midGameEngagements.length > 5) {
      recommendations.push({
        category: 'MID_GAME',
        priority: 'MEDIUM',
        title: 'Reduce Unnecessary Mid-Game Fights',
        description: 'Too many engagements in mid-game, leading to resource depletion',
        expectedImprovement: 'Better resource management and positioning for late game'
      });
    }

    return recommendations;
  }

  private generateLateGameRecommendations(events: any[], teamPlayers: string[], teamRank: number): StrategyRecommendation[] {
    const recommendations: StrategyRecommendation[] = [];

    if (teamRank > 10) {
      recommendations.push({
        category: 'LATE_GAME',
        priority: 'HIGH',
        title: 'Improve Final Circle Positioning',
        description: 'Team eliminated before reaching final circles',
        expectedImprovement: 'Higher placement and more consistent late-game performance'
      });
    }

    return recommendations;
  }

  private generateGeneralRecommendations(events: any[], teamPlayers: string[], teamRank: number): StrategyRecommendation[] {
    const recommendations: StrategyRecommendation[] = [];

    // Vehicle usage analysis
    const vehicleEvents = events.filter(e => e._T === 'LogVehicleRide');
    if (vehicleEvents.length < 3) {
      recommendations.push({
        category: 'GENERAL',
        priority: 'MEDIUM',
        title: 'Increase Vehicle Usage',
        description: 'Low vehicle usage may be limiting rotation options',
        expectedImprovement: 'Better rotation timing and positioning flexibility'
      });
    }

    return recommendations;
  }

  private analyzeEngagements(events: any[], teamPlayers: string[]): EngagementAnalysis {
    const killEvents = events.filter(e => e._T === 'LogPlayerKillV2');
    const groggyEvents = events.filter(e => e._T === 'LogPlayerMakeGroggy');
    const weaponFireEvents = events.filter(e => e._T === 'LogWeaponFireCount');

    const teamKills = killEvents.filter(e => teamPlayers.includes(e.killer?.name));
    const teamDeaths = killEvents.filter(e => teamPlayers.includes(e.victim?.name));
    
    const totalEngagements = teamKills.length + teamDeaths.length;
    const wonEngagements = teamKills.length;
    const lostEngagements = teamDeaths.length;

    const averageEngagementDistance = this.calculateAverageEngagementDistance(killEvents, teamPlayers);
    const weaponEffectiveness = this.analyzeWeaponEffectiveness(killEvents, weaponFireEvents, teamPlayers);
    const engagementPositioning = this.analyzeEngagementPositioning(killEvents, teamPlayers);
    const thirdPartySituations = this.detectThirdPartySituations(events, teamPlayers);

    return {
      totalEngagements,
      wonEngagements,
      lostEngagements,
      averageEngagementDistance,
      weaponEffectiveness,
      engagementPositioning,
      thirdPartySituations
    };
  }

  private analyzePositioning(events: any[], teamPlayers: string[]): PositioningAnalysis {
    const zoneEvents = events.filter(e => e._T === 'LogZoneUpdate');
    const positionEvents = events.filter(e => e._T === 'LogPlayerPosition');
    const damageEvents = events.filter(e => e._T === 'LogPlayerTakeDamage');

    const zoneManagement = this.analyzeZoneManagement(events, teamPlayers);
    const rotationEfficiency = this.analyzeRotationEfficiency(events, teamPlayers);
    const compoundHolding = this.analyzeCompoundHolding(positionEvents, teamPlayers);
    const finalCirclePositioning = this.analyzeFinalCirclePositioning(events, teamPlayers);

    return {
      zoneManagement,
      rotationEfficiency,
      compoundHolding,
      finalCirclePositioning
    };
  }

  private analyzeLooting(events: any[], teamPlayers: string[]): LootingAnalysis {
    const lootEvents = events.filter(e => e._T === 'LogItemPickup');
    const useEvents = events.filter(e => e._T === 'LogPlayerUseItem');

    const lootingEfficiency = this.analyzeLootingEfficiency(lootEvents, teamPlayers);
    const weaponChoices = this.analyzeWeaponChoices(lootEvents, teamPlayers);
    const healingManagement = this.analyzeHealingManagement(useEvents, teamPlayers);
    const throwableUsage = this.analyzeThrowableUsage(useEvents, teamPlayers);

    return {
      lootingEfficiency,
      weaponChoices,
      healingManagement,
      throwableUsage
    };
  }

  private analyzeTeamCoordination(events: any[], teamPlayers: string[]): TeamCoordinationAnalysis {
    const reviveEvents = events.filter(e => e._T === 'LogPlayerRevive');
    const positionEvents = events.filter(e => e._T === 'LogPlayerPosition');
    const killEvents = events.filter(e => e._T === 'LogPlayerKillV2');

    const reviveEfficiency = this.analyzeReviveEfficiency(reviveEvents, teamPlayers);
    const teamSpreading = this.analyzeTeamSpreading(positionEvents, teamPlayers);
    const communicationEffectiveness = this.analyzeCommunicationEffectiveness(killEvents, teamPlayers);
    const roleDistribution = this.analyzeRoleDistribution(events, teamPlayers);

    return {
      reviveEfficiency,
      teamSpreading,
      communicationEffectiveness,
      roleDistribution
    };
  }

  private calculateOverallRating(events: any[], teamPlayers: string[], teamRank: number): OverallPerformanceRating {
    const categoryScores: CategoryScores = {
      positioning: this.calculatePositioningScore(events, teamPlayers),
      engagement: this.calculateEngagementScore(events, teamPlayers),
      looting: this.calculateLootingScore(events, teamPlayers),
      teamwork: this.calculateTeamworkScore(events, teamPlayers),
      decision_making: this.calculateDecisionMakingScore(events, teamPlayers, teamRank)
    };

    const overallScore = Object.values(categoryScores).reduce((sum, score) => sum + score, 0) / 5;
    const improvementPotential = Math.max(0, 100 - overallScore);

    const strengthsAndWeaknesses = this.identifyStrengthsAndWeaknesses(categoryScores);

    return {
      overallScore: Math.round(overallScore),
      categoryScores,
      improvementPotential: Math.round(improvementPotential),
      strengthsAndWeaknesses
    };
  }

  private isShortRangeWeapon(weapon: string): boolean {
    return this.WEAPON_CATEGORIES.SMG.some(w => weapon.includes(w)) ||
           this.WEAPON_CATEGORIES.Shotgun.some(w => weapon.includes(w));
  }

  private detectLateRotations(events: any[], teamPlayers: string[]): number {
    // Implementation for detecting late rotations
    return 0; // Placeholder
  }

  private detectThirdPartySituations(events: any[], teamPlayers: string[]): number {
    // Implementation for detecting third party situations
    return 0; // Placeholder
  }

  private detectOverExtensions(positionEvents: any[], teamPlayers: string[]): number {
    // Implementation for detecting team over-extensions
    return 0; // Placeholder
  }

  private calculateEarlyLootTime(lootEvents: any[], teamPlayers: string[]): number {
    // Implementation for calculating early looting time
    return 0; // Placeholder
  }

  private calculateAverageEngagementDistance(killEvents: any[], teamPlayers: string[]): number {
    const distances = killEvents
      .filter(e => teamPlayers.includes(e.killer?.name))
      .map(e => e.killerDamageInfo?.distance || 0)
      .filter(d => d > 0);

    return distances.length > 0 ? distances.reduce((sum, d) => sum + d, 0) / distances.length : 0;
  }

  private analyzeWeaponEffectiveness(killEvents: any[], weaponFireEvents: any[], teamPlayers: string[]): WeaponEffectiveness[] {
    // Implementation for weapon effectiveness analysis
    return []; // Placeholder
  }

  private analyzeEngagementPositioning(killEvents: any[], teamPlayers: string[]): EngagementPositioning {
    return {
      highGroundAdvantage: 0,
      coverUsage: 0,
      overExtensions: 0,
      recommendation: 'Maintain high ground positions during engagements'
    };
  }

  private analyzeZoneManagement(events: any[], teamPlayers: string[]): ZoneManagement {
    return {
      lateRotations: 0,
      blueZoneDamage: 0,
      earlyRotations: 0,
      rotationTiming: 'GOOD',
      recommendation: 'Continue current zone management strategy'
    };
  }

  private analyzeRotationEfficiency(events: any[], teamPlayers: string[]): RotationEfficiency {
    return {
      averageRotationTime: 0,
      routeEfficiency: 0,
      vehicleUsage: 0,
      recommendation: 'Use vehicles more frequently for rotations'
    };
  }

  private analyzeCompoundHolding(positionEvents: any[], teamPlayers: string[]): CompoundHolding {
    return {
      compoundsHeld: 0,
      averageHoldTime: 0,
      defensiveEffectiveness: 0,
      recommendation: 'Hold compounds longer for better positioning'
    };
  }

  private analyzeFinalCirclePositioning(events: any[], teamPlayers: string[]): FinalCirclePositioning {
    return {
      finalCircleRank: 0,
      centerControl: false,
      edgePlay: false,
      recommendation: 'Focus on center control in final circles'
    };
  }

  private analyzeLootingEfficiency(lootEvents: any[], teamPlayers: string[]): LootingEfficiency {
    return {
      earlyGameLootTime: 0,
      midGameUpgrades: 0,
      lateGameOptimization: 0,
      recommendation: 'Optimize looting speed in early game'
    };
  }

  private analyzeWeaponChoices(lootEvents: any[], teamPlayers: string[]): WeaponChoices {
    return {
      primaryWeapon: 'Unknown',
      secondaryWeapon: 'Unknown',
      weaponSynergy: 0,
      attachmentOptimization: 0,
      recommendation: 'Consider weapon synergy for different ranges'
    };
  }

  private analyzeHealingManagement(useEvents: any[], teamPlayers: string[]): HealingManagement {
    return {
      healingItemsUsed: 0,
      healingEfficiency: 0,
      lowHealthSituations: 0,
      recommendation: 'Use healing items more proactively'
    };
  }

  private analyzeThrowableUsage(useEvents: any[], teamPlayers: string[]): ThrowableUsage {
    return {
      grenadesUsed: 0,
      smokeUsage: 0,
      flashbangUsage: 0,
      effectiveness: 0,
      recommendation: 'Increase throwable usage for tactical advantage'
    };
  }

  private analyzeReviveEfficiency(reviveEvents: any[], teamPlayers: string[]): ReviveEfficiency {
    const teamRevives = reviveEvents.filter(e => teamPlayers.includes(e.victim?.name));
    const teamGroggyEvents = reviveEvents.filter(e => teamPlayers.includes(e.victim?.name));
    
    const totalRevives = teamRevives.length;
    const successfulRevives = teamRevives.filter(e => e.result === 'revived').length;
    
    const reviveTimes = teamRevives
      .filter(e => e.reviveTime)
      .map(e => e.reviveTime);
    
    const averageReviveTime = reviveTimes.length > 0 
      ? reviveTimes.reduce((sum, time) => sum + time, 0) / reviveTimes.length 
      : 0;

    let recommendation = 'Practice safe revive positioning';
    if (totalRevives === 0) {
      recommendation = 'No revive situations occurred';
    } else if (successfulRevives / totalRevives < 0.7) {
      recommendation = 'Improve revive success rate - provide better cover during revives';
    } else if (averageReviveTime > 10) {
      recommendation = 'Reduce revive time - find safer positions for revives';
    } else {
      recommendation = 'Good revive efficiency - maintain current approach';
    }

    return {
      totalRevives,
      successfulRevives,
      averageReviveTime: Math.round(averageReviveTime * 10) / 10,
      recommendation
    };
  }

  private analyzeTeamSpreading(positionEvents: any[], teamPlayers: string[]): TeamSpreading {
    const teamPositions = positionEvents.filter(e => teamPlayers.includes(e.character?.name));
    
    if (teamPositions.length < 2) {
      return {
        averageTeamDistance: 0,
        optimalSpreadMaintained: 0,
        overExtensions: 0,
        recommendation: 'Insufficient position data for analysis'
      };
    }

    // Group positions by timestamp to calculate distances at each moment
    const positionsByTime = new Map<string, any[]>();
    teamPositions.forEach(pos => {
      const timeKey = pos._D;
      if (!positionsByTime.has(timeKey)) {
        positionsByTime.set(timeKey, []);
      }
      positionsByTime.get(timeKey)!.push(pos);
    });

    let totalDistanceSum = 0;
    let validMeasurements = 0;
    let optimalSpreadTime = 0;
    let overExtensionCount = 0;

    positionsByTime.forEach(positions => {
      if (positions.length >= 2) {
        const distances: number[] = [];
        
        // Calculate distances between all team members
        for (let i = 0; i < positions.length; i++) {
          for (let j = i + 1; j < positions.length; j++) {
            const pos1 = positions[i].character?.location;
            const pos2 = positions[j].character?.location;
            
            if (pos1 && pos2) {
              const distance = Math.sqrt(
                Math.pow(pos1.x - pos2.x, 2) + 
                Math.pow(pos1.y - pos2.y, 2)
              );
              distances.push(distance / 100); // Convert to meters
            }
          }
        }

        if (distances.length > 0) {
          const avgDistance = distances.reduce((sum, d) => sum + d, 0) / distances.length;
          totalDistanceSum += avgDistance;
          validMeasurements++;

          // Check if team spread is optimal (50-150m)
          if (avgDistance >= 50 && avgDistance <= 150) {
            optimalSpreadTime++;
          }

          // Check for over-extensions (>200m)
          if (distances.some(d => d > 200)) {
            overExtensionCount++;
          }
        }
      }
    });

    const averageTeamDistance = validMeasurements > 0 ? totalDistanceSum / validMeasurements : 0;
    const optimalSpreadMaintained = validMeasurements > 0 ? (optimalSpreadTime / validMeasurements) * 100 : 0;

    let recommendation = 'Maintain optimal team spacing';
    if (averageTeamDistance < 30) {
      recommendation = 'Team is too clustered - spread out to avoid area damage';
    } else if (averageTeamDistance > 150) {
      recommendation = 'Team is too spread out - stay closer for mutual support';
    } else if (overExtensionCount > validMeasurements * 0.3) {
      recommendation = 'Reduce over-extensions - coordinate movement better';
    } else {
      recommendation = 'Good team spacing - maintain current coordination';
    }

    return {
      averageTeamDistance: Math.round(averageTeamDistance),
      optimalSpreadMaintained: Math.round(optimalSpreadMaintained),
      overExtensions: overExtensionCount,
      recommendation
    };
  }

  private analyzeCommunicationEffectiveness(killEvents: any[], teamPlayers: string[]): CommunicationEffectiveness {
    const teamKills = killEvents.filter(e => teamPlayers.includes(e.killer?.name));
    const teamDeaths = killEvents.filter(e => teamPlayers.includes(e.victim?.name));
    
    // Analyze coordinated engagements (kills within 30 seconds of each other)
    let coordinatedEngagements = 0;
    const killTimes = teamKills.map(k => new Date(k._D).getTime());
    
    for (let i = 0; i < killTimes.length - 1; i++) {
      if (killTimes[i + 1] - killTimes[i] <= 30000) { // 30 seconds
        coordinatedEngagements++;
      }
    }

    // Analyze simultaneous knocks/kills (within 5 seconds)
    let simultaneousKnocks = 0;
    for (let i = 0; i < killTimes.length - 1; i++) {
      if (killTimes[i + 1] - killTimes[i] <= 5000) { // 5 seconds
        simultaneousKnocks++;
      }
    }

    // Calculate focus fire efficiency
    const totalKills = teamKills.length;
    const focusFireEfficiency = totalKills > 0 ? (simultaneousKnocks / totalKills) * 100 : 0;

    let recommendation = 'Improve communication for coordinated engagements';
    if (coordinatedEngagements === 0 && totalKills > 1) {
      recommendation = 'Work on coordinating attacks - use voice comms to focus fire';
    } else if (focusFireEfficiency < 30) {
      recommendation = 'Improve focus fire - all shoot the same target simultaneously';
    } else if (focusFireEfficiency >= 60) {
      recommendation = 'Excellent coordination - maintain current communication level';
    } else {
      recommendation = 'Good coordination - work on timing simultaneous attacks';
    }

    return {
      coordinatedEngagements,
      simultaneousKnocks,
      focusFireEfficiency: Math.round(focusFireEfficiency),
      recommendation
    };
  }

  private analyzeRoleDistribution(events: any[], teamPlayers: string[]): RoleDistribution {
    const killEvents = events.filter(e => e._T === 'LogPlayerKillV2');
    const damageEvents = events.filter(e => e._T === 'LogPlayerTakeDamage');
    const reviveEvents = events.filter(e => e._T === 'LogPlayerRevive');
    const lootEvents = events.filter(e => e._T === 'LogItemPickup');

    // Analyze player statistics
    const playerStats = new Map<string, {
      kills: number;
      damage: number;
      revives: number;
      looting: number;
    }>();

    teamPlayers.forEach(player => {
      playerStats.set(player, { kills: 0, damage: 0, revives: 0, looting: 0 });
    });

    // Count kills
    killEvents.filter(e => teamPlayers.includes(e.killer?.name)).forEach(e => {
      const stats = playerStats.get(e.killer.name);
      if (stats) stats.kills++;
    });

    // Count damage dealt
    damageEvents.filter(e => teamPlayers.includes(e.attacker?.name)).forEach(e => {
      const stats = playerStats.get(e.attacker.name);
      if (stats) stats.damage += e.damageInfo?.damage || 0;
    });

    // Count revives performed
    reviveEvents.filter(e => teamPlayers.includes(e.reviver?.name)).forEach(e => {
      const stats = playerStats.get(e.reviver.name);
      if (stats) stats.revives++;
    });

    // Count looting activity
    lootEvents.filter(e => teamPlayers.includes(e.character?.name)).forEach(e => {
      const stats = playerStats.get(e.character.name);
      if (stats) stats.looting++;
    });

    // Determine roles based on statistics
    const sortedByKills = Array.from(playerStats.entries()).sort((a, b) => b[1].kills - a[1].kills);
    const sortedByDamage = Array.from(playerStats.entries()).sort((a, b) => b[1].damage - a[1].damage);
    const sortedByRevives = Array.from(playerStats.entries()).sort((a, b) => b[1].revives - a[1].revives);

    const fragger = sortedByKills[0] ? sortedByKills[0][0] : teamPlayers[0] || 'Unknown';
    const pointMan = sortedByDamage[0] ? sortedByDamage[0][0] : teamPlayers[0] || 'Unknown';
    const support = sortedByRevives[0] ? sortedByRevives[0][0] : teamPlayers[1] || 'Unknown';
    const igl = teamPlayers[0] || 'Unknown'; // IGL is hard to determine from telemetry

    // Calculate role effectiveness based on how well-defined the roles are
    const totalKills = sortedByKills.reduce((sum, [, stats]) => sum + stats.kills, 0);
    const topFraggerKills = sortedByKills[0] ? sortedByKills[0][1].kills : 0;
    const killDistribution = totalKills > 0 ? (topFraggerKills / totalKills) * 100 : 0;

    let roleEffectiveness = 50; // Base score
    
    // Bonus for clear role separation
    if (killDistribution > 40) roleEffectiveness += 20; // Clear fragger
    if (sortedByRevives[0] && sortedByRevives[0][1].revives > 1) roleEffectiveness += 15; // Active support
    if (playerStats.size >= 2) roleEffectiveness += 15; // Multiple players contributing

    roleEffectiveness = Math.min(100, roleEffectiveness);

    let recommendation = 'Define clearer roles for team members';
    if (roleEffectiveness >= 80) {
      recommendation = 'Excellent role distribution - maintain current assignments';
    } else if (roleEffectiveness >= 60) {
      recommendation = 'Good role clarity - fine-tune individual responsibilities';
    } else if (totalKills === 0) {
      recommendation = 'No combat data available for role analysis';
    } else {
      recommendation = 'Improve role definition - assign specific responsibilities to each player';
    }

    return {
      pointMan,
      support,
      fragger,
      igl,
      roleEffectiveness: Math.round(roleEffectiveness),
      recommendation
    };
  }

  private calculatePositioningScore(events: any[], teamPlayers: string[]): number {
    // Implementation for positioning score calculation
    return 75; // Placeholder
  }

  private calculateEngagementScore(events: any[], teamPlayers: string[]): number {
    // Implementation for engagement score calculation
    return 70; // Placeholder
  }

  private calculateLootingScore(events: any[], teamPlayers: string[]): number {
    // Implementation for looting score calculation
    return 80; // Placeholder
  }

  private calculateTeamworkScore(events: any[], teamPlayers: string[]): number {
    // Get team coordination analysis data
    const reviveEvents = events.filter(e => e._T === 'LogPlayerRevive');
    const positionEvents = events.filter(e => e._T === 'LogPlayerPosition');
    const killEvents = events.filter(e => e._T === 'LogPlayerKillV2');

    const reviveEfficiency = this.analyzeReviveEfficiency(reviveEvents, teamPlayers);
    const teamSpreading = this.analyzeTeamSpreading(positionEvents, teamPlayers);
    const communicationEffectiveness = this.analyzeCommunicationEffectiveness(killEvents, teamPlayers);
    const roleDistribution = this.analyzeRoleDistribution(events, teamPlayers);

    let score = 0;
    let components = 0;

    // Revive efficiency component (25% of score)
    if (reviveEfficiency.totalRevives > 0) {
      const reviveSuccessRate = (reviveEfficiency.successfulRevives / reviveEfficiency.totalRevives) * 100;
      score += reviveSuccessRate * 0.25;
      components += 0.25;
    }

    // Team spreading component (25% of score)
    if (teamSpreading.averageTeamDistance > 0) {
      const spreadingScore = Math.max(0, 100 - Math.abs(teamSpreading.optimalSpreadMaintained - 75)); // Optimal around 75%
      score += spreadingScore * 0.25;
      components += 0.25;
    }

    // Communication effectiveness component (25% of score)
    score += communicationEffectiveness.focusFireEfficiency * 0.25;
    components += 0.25;

    // Role distribution component (25% of score)
    score += roleDistribution.roleEffectiveness * 0.25;
    components += 0.25;

    // If no data available, use a base score
    if (components === 0) {
      return 50; // Neutral score when no data
    }

    // Normalize score based on available components
    const normalizedScore = score / components;

    return Math.round(Math.max(0, Math.min(100, normalizedScore)));
  }

  private calculateDecisionMakingScore(events: any[], teamPlayers: string[], teamRank: number): number {
    // Implementation for decision making score calculation
    return Math.max(20, 100 - teamRank * 2); // Placeholder based on rank
  }

  private identifyStrengthsAndWeaknesses(scores: CategoryScores): StrengthsAndWeaknesses {
    const scoreEntries = Object.entries(scores).sort(([,a], [,b]) => b - a);
    
    const strengths = scoreEntries
      .filter(([,score]) => score >= 80)
      .map(([category]) => category.replace('_', ' '));

    const weaknesses = scoreEntries
      .filter(([,score]) => score < 60)
      .map(([category]) => category.replace('_', ' '));

    const priorityImprovements = weaknesses.slice(0, 3);

    return {
      strengths,
      weaknesses,
      priorityImprovements
    };
  }
} 